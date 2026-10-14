import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { payrollPeriods, uploadSessions, users } from "@saas/db";
import { editorProcedure, protectedProcedure, router } from "../trpc";
import { validateRows } from "../upload/validate";
import { processUpload } from "../upload/processor";

const PeriodType = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);
const PeriodStatus = z.enum(["processing", "ready", "error"]);

const IngestMapping = z.object({
  sourceColumn: z.string().min(1),
  mappedComponent: z.string(),
  isEmployeeId: z.boolean(),
  isEmployeeName: z.boolean(),
  isDepartment: z.boolean(),
  isGrossSalary: z.boolean(),
  isNetSalary: z.boolean(),
});

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/**
 * Turns an ingest failure into something a person can act on.
 *
 * tRPC sends an uncaught error's message to the client, so a raw driver error
 * surfaced in the upload dialog verbatim — a real upload failed with
 * `relation "period_component_totals" does not exist`, which says nothing to
 * whoever is holding the spreadsheet. Finding U15 made the same point about the
 * annual page's error boundary: the detail belongs in the server log, not on
 * screen.
 */
function describeIngestFailure(cause: unknown): string {
  const code = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  const message = cause instanceof Error ? cause.message : String(cause);

  // 42P01 undefined_table. The deploy is ahead of its database: the code
  // expects a table that the pending migrations have not created yet.
  if (code === "42P01" || /relation "[^"]+" does not exist/i.test(message)) {
    return "This database is missing tables that the application needs. Apply the pending migrations, then import again. Nothing was saved.";
  }

  return "The import could not be completed, and nothing was saved. Please try again.";
}

export const payrollPeriodsRouter = router({
  list: protectedProcedure
    .input(z.object({
      periodType: PeriodType.optional(),
      status: PeriodStatus.optional(),
      search: z.string().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const filters = [eq(payrollPeriods.companyId, currentUser.companyId)];
      if (input.periodType) filters.push(eq(payrollPeriods.periodType, input.periodType));
      if (input.status) filters.push(eq(payrollPeriods.status, input.status));
      if (input.search) filters.push(like(payrollPeriods.sourceFilename, `%${input.search}%`));

      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(payrollPeriods)
          .where(and(...filters))
          .orderBy(desc(payrollPeriods.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(payrollPeriods)
          .where(and(...filters)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const period = await ctx.db.query.payrollPeriods.findFirst({
        where: eq(payrollPeriods.id, input.id),
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });
      return period;
    }),

  // `create` was removed (finding 4b). It inserted a period with
  // `status: "ready"` from totals alone — no `employee_snapshots`, no
  // `period_component_totals` — so the period was visible to the annual
  // queries, made its year appear in the year selector, and contributed
  // nothing to any figure. Nothing called it. `ingest` below is the supported
  // path: it writes the rows and the aggregates before marking the period
  // ready, which is the ordering that makes a period never visible without
  // its totals.

  /**
   * Ingests a parsed payroll file: validate, then write the period, the
   * employee snapshots and the per-period aggregates (step 3 of
   * docs/ANNUAL_PAGE_FIX_PLAN.md).
   *
   * `processUpload` and `validateRows` already existed and were called from
   * nowhere — the upload modal faked the whole thing with a `setTimeout` and
   * kept the result in a React context, so no upload ever reached Postgres and
   * the annual dashboard had nothing to read. This is the missing connection.
   *
   * An `editorProcedure`: writing a period is a company-wide write, and
   * `ctx.companyId` comes from the middleware so the rows cannot land on
   * another tenant.
   */
  ingest: editorProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(20000),
      mappings: z.array(IngestMapping).min(1),
      periodType: PeriodType,
      periodStart: ISO_DATE,
      periodEnd: ISO_DATE,
      currencyCode: z.string().length(3).default("USD"),
      filename: z.string().min(1).max(500),
      uploadSessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.periodEnd < input.periodStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The period end date is before its start date.",
        });
      }
      if (!input.mappings.some((m) => m.isEmployeeId || m.isEmployeeName)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Map a column to the employee ID or employee name before importing.",
        });
      }

      // Re-validated server-side: the browser's own check is a convenience, not
      // a guarantee, and these rows arrive from the client.
      const validation = validateRows(input.rows, input.mappings);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${validation.errors.length} row(s) could not be imported. First problem: ${validation.errors[0]?.message ?? "unknown"}`,
        });
      }

      try {
        const result = await processUpload({
          db: ctx.db,
          rows: input.rows,
          mappings: input.mappings,
          companyId: ctx.companyId,
          periodType: input.periodType,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          currencyCode: validation.detectedCurrency ?? input.currencyCode,
          filename: input.filename,
          uploadSessionId: input.uploadSessionId,
        });

        return { ...result, warnings: validation.warnings };
      } catch (cause) {
        console.error("payrollPeriods.ingest failed:", cause);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: describeIngestFailure(cause),
          cause,
        });
      }
    }),

  /**
   * Deleting a period cascades to its snapshots and aggregates, so it is a
   * company-wide write and has to be scoped.
   *
   * This matched on id alone (finding 4a), which let any signed-in user delete
   * another tenant's period given its UUID. Harmless only because no UI
   * reached it; step 4 points the periods page at the server, so it is live
   * now and the scope is a precondition rather than a tidy-up.
   */
  delete: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(payrollPeriods)
        .where(and(
          eq(payrollPeriods.id, input.id),
          eq(payrollPeriods.companyId, ctx.companyId),
        ))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });
      return deleted;
    }),

  /**
   * Backs the "Clear All" button, which promised to delete every period and
   * its employee data but only ever emptied a React context. Scoped to the
   * caller's own company.
   */
  deleteAll: editorProcedure.mutation(async ({ ctx }) => {
    const deleted = await ctx.db.delete(payrollPeriods)
      .where(eq(payrollPeriods.companyId, ctx.companyId))
      .returning({ id: payrollPeriods.id });
    return { deleted: deleted.length };
  }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      filename: z.string().min(1),
      contentType: z.string().default("application/octet-stream"),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const fileKey = `${currentUser.companyId}/${Date.now()}-${input.filename}`;

      const [session] = await ctx.db.insert(uploadSessions).values({
        companyId: currentUser.companyId,
        filename: input.filename,
        fileKey,
        status: "processing",
      }).returning();

      return { uploadSessionId: session.id, fileKey };
    }),
});
