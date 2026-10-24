import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { exportHistory, comparisonRuns } from "@saas/db";
import { memberProcedure, router } from "../trpc";

/**
 * `memberProcedure` throughout: it resolves the caller's user row once and puts
 * `companyId` on the context, which replaces the manual `users` lookup each
 * procedure used to repeat and is what CLAUDE.md asks new code to prefer.
 *
 * Two tenancy holes closed here:
 *
 * - `getStatus` matched on the export id alone, so any signed-in user of any
 *   company could read any export record — including its `fileKey`, the pointer
 *   to the rendered file.
 * - `requestExport` stamped the caller's own `companyId` onto the row but never
 *   checked that `comparisonRunId` belonged to that company, so a caller could
 *   queue an export of another tenant's comparison run and have the result
 *   filed under their own company.
 *
 * Both answer NOT_FOUND rather than FORBIDDEN, so the error does not confirm
 * that the id exists.
 */
const ExportFormat = z.enum(["pdf", "xlsx", "csv"]);

export const exportsRouter = router({
  requestExport: memberProcedure
    .input(z.object({
      comparisonRunId: z.string().uuid(),
      format: ExportFormat,
      includeAllColumns: z.boolean().default(true),
      selectedColumns: z.array(z.string()).optional(),
      includeAiNarrative: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: and(
          eq(comparisonRuns.id, input.comparisonRunId),
          eq(comparisonRuns.companyId, ctx.companyId),
        ),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });

      const [exportRecord] = await ctx.db.insert(exportHistory).values({
        companyId: ctx.companyId,
        comparisonRunId: input.comparisonRunId,
        format: input.format,
        status: "pending",
        requestedById: ctx.currentUser.id,
      }).returning();

      return exportRecord;
    }),

  getStatus: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await ctx.db.query.exportHistory.findFirst({
        where: and(
          eq(exportHistory.id, input.id),
          eq(exportHistory.companyId, ctx.companyId),
        ),
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
      return record;
    }),

  list: memberProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(exportHistory)
          .where(eq(exportHistory.companyId, ctx.companyId))
          .orderBy(desc(exportHistory.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(exportHistory)
          .where(eq(exportHistory.companyId, ctx.companyId)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),
});
