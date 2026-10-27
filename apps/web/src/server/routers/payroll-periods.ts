import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { annualAuditLog, componentCategories, payrollPeriods, uploadSessions, users } from "@saas/db";
import { ColumnRole } from "@saas/types";
import {
  classifyComponent,
  isTotalColumn,
  minorUnits,
  roundToMinorUnits,
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  type Category,
} from "@saas/payroll-core";
import {
  editorProcedure,
  memberProcedure,
  protectedProcedure,
  router,
  type MemberContext,
  type ProtectedContext,
} from "../trpc";
import { parseRows } from "../parse-rows";
import { CategoryEnum } from "../categories";
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
  /**
   * Step 9: the same two roles a saved mapping carries. Both nullish, so a
   * client built before step 9 still ingests, and the enum rejects a snapshot
   * field the processor does not know — it switches on this value, and a typo
   * would otherwise drop the column silently.
   */
  ...ColumnRole,
  /**
   * Step 11b: the category the admin chose for a column the classifier could
   * not place. Nullish, so a client that has nothing to answer still ingests;
   * the gate refuses an *unanswered* ambiguous column rather than a missing
   * field.
   */
  resolvedCategory: CategoryEnum.nullish(),
});

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/** Step 4: one aggregate row behind the periods list's check badge. */
const ComponentTotalRowSchema = z.object({
  payrollPeriodId: z.string().uuid(),
  componentKey: z.string(),
  total: z.string(),
});

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

      return {
        data,
        total: Number(total[0].count),
        page: input.page,
        pageSize: input.pageSize,
        // Step 4: the check status per period, so history is visible without
        // re-uploading. Display only — the gate is the wizard.
        checks: await periodChecks(ctx.db, data),
      };
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
   * Step 11b: the component keys this company has already decided.
   *
   * The wizard needs these on the mapping step, before `checkData` runs, so a
   * column whose question was answered on a previous upload is not asked about
   * again. `annual.listComponentCategories` cannot serve it: that procedure
   * derives a year from the company's periods and returns nothing when there
   * are none, which is precisely the first-upload case this has to work for.
   *
   * One indexed select on the unique key, returning keys and categories only.
   */
  answeredComponents: memberProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        componentKey: componentCategories.componentKey,
        category: componentCategories.category,
      })
      .from(componentCategories)
      .where(eq(componentCategories.companyId, ctx.companyId));

    const answers: Record<string, string> = {};
    for (const row of rows) answers[row.componentKey] = row.category;
    return answers;
  }),

  /**
   * Step 4: the Data check panel's contents, run server-side.
   *
   * The wizard's step 4 is headed "Validation Summary" and reported
   * `errors: 0, warnings: 0` as literals — it counted rows and summed two
   * columns and called that validation. This runs the same `validateRows` the
   * gate runs, so what the admin reads before confirming is what will decide
   * whether the import is allowed.
   *
   * Writes nothing, so it is deliberately not a `query`: tRPC puts a query's
   * input in the URL, and a twenty-thousand-row sheet does not go in a URL.
   */
  checkData: editorProcedure
    .input(z.object({
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(20000),
      mappings: z.array(IngestMapping).min(1),
      currencyCode: z.string().length(3).default("USD"),
      controlTotalGross: z.number().finite().nullish(),
      controlTotalNet: z.number().finite().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const validation = validateRows(input.rows, input.mappings, {
        currencyCode: input.currencyCode,
        controlTotals: {
          gross: input.controlTotalGross,
          net: input.controlTotalNet,
        },
        answeredCategories: await answeredCategories(ctx.db, ctx.companyId, input.mappings),
      });

      return {
        valid: validation.valid,
        totalRows: validation.totalRows,
        employeeCount: validation.employeeCount,
        totalGross: validation.totalGross,
        totalNet: validation.totalNet,
        detectedCurrency: validation.detectedCurrency,
        errors: validation.errors,
        warnings: validation.warnings,
        reconciliation: validation.reconciliation,
        controlTotals: validation.controlTotals,
        controlTotalsMissing: validation.controlTotalsMissing,
        openQuestions: validation.openQuestions,
      };
    }),

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
      /**
       * Step 4: the totals printed on the export the admin uploaded, for the
       * reconciliation to tick the computed figures against. Optional, because
       * an upload that supplies none is still valid — the check reports "not
       * supplied" rather than treating absence as agreement.
       */
      controlTotalGross: z.number().finite().nullish(),
      controlTotalNet: z.number().finite().nullish(),
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
      // a guarantee, and these rows arrive from the client. Step 4's gate lives
      // inside this call, so a register that does not reconcile never becomes a
      // period — the throw is before `processUpload`, and nothing is written.
      const validation = validateRows(input.rows, input.mappings, {
        currencyCode: input.currencyCode,
        controlTotals: {
          gross: input.controlTotalGross,
          net: input.controlTotalNet,
        },
        answeredCategories: await answeredCategories(ctx.db, ctx.companyId, input.mappings),
      });
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${validation.errors.length} problem(s) stopped the import. First: ${validation.errors[0]?.message ?? "unknown"}`,
          cause: { errors: validation.errors },
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
          controlTotalGross: input.controlTotalGross,
          controlTotalNet: input.controlTotalNet,
        });

        // Step 11b: after the period exists, not before. A choice saved for an
        // import that then failed would answer a question about a register
        // nobody accepted.
        await saveResolvedCategories(ctx, input.mappings);

        return {
          ...result,
          warnings: validation.warnings,
          // Step 4: what the gate found, for the wizard's Data check panel.
          // An import that got here reconciled, so this carries the figures
          // rather than the breaches.
          reconciliation: validation.reconciliation,
          controlTotalsMissing: validation.controlTotalsMissing,
        };
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

/** Whether a period's two balancing lines are zero, per period id. */
export interface PeriodCheck {
  /** `null` when the period has no aggregates to judge from. */
  balanced: boolean | null;
  /** Gross minus the mapped earnings. Zero when the earnings add up. */
  earningsBalance: number;
  /** Gross minus net minus the mapped employee deductions. */
  balance: number;
}

/**
 * Step 4, the display half: the check status of periods already ingested.
 *
 * Every period written from now on had to reconcile to exist, but history
 * predates the gate, so this recomputes the two balancing lines from
 * `period_component_totals` — the same table and the same classifier the annual
 * engine uses, so the periods list and the annual bridge cannot disagree.
 *
 * A period with no rows in that table gets `balanced: null`, not `true`. The
 * annual queries fall back to aggregating `employee_snapshots` live for those,
 * and duplicating that fallback here to render a badge would be a second query
 * path to keep numerically identical for no gain — "not checked" is the honest
 * answer and the one the panel already knows how to show.
 */
async function periodChecks(
  db: ProtectedContext["db"],
  periods: readonly { id: string; totalGross: string; totalNet: string; currencyCode: string }[],
): Promise<Record<string, PeriodCheck>> {
  const checks: Record<string, PeriodCheck> = {};
  if (periods.length === 0) return checks;

  const ids = periods.map((p) => p.id);
  // Aliased and parsed, never cast: `component_key` read as `componentKey`
  // would be undefined with nothing to catch it (finding C1).
  const res = await db.execute(sql`
    SELECT payroll_period_id AS "payrollPeriodId",
           component_key     AS "componentKey",
           sum(total)::text  AS "total"
    FROM period_component_totals
    WHERE payroll_period_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    GROUP BY payroll_period_id, component_key
  `);

  const rows = parseRows(ComponentTotalRowSchema, res.rows, "period check");

  const byPeriod = new Map<string, { earnings: number; deductions: number }>();
  for (const row of rows) {
    const sides = byPeriod.get(row.payrollPeriodId) ?? { earnings: 0, deductions: 0 };
    const category = classifyComponent(row.componentKey);
    if (isTotalColumn(row.componentKey)) {
      // A total column mapped as a component is on neither side.
    } else if ((EARNING_CATEGORIES as readonly string[]).includes(category)) {
      sides.earnings += Number(row.total);
    } else if (category === "uncategorised") {
      // Unplaced money counts toward gross, as it does in the gate and in the
      // annual engine's `other_earnings_balance`.
      sides.earnings += Number(row.total);
    } else if ((EMPLOYEE_DEDUCTION_CATEGORIES as readonly string[]).includes(category)) {
      sides.deductions += Math.abs(Number(row.total));
    }
    byPeriod.set(row.payrollPeriodId, sides);
  }

  for (const period of periods) {
    const sides = byPeriod.get(period.id);
    const decimals = minorUnits(period.currencyCode);
    if (!sides) {
      checks[period.id] = { balanced: null, earningsBalance: 0, balance: 0 };
      continue;
    }
    const gross = Number(period.totalGross);
    const net = Number(period.totalNet);
    const earningsBalance = roundToMinorUnits(gross - sides.earnings, decimals);
    const balance = roundToMinorUnits(gross - net - sides.deductions, decimals);
    checks[period.id] = {
      balanced: earningsBalance === 0 && balance === 0,
      earningsBalance,
      balance,
    };
  }

  return checks;
}

/**
 * Step 11b: the categories already decided for this company, plus whatever the
 * admin just chose in the wizard.
 *
 * Reads `component_categories` — the same table the annual engine reads as
 * `savedCategories`, deliberately. The plan names both that table and
 * `company_column_mappings` as places a per-company answer could live, and this
 * is the one that settles the question for the engine: an answer written to the
 * mappings table would leave `ambiguityFor` still firing on the dashboard, which
 * is exactly the after-the-fact question step 11b exists to remove.
 *
 * The request's answers win over the saved ones, so an admin correcting a column
 * on this upload is not told their own choice is already decided otherwise.
 */
async function answeredCategories(
  db: ProtectedContext["db"],
  companyId: string,
  mappings: readonly { mappedComponent: string; resolvedCategory?: Category | null }[],
): Promise<Record<string, Category>> {
  const saved = await db
    .select({
      componentKey: componentCategories.componentKey,
      category: componentCategories.category,
    })
    .from(componentCategories)
    .where(eq(componentCategories.companyId, companyId));

  const answers: Record<string, Category> = {};
  for (const row of saved) answers[row.componentKey] = row.category as Category;
  for (const m of mappings) {
    if (m.resolvedCategory) answers[m.mappedComponent] = m.resolvedCategory;
  }
  return answers;
}

/**
 * Step 11b: persists the answers given in the wizard, so the question is asked
 * once per company per column.
 *
 * Upserts, like `annual.setComponentCategories`, and writes the same audit row:
 * a category chosen at upload is the same decision as one chosen in the
 * category manager, and the log should not be able to tell which screen it came
 * from while missing one of them entirely.
 *
 * Called after the period is written, not before: a choice saved for an import
 * that then failed would answer a question about a register nobody accepted.
 */
async function saveResolvedCategories(
  ctx: MemberContext & { currentUser: { id: string } },
  mappings: readonly { mappedComponent: string; resolvedCategory?: Category | null }[],
): Promise<void> {
  const entries = mappings
    .filter((m) => m.resolvedCategory)
    .map((m) => ({ componentKey: m.mappedComponent, category: m.resolvedCategory as Category }));
  if (entries.length === 0) return;

  const existing = await ctx.db
    .select()
    .from(componentCategories)
    .where(eq(componentCategories.companyId, ctx.companyId));
  const before = new Map(existing.map((e) => [e.componentKey, e.category]));

  const now = new Date();
  await ctx.db
    .insert(componentCategories)
    .values(
      entries.map((e) => ({
        companyId: ctx.companyId,
        componentKey: e.componentKey,
        category: e.category,
        updatedBy: ctx.currentUser.id,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [componentCategories.companyId, componentCategories.componentKey],
      set: {
        category: sql`excluded.category`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: now,
      },
    });

  const changed = entries.filter((e) => before.get(e.componentKey) !== e.category);
  if (changed.length === 0) return;

  await ctx.db.insert(annualAuditLog).values(
    changed.map((e) => ({
      companyId: ctx.companyId,
      userId: ctx.currentUser.id,
      entity: "component_category",
      entityKey: e.componentKey,
      oldValue: { category: before.get(e.componentKey) ?? null },
      // `source` so the log can tell an answer given at upload from one given
      // in the category manager; the existing writer omits it, which reads as
      // the manager.
      newValue: { category: e.category, source: "upload_wizard" },
    })),
  );
}
