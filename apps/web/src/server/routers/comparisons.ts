import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  comparisonRuns,
  comparisonResults,
  payrollPeriods,
  employeeSnapshots,
  users,
  companies,
} from "@saas/db";
import { runComparison, DuplicateEmployeeIdsError } from "@saas/payroll-core";
import type { EmployeeRecord } from "@saas/payroll-core";
import { memberProcedure, router } from "../trpc";

/**
 * Every read here resolves its row by id *and* company (finding 4e).
 *
 * `run`, `getById` and `getSummary` previously matched on id alone on a
 * `protectedProcedure`, so any signed-in user who could name a period or
 * comparison UUID got its contents back — for `run` that is every
 * `employee_snapshots` row for two periods, names and pay included. Only
 * `list` was scoped. These are reads, so they leaked rather than destroyed,
 * which makes them the more serious half of the scoping problem described in
 * CLAUDE.md.
 */
export const comparisonsRouter = router({
  run: memberProcedure
    .input(z.object({
      currentPeriodId: z.string().uuid(),
      previousPeriodId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [currentPeriod, previousPeriod, company] = await Promise.all([
        ctx.db.query.payrollPeriods.findFirst({
          where: and(
            eq(payrollPeriods.id, input.currentPeriodId),
            eq(payrollPeriods.companyId, ctx.companyId),
          ),
        }),
        ctx.db.query.payrollPeriods.findFirst({
          where: and(
            eq(payrollPeriods.id, input.previousPeriodId),
            eq(payrollPeriods.companyId, ctx.companyId),
          ),
        }),
        // Step 8b: the comparison's figures have to reach the UI with a
        // currency, or `formatCurrency` labels a Lebanese payroll in dollars.
        // Read in the same batch, so it costs no extra round trip.
        ctx.db.query.companies.findFirst({
          where: eq(companies.id, ctx.companyId),
          columns: { currencyCode: true },
        }),
      ]);
      if (!currentPeriod || !previousPeriod) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both periods not found" });
      }

      /**
       * The company currency, as step 8b specifies — one currency per tenant,
       * so there is nothing to choose between.
       *
       * The two periods also carry a `currencyCode` each, and nothing checks
       * that they agree with each other or with this one. Two periods in
       * different currencies make the variance meaningless, not merely
       * mislabelled, so that is a check and not a formatting question;
       * recorded as a finding rather than guessed at here.
       */
      const currency = company?.currencyCode ?? "USD";

      const [currentSnapshots, previousSnapshots] = await Promise.all([
        ctx.db.select().from(employeeSnapshots)
          .where(eq(employeeSnapshots.payrollPeriodId, input.currentPeriodId)),
        ctx.db.select().from(employeeSnapshots)
          .where(eq(employeeSnapshots.payrollPeriodId, input.previousPeriodId)),
      ]);

      const toEmployeeRecord = (snapshots: typeof currentSnapshots): EmployeeRecord[] =>
        snapshots.map((s) => ({
          externalId: s.employeeExternalId,
          name: s.employeeName,
          department: s.department,
          components: s.components as Record<string, number | null>,
          grossSalary: Number(s.grossSalary),
          netSalary: Number(s.netSalary),
        }));

      const [run] = await ctx.db.insert(comparisonRuns).values({
        companyId: ctx.companyId,
        currentPeriodId: input.currentPeriodId,
        previousPeriodId: input.previousPeriodId,
        status: "running",
        createdById: ctx.currentUser.id,
      }).returning();

      try {
        const { results, summary } = runComparison(
          toEmployeeRecord(currentSnapshots),
          toEmployeeRecord(previousSnapshots),
          // Step 8a: the currency decides how many decimals every figure keeps
          // and what counts as a change at all. Without it a KWD one-fils
          // movement rounded to zero and read as "unchanged".
          { currency },
        );

        const values = results.map((r) => ({
          comparisonRunId: run.id,
          employeeExternalId: r.employeeExternalId,
          employeeName: r.employeeName,
          department: r.department,
          currentComponents: r.currentComponents,
          previousComponents: r.previousComponents,
          componentDeltas: r.componentDeltas,
          grossDelta: String(r.grossDelta ?? 0),
          netDelta: String(r.netDelta ?? 0),
          status: r.status,
          anomalyFlags: r.anomalyFlags,
        }));

        await ctx.db.insert(comparisonResults).values(values);

        const [updated] = await ctx.db.update(comparisonRuns)
          .set({
            status: "completed",
            resultSummary: summary as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .where(eq(comparisonRuns.id, run.id))
          .returning();

        return { comparisonRun: updated, summary, results, currency };
      } catch (cause) {
        await ctx.db.update(comparisonRuns)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(comparisonRuns.id, run.id));

        // A duplicate employee ID is bad input, not a server fault, and its
        // message names the IDs and their row counts so the admin knows which
        // rows to correct (step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md). Reported
        // as INTERNAL_SERVER_ERROR it read "Comparison failed", which says
        // nothing and suggests the fault is ours.
        if (cause instanceof DuplicateEmployeeIdsError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: cause.message, cause });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Comparison failed", cause });
      }
    }),

  getById: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: and(eq(comparisonRuns.id, input.id), eq(comparisonRuns.companyId, ctx.companyId)),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });

      const results = await ctx.db.select().from(comparisonResults)
        .where(eq(comparisonResults.comparisonRunId, input.id))
        .orderBy(comparisonResults.employeeName);

      return { ...run, results };
    }),

  list: memberProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(comparisonRuns)
          .where(eq(comparisonRuns.companyId, ctx.companyId))
          .orderBy(desc(comparisonRuns.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(comparisonRuns)
          .where(eq(comparisonRuns.companyId, ctx.companyId)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),

  getSummary: memberProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: and(eq(comparisonRuns.id, input.id), eq(comparisonRuns.companyId, ctx.companyId)),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, run.companyId),
      });

      const currentPeriod = await ctx.db.query.payrollPeriods.findFirst({
        where: eq(payrollPeriods.id, run.currentPeriodId),
      });
      const previousPeriod = await ctx.db.query.payrollPeriods.findFirst({
        where: eq(payrollPeriods.id, run.previousPeriodId),
      });

      return {
        summary: run.resultSummary,
        aiNarrative: run.aiNarrative,
        companyName: company?.name ?? "",
        currency: company?.currencyCode ?? "USD",
        currentPeriod: currentPeriod ? `${currentPeriod.periodStart} - ${currentPeriod.periodEnd}` : "",
        previousPeriod: previousPeriod ? `${previousPeriod.periodStart} - ${previousPeriod.periodEnd}` : "",
      };
    }),
});
