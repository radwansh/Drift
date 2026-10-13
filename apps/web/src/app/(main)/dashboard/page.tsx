"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { AggregatedSummary } from "@saas/payroll-core";
import type { AiNarrative } from "@saas/types";
import { trpc } from "@/lib/trpc";
import { usePeriodOptions } from "@/hooks/use-period-options";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AiSummaryBanner } from "@/components/dashboard/ai-summary-banner";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { VarianceDistributionChart } from "@/components/dashboard/variance-distribution-chart";
import { ComponentBreakdown } from "@/components/dashboard/component-breakdown";
import { AnomalyFlagsPanel } from "@/components/dashboard/anomaly-flags-panel";
import { DepartmentBreakdown } from "@/components/dashboard/department-breakdown";
import { TopMovers } from "@/components/dashboard/top-movers";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

function buildNarrative(summary: AggregatedSummary): AiNarrative {
  return {
    summary: `Payroll variance is ${summary.totalPayrollVariance.absolute >= 0 ? "+" : ""}$${Math.abs(summary.totalPayrollVariance.absolute).toLocaleString()} (${summary.totalPayrollVariance.percentage?.toFixed(1) ?? "N/A"}%) across ${summary.employeesAffected.total} employees. ${summary.employeesAffected.increased} employees saw increases, ${summary.employeesAffected.decreased} saw decreases.`,
    highlights: [
      `${summary.employeesAffected.increased} employees received salary increases totaling $${Math.abs(summary.totalPayrollVariance.absolute).toLocaleString()}`,
      summary.largestIncrease ? `${summary.largestIncrease.employeeName} (${summary.largestIncrease.department}) had the largest increase of $${summary.largestIncrease.amount.toLocaleString()}` : null,
      `${summary.newEmployees} new employees were added this period`,
    ].filter(Boolean) as string[],
    concerns: [
      summary.largestDecrease ? `${summary.largestDecrease.employeeName} (${summary.largestDecrease.department}) had the largest decrease of $${Math.abs(summary.largestDecrease.amount).toLocaleString()}` : null,
      `${summary.employeesAffected.decreased} employees experienced salary decreases`,
      summary.anomalies.length > 0 ? `${summary.anomalies.length} anomaly flag(s) detected requiring attention` : null,
    ].filter(Boolean) as string[],
    severity: summary.anomalies.some((a) => a.severity === "critical") ? "critical" : summary.anomalies.length > 0 ? "review" : "routine",
  };
}

/**
 * Step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md.
 *
 * The comparison now runs on the server through `comparisons.run`, which reads
 * the snapshots and records the run. This page used to pull employee records
 * out of the in-memory `usePayrollStore` and call `runComparison` in the
 * browser, so it only ever worked for periods uploaded in the current tab and
 * showed "No payroll data yet" after any reload. The periods are selected by
 * id rather than by label, which is not unique.
 */
export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [periodType, setPeriodType] = useState<string>("monthly");
  const { periods, isLoading: periodsLoading, error: periodsError } = usePeriodOptions();
  const [currentPeriodId, setCurrentPeriodId] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);

  const comparison = trpc.comparisons.run.useMutation({
    onSuccess: (result) => {
      setSummary(result.summary);
      setNarrative(buildNarrative(result.summary));
    },
  });
  const loading = comparison.isPending;

  // Preselect: the period named in the URL (from the Payroll Periods page's
  // Compare action) against the one before it, else the two most recent.
  useEffect(() => {
    if (periods.length === 0) return;
    const requested = searchParams.get("periodId");
    const index = requested ? periods.findIndex((p) => p.id === requested) : -1;

    if (index >= 0) {
      setCurrentPeriodId(periods[index]!.id);
      const prior = periods[index - 1] ?? periods.find((p) => p.id !== periods[index]!.id);
      if (prior) setPreviousPeriodId(prior.id);
      return;
    }
    setCurrentPeriodId(periods[periods.length - 1]!.id);
    if (periods.length >= 2) setPreviousPeriodId(periods[periods.length - 2]!.id);
  }, [periods, searchParams]);

  const runComparisonHandler = useCallback(() => {
    if (!currentPeriodId || !previousPeriodId || currentPeriodId === previousPeriodId) return;
    comparison.mutate({ currentPeriodId, previousPeriodId });
  }, [comparison, currentPeriodId, previousPeriodId]);

  const currentLabel = periods.find((p) => p.id === currentPeriodId)?.label ?? "";
  const previousLabel = periods.find((p) => p.id === previousPeriodId)?.label ?? "";

  const errorMessage = periodsError?.message ?? comparison.error?.message ?? null;

  if (!summary) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Payroll Variance Dashboard</h2>
          <p className="text-muted-foreground mt-1">Compare payroll data between periods to spot trends and anomalies</p>
        </div>
        <PeriodSelector
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          periods={periods}
          currentPeriodId={currentPeriodId}
          previousPeriodId={previousPeriodId}
          onCurrentPeriodChange={setCurrentPeriodId}
          onPreviousPeriodChange={setPreviousPeriodId}
          onCompare={runComparisonHandler}
          loading={loading}
        />
        {errorMessage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not run the comparison</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        {!periodsLoading && periods.length < 2 && (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
            <div className="rounded-full bg-muted p-4">
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {periods.length === 0 ? "No payroll data yet" : "One period so far"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground text-center max-w-md">
              {periods.length === 0
                ? "Upload your first payroll period to start comparing variance between periods. Go to Payroll Periods to upload data."
                : "A comparison needs two periods. Upload another one to see variance."}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payroll Variance Dashboard</h2>
          <p className="text-muted-foreground mt-1">Comparing {previousLabel} vs {currentLabel}</p>
        </div>
        <Button variant="outline" size="sm" onClick={runComparisonHandler} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Run Comparison
        </Button>
      </div>

      {narrative && <AiSummaryBanner narrative={narrative} onRegenerate={() => console.log("Regenerate AI summary")} />}

      <KpiCards summary={summary} />

      <div className="grid grid-cols-1 gap-6">
        <VarianceDistributionChart distribution={summary.distribution} />
        <ComponentBreakdown components={summary.componentBreakdown} />
      </div>

      <AnomalyFlagsPanel anomalies={summary.anomalies} />

      <DepartmentBreakdown departments={summary.departmentBreakdown} />

      <TopMovers movers={summary.topMovers} />
    </div>
  );
}
