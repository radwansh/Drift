"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { AggregatedSummary } from "@saas/payroll-core";
import type { AiNarrative } from "@saas/types";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import { usePeriodOptions } from "@/hooks/use-period-options";
import { Button, EmptyState, Notice, PageHeader } from "@/components/cv";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AiSummaryBanner } from "@/components/dashboard/ai-summary-banner";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { VarianceDistributionChart } from "@/components/dashboard/variance-distribution-chart";
import { ComponentBreakdown } from "@/components/dashboard/component-breakdown";
import { AnomalyFlagsPanel } from "@/components/dashboard/anomaly-flags-panel";
import { DepartmentBreakdown } from "@/components/dashboard/department-breakdown";
import { TopMovers } from "@/components/dashboard/top-movers";

/**
 * Dashboard — the Ink & Signal rebuild (canvas board "Dashboard", Main.dc.html).
 *
 * The data flow is unchanged from the previous page: `comparisons.run` on the server,
 * periods selected by id, the narrative built here by rules. Only the layout moved:
 *
 * - PageHeader carries the comparison ("July 2026 vs June 2026": current first, as the
 *   design system's voice rules read periods), and the period toolbar stays on screen
 *   after a run, so changing a period is one step rather than a reload.
 * - The summary and the anomaly flags share a row (2fr / 1fr), the distribution and the
 *   component variance share the next, then the department and movers tables.
 * - The narrative is rule-based, so the banner says so (`source="rules"`) and carries no
 *   model name, per CLAUDE.md. The Regenerate button is gone: it only logged to the
 *   console. Bring it back when there is an AI narrative to regenerate.
 */
function buildNarrative(summary: AggregatedSummary, currency: string): AiNarrative {
  const variance = summary.totalPayrollVariance;
  const money = (amount: number) => formatCurrency(amount, currency);
  return {
    summary: `Payroll variance is ${variance.absolute >= 0 ? "+" : ""}${money(Math.abs(variance.absolute))} (${variance.percentage?.toFixed(1) ?? "N/A"}%) across ${summary.employeesAffected.total} employees. ${summary.employeesAffected.increased} employees saw increases, ${summary.employeesAffected.decreased} saw decreases.`,
    highlights: [
      `${summary.employeesAffected.increased} employees received salary increases totaling ${money(Math.abs(variance.absolute))}`,
      summary.largestIncrease
        ? `${summary.largestIncrease.employeeName} (${summary.largestIncrease.department}) had the largest increase of ${money(summary.largestIncrease.amount)}`
        : null,
      `${summary.newEmployees} new employees were added this period`,
    ].filter(Boolean) as string[],
    concerns: [
      summary.largestDecrease
        ? `${summary.largestDecrease.employeeName} (${summary.largestDecrease.department}) had the largest decrease of ${money(Math.abs(summary.largestDecrease.amount))}`
        : null,
      `${summary.employeesAffected.decreased} employees experienced salary decreases`,
      summary.anomalies.length > 0
        ? `${summary.anomalies.length} anomaly flag(s) detected requiring attention`
        : null,
    ].filter(Boolean) as string[],
    severity: summary.anomalies.some((a) => a.severity === "critical")
      ? "critical"
      : summary.anomalies.length > 0
        ? "review"
        : "routine",
  };
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [periodType, setPeriodType] = useState<string>("monthly");
  const { periods, isLoading: periodsLoading, error: periodsError } = usePeriodOptions();
  const [currentPeriodId, setCurrentPeriodId] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);
  const [currency, setCurrency] = useState("USD");

  const comparison = trpc.comparisons.run.useMutation({
    onSuccess: (result) => {
      setSummary(result.summary);
      setCurrency(result.currency);
      setNarrative(buildNarrative(result.summary, result.currency));
    },
  });
  const loading = comparison.isPending;

  // Preselect: the period named in the URL (from the Payroll Periods page's Compare
  // action) against the one before it, else the two most recent.
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
  const comparisonLabel =
    currentLabel && previousLabel ? `${currentLabel} vs ${previousLabel}` : "";
  const cadenceLabel = PERIOD_TYPE_LABELS[periodType] ?? periodType;

  const errorMessage = periodsError?.message ?? comparison.error?.message ?? null;

  const selector = (
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
  );

  const errorNotice = errorMessage ? (
    <Notice tone="danger" title="Could not run the comparison">
      {errorMessage}
    </Notice>
  ) : null;

  if (!summary) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Dashboard"
          title="Compare two payroll periods"
          lede="Pick a current and a previous period. Every change between them lands here: totals, people, pay components and anything worth a second look."
        />
        {selector}
        {errorNotice}
        {!periodsLoading && periods.length < 2 && (
          <EmptyState
            title={periods.length === 0 ? "No payroll data yet" : "One period so far"}
            description={
              periods.length === 0
                ? "Upload your first payroll period to start comparing. Each upload becomes one period."
                : "A comparison needs two periods. Upload another one to see what changed."
            }
            action={
              <Button href="/payroll-periods" iconLeft="upload">
                {periods.length === 0 ? "Upload a payroll period" : "Upload another period"}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Dashboard"
        title={comparisonLabel || "Comparison"}
        lede={`${cadenceLabel} payroll. Every change since ${previousLabel || "the previous period"}, in one place.`}
      />

      {selector}
      {errorNotice}

      <KpiCards summary={summary} currency={currency} previousLabel={previousLabel} />

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {narrative && <AiSummaryBanner narrative={narrative} source="rules" />}
        <AnomalyFlagsPanel anomalies={summary.anomalies} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <VarianceDistributionChart distribution={summary.distribution} />
        <ComponentBreakdown
          components={summary.componentBreakdown}
          currency={currency}
          comparisonLabel={comparisonLabel}
        />
      </div>

      <DepartmentBreakdown
        departments={summary.departmentBreakdown}
        currency={currency}
        previousLabel={previousLabel}
        currentLabel={currentLabel}
      />

      <TopMovers
        movers={summary.topMovers}
        currency={currency}
        previousLabel={previousLabel}
        currentLabel={currentLabel}
      />
    </div>
  );
}
