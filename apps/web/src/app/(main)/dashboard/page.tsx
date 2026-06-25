"use client";

import { useState, useCallback, useEffect } from "react";
import { runComparison, type AggregatedSummary } from "@saas/payroll-core";
import type { AiNarrative } from "@saas/types";
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
import { usePayrollStore } from "@/lib/payroll-store";

export default function DashboardPage() {
  const { periods } = usePayrollStore();
  const [periodType, setPeriodType] = useState<string>("monthly");
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState("");
  const [previousPeriodLabel, setPreviousPeriodLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const periodId = params.get("periodId");
    if (periodId && periods.length > 0) {
      const period = periods.find((p) => p.id === periodId);
      if (period) {
        setCurrentPeriodLabel(period.label);
        const other = periods.find((p) => p.id !== periodId);
        if (other) setPreviousPeriodLabel(other.label);
      }
    } else if (periods.length >= 2) {
      setCurrentPeriodLabel(periods[periods.length - 1].label);
      setPreviousPeriodLabel(periods[periods.length - 2].label);
    } else if (periods.length === 1) {
      setCurrentPeriodLabel(periods[0].label);
    }
  }, [periods]);

  const runComparisonHandler = useCallback(() => {
    setLoading(true);
    const currentPeriod = periods.find((p) => p.label === currentPeriodLabel);
    const previousPeriod = periods.find((p) => p.label === previousPeriodLabel);
    const current = currentPeriod?.employees ?? [];
    const previous = previousPeriod?.employees ?? [];
    if (current.length === 0 || previous.length === 0) {
      setSummary(null);
      setNarrative(null);
      return setLoading(false);
    }
    const result = runComparison(current, previous);
    setSummary(result.summary);

    setNarrative({
      summary: `Payroll variance is ${result.summary.totalPayrollVariance.absolute >= 0 ? "+" : ""}$${Math.abs(result.summary.totalPayrollVariance.absolute).toLocaleString()} (${result.summary.totalPayrollVariance.percentage?.toFixed(1) ?? "N/A"}%) across ${result.summary.employeesAffected.total} employees. ${result.summary.employeesAffected.increased} employees saw increases, ${result.summary.employeesAffected.decreased} saw decreases.`,
      highlights: [
        `${result.summary.employeesAffected.increased} employees received salary increases totaling $${Math.abs(result.summary.totalPayrollVariance.absolute).toLocaleString()}`,
        result.summary.largestIncrease ? `${result.summary.largestIncrease.employeeName} (${result.summary.largestIncrease.department}) had the largest increase of $${result.summary.largestIncrease.amount.toLocaleString()}` : null,
        `${result.summary.newEmployees} new employees were added this period`,
      ].filter(Boolean) as string[],
      concerns: [
        result.summary.largestDecrease ? `${result.summary.largestDecrease.employeeName} (${result.summary.largestDecrease.department}) had the largest decrease of $${Math.abs(result.summary.largestDecrease.amount).toLocaleString()}` : null,
        `${result.summary.employeesAffected.decreased} employees experienced salary decreases`,
        result.summary.anomalies.length > 0 ? `${result.summary.anomalies.length} anomaly flag(s) detected requiring attention` : null,
      ].filter(Boolean) as string[],
      severity: result.summary.anomalies.some((a) => a.severity === "critical") ? "critical" : result.summary.anomalies.length > 0 ? "review" : "routine",
    });

    setLoading(false);
  }, [currentPeriodLabel, previousPeriodLabel, periods]);

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
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          onCurrentPeriodChange={setCurrentPeriodLabel}
          onPreviousPeriodChange={setPreviousPeriodLabel}
          onCompare={runComparisonHandler}
          loading={loading}
        />
        {periods.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
            <div className="rounded-full bg-muted p-4">
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No payroll data yet</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center max-w-md">
              Upload your first payroll period to start comparing variance between periods.
              Select two periods above and click Compare to view the dashboard, or go to
              Payroll Periods to upload data.
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
          <p className="text-muted-foreground mt-1">Comparing {previousPeriodLabel} vs {currentPeriodLabel}</p>
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
