import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { comparisonRuns, comparisonResults, payrollPeriods, users, companies } from "@saas/db";
import {
  generateNarrative,
  refineAnomalies,
  answerQuestion,
  generateAuditSummary,
} from "@saas/ai";
import { protectedProcedure, router } from "../trpc";

export const aiRouter = router({
  getNarrative: protectedProcedure
    .input(z.object({ comparisonRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: eq(comparisonRuns.id, input.comparisonRunId),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });
      if (!run.resultSummary) throw new TRPCError({ code: "BAD_REQUEST", message: "No summary available" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, run.companyId),
      });
      const [currentPeriod, previousPeriod] = await Promise.all([
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, run.currentPeriodId) }),
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, run.previousPeriodId) }),
      ]);

      const narrative = await generateNarrative(
        run.resultSummary as Parameters<typeof generateNarrative>[0],
        company?.name ?? "Unknown",
        currentPeriod ? `${currentPeriod.periodStart} - ${currentPeriod.periodEnd}` : "Current",
        previousPeriod ? `${previousPeriod.periodStart} - ${previousPeriod.periodEnd}` : "Previous",
      );

      if (!run.aiNarrative) {
        await ctx.db.update(comparisonRuns)
          .set({ aiNarrative: JSON.stringify(narrative), updatedAt: new Date() })
          .where(eq(comparisonRuns.id, run.id));
      }

      return narrative;
    }),

  getAnomalyRefinement: protectedProcedure
    .input(z.object({ comparisonRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.db.select().from(comparisonResults)
        .where(eq(comparisonResults.comparisonRunId, input.comparisonRunId));

      const ruleBasedAnomalies = results
        .filter((r: typeof results[number]) => r.anomalyFlags)
        .flatMap((r: typeof results[number]) => {
          const flags = r.anomalyFlags as Array<{ type: string; severity: "info" | "warning" | "critical"; description: string }> | null;
          if (!flags) return [];
          return flags.map((f) => ({
            employeeId: r.employeeExternalId,
            employeeName: r.employeeName,
            type: f.type,
            severity: f.severity,
            description: f.description,
          }));
        });

      const refined = await refineAnomalies(
        ruleBasedAnomalies as Parameters<typeof refineAnomalies>[0],
        results as unknown as Parameters<typeof refineAnomalies>[1],
      );

      return refined;
    }),

  askQuestion: protectedProcedure
    .input(z.object({
      question: z.string().min(1).max(500),
      comparisonRunId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: eq(comparisonRuns.id, input.comparisonRunId),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });

      const response = await answerQuestion(input.question, run);
      return response;
    }),

  getAuditSummary: protectedProcedure
    .input(z.object({ comparisonRunId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.comparisonRuns.findFirst({
        where: eq(comparisonRuns.id, input.comparisonRunId),
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison run not found" });
      if (!run.resultSummary) throw new TRPCError({ code: "BAD_REQUEST", message: "No summary available" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, run.companyId),
      });
      const [currentPeriod, previousPeriod] = await Promise.all([
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, run.currentPeriodId) }),
        ctx.db.query.payrollPeriods.findFirst({ where: eq(payrollPeriods.id, run.previousPeriodId) }),
      ]);

      const audit = await generateAuditSummary({
        summary: run.resultSummary as Parameters<typeof generateAuditSummary>[0]["summary"],
        companyName: company?.name ?? "Unknown",
        currentPeriod: currentPeriod ? `${currentPeriod.periodStart} - ${currentPeriod.periodEnd}` : "Current",
        previousPeriod: previousPeriod ? `${previousPeriod.periodStart} - ${previousPeriod.periodEnd}` : "Previous",
      });

      return audit;
    }),
});
