import { describe, it, expect } from "vitest";
import { generateNarrative } from "./narrative";
import type { AggregatedSummary } from "@saas/payroll-core";

function makeSummary(overrides: Partial<AggregatedSummary> = {}): AggregatedSummary {
  return {
    totalPayrollVariance: { absolute: 15000, percentage: 5.2 },
    employeesAffected: { total: 100, increased: 30, decreased: 10, unchanged: 60 },
    newEmployees: 3,
    departedEmployees: 2,
    largestIncrease: { employeeName: "Alice Smith", department: "Engineering", amount: 2500 },
    largestDecrease: { employeeName: "Bob Jones", department: "Sales", amount: -1800 },
    averageChange: { absolute: 150, percentage: 2.1 },
    distribution: [
      { label: "increased >10%", count: 5, color: "#16a34a" },
      { label: "increased 1-10%", count: 25, color: "#22c55e" },
      { label: "unchanged", count: 60, color: "#6b7280" },
      { label: "decreased 1-10%", count: 8, color: "#f97316" },
      { label: "decreased >10%", count: 2, color: "#ef4444" },
    ],
    componentBreakdown: [
      { component: "gross_salary", totalChange: 12000, employeeCount: 40 },
      { component: "bonus", totalChange: 3000, employeeCount: 15 },
    ],
    departmentBreakdown: [
      { department: "Engineering", headcountCurrent: 50, headcountPrevious: 48, totalCurrent: 500000, totalPrevious: 480000, absoluteChange: 20000, percentageChange: 4.17 },
    ],
    topMovers: [
      { employeeName: "Alice Smith", department: "Engineering", previousNet: 8000, currentNet: 10500, changeAmount: 2500, changePercentage: 31.25 },
    ],
    anomalies: [
      { employeeId: "E123", employeeName: "Charlie Brown", type: "large_change_no_explanation", severity: "warning", description: "Net changed by 45% but no individual component changed" },
    ],
    ...overrides,
  };
}

describe("generateNarrative", () => {
  it("returns a narrative with summary highlights and concerns", async () => {
    const summary = makeSummary();
    const result = await generateNarrative(summary, "Acme Corp", "June 2024", "May 2024");

    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain("increase");
    expect(result.summary).toContain("Acme Corp");
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.concerns.length).toBeGreaterThan(0);
    expect(["routine", "review", "critical"]).toContain(result.severity);
  });

  it("sets critical severity for critical anomalies", async () => {
    const summary = makeSummary({
      anomalies: [
        { employeeId: "E999", employeeName: "Critical Case", type: "duplicate_employee", severity: "critical", description: "Duplicate employee record detected" },
      ],
    });
    const result = await generateNarrative(summary, "Test Co", "Q2", "Q1");
    expect(result.severity).toBe("critical");
  });

  it("handles no anomalies", async () => {
    const summary = makeSummary({ anomalies: [] });
    const result = await generateNarrative(summary, "Stable Corp", "Jan", "Dec");

    expect(result.severity).toBe("routine");
    expect(result.concerns.length).toBe(0);
  });

  it("handles negative variance", async () => {
    const summary = makeSummary({
      totalPayrollVariance: { absolute: -5000, percentage: -2.5 },
    });
    const result = await generateNarrative(summary, "Down Co", "Feb", "Jan");

    expect(result.summary).toContain("decrease");
  });

  it("handles zero variance", async () => {
    const summary = makeSummary({
      totalPayrollVariance: { absolute: 0, percentage: 0 },
      employeesAffected: { total: 50, increased: 0, decreased: 0, unchanged: 50 },
      averageChange: { absolute: 0, percentage: 0 },
    });
    const result = await generateNarrative(summary, "Flat Co", "Mar", "Feb");

    expect(result.summary).toBeTruthy();
  });

  it("includes new/departed employee counts when present", async () => {
    const summary = makeSummary({ newEmployees: 5, departedEmployees: 3 });
    const result = await generateNarrative(summary, "Growth Inc", "P2", "P1");

    expect(result.summary).toContain("5 new");
    expect(result.summary).toContain("3");
  });
});
