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
import { runComparison } from "@saas/payroll-core";
import type { EmployeeRecord } from "@saas/payroll-core";
import { protectedProcedure, router } from "../trpc";

export const comparisonsRouter = router({
  run: protectedProcedure
    .input(z.object({
      currentPeriodId: z.string().uuid(),
      previousPeriodId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const [currentPeriod, previousPeriod] = await Promise.all([
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, input.currentPeriodId) }),
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, input.previousPeriodId) }),
      ]);
      if (!currentPeriod || !previousPeriod) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both periods not found" });
      }

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
        companyId: currentUser.companyId,
        currentPeriodId: input.currentPeriodId,
        previousPeriodId: input.previousPeriodId,
        status: "running",
        createdById: currentUser.id,
      }).returning();

      try {
        const { results, summary } = runComparison(
          toEmployeeRecord(currentSnapshots),
          toEmployeeRecord(previousSnapshots),
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

        return { comparisonRun: updated, summary, results };
      } catch (e) {
        await ctx.db.update(comparisonRuns)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(comparisonRuns.id, run.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Comparison failed" });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: eq(comparisonRuns.id, input.id),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });

      const results = await ctx.db.select().from(comparisonResults)
        .where(eq(comparisonResults.comparisonRunId, input.id))
        .orderBy(comparisonResults.employeeName);

      return { ...run, results };
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(comparisonRuns)
          .where(eq(comparisonRuns.companyId, currentUser.companyId))
          .orderBy(desc(comparisonRuns.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(comparisonRuns)
          .where(eq(comparisonRuns.companyId, currentUser.companyId)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),

  getSummary: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: eq(comparisonRuns.id, input.id),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });

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
        currentPeriod: currentPeriod ? `${currentPeriod.periodStart} - ${currentPeriod.periodEnd}` : "",
        previousPeriod: previousPeriod ? `${previousPeriod.periodStart} - ${previousPeriod.periodEnd}` : "",
      };
    }),
});
