"use client";

import { useState, useCallback } from "react";
import { runComparison, type EmployeeRecord, type AggregatedSummary } from "@saas/payroll-core";
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

function buildMockEmployees(): { current: EmployeeRecord[]; previous: EmployeeRecord[] } {
  const current: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 95000, bonus: 12000, benefits: 5000 }, grossSalary: 112000, netSalary: 82000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000 }, grossSalary: 84000, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 88000, bonus: 15000, benefits: 4500 }, grossSalary: 107500, netSalary: 78500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 110000, bonus: 18000, benefits: 6000 }, grossSalary: 134000, netSalary: 98000 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 65000, bonus: 5000, benefits: 3500 }, grossSalary: 73500, netSalary: 54000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 22000, benefits: 5000 }, grossSalary: 119000, netSalary: 87000 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 125000, bonus: 25000, benefits: 7000 }, grossSalary: 157000, netSalary: 114000 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500 }, grossSalary: 77500, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 78000, bonus: 10000, benefits: 4000 }, grossSalary: 92000, netSalary: 67200 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 105000, bonus: 16000, benefits: 5500 }, grossSalary: 126500, netSalary: 92500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 35000, benefits: 8000 }, grossSalary: 193000, netSalary: 140000 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 85000, bonus: 12000, benefits: 4500 }, grossSalary: 101500, netSalary: 74000 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 55000, bonus: 4000, benefits: 3000 }, grossSalary: 62000, netSalary: 45500 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 71000, bonus: 7000, benefits: 3500 }, grossSalary: 81500, netSalary: 59800 },
    { externalId: "E016", name: "Peter Nguyen", department: "Operations", components: { salary: 58000, bonus: 5000, benefits: 3000 }, grossSalary: 66000, netSalary: 48500 },
  ];

  const previous: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 90000, bonus: 10000, benefits: 5000 }, grossSalary: 105000, netSalary: 77000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000 }, grossSalary: 84000, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 85000, bonus: 12000, benefits: 4500 }, grossSalary: 101500, netSalary: 74500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 105000, bonus: 15000, benefits: 6000 }, grossSalary: 126000, netSalary: 92500 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 62000, bonus: 4000, benefits: 3500 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 20000, benefits: 5000 }, grossSalary: 117000, netSalary: 85500 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 120000, bonus: 22000, benefits: 7000 }, grossSalary: 149000, netSalary: 108500 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500 }, grossSalary: 77500, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 75000, bonus: 8000, benefits: 4000 }, grossSalary: 87000, netSalary: 63800 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 100000, bonus: 14000, benefits: 5500 }, grossSalary: 119500, netSalary: 87500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 30000, benefits: 8000 }, grossSalary: 188000, netSalary: 136500 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 82000, bonus: 10000, benefits: 4500 }, grossSalary: 96500, netSalary: 70500 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 52000, bonus: 3000, benefits: 3000 }, grossSalary: 58000, netSalary: 42800 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 68000, bonus: 5000, benefits: 3500 }, grossSalary: 76500, netSalary: 56200 },
    { externalId: "E017", name: "Quinn Harris", department: "Operations", components: { salary: 60000, bonus: 5000, benefits: 3500 }, grossSalary: 68500, netSalary: 50200 },
  ];

  return { current, previous };
}

export default function DashboardPage() {
  const [periodType, setPeriodType] = useState<string>("monthly");
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState("Jun 2026");
  const [previousPeriodLabel, setPreviousPeriodLabel] = useState("May 2026");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AggregatedSummary | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);

  const runComparisonHandler = useCallback(() => {
    setLoading(true);
    const { current, previous } = buildMockEmployees();
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
  }, []);

  if (!summary) {
    return (
      <div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VarianceDistributionChart distribution={summary.distribution} />
        <ComponentBreakdown components={summary.componentBreakdown} />
      </div>

      <AnomalyFlagsPanel anomalies={summary.anomalies} />

      <DepartmentBreakdown departments={summary.departmentBreakdown} />

      <TopMovers movers={summary.topMovers} />
    </div>
  );
}
