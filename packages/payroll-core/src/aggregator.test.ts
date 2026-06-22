import { describe, it, expect } from "vitest";
import { aggregateResults } from "./aggregator";
import type { ComparisonOutput } from "./types";

function makeComparison(overrides: Partial<ComparisonOutput>): ComparisonOutput {
  return {
    employeeExternalId: "1",
    employeeName: "Test",
    department: null,
    currentComponents: {},
    previousComponents: {},
    componentDeltas: [],
    grossDelta: null,
    netDelta: null,
    status: "unchanged",
    anomalyFlags: null,
    ...overrides,
  };
}

describe("aggregateResults", () => {
  it("returns empty summary for no results", () => {
    const result = aggregateResults([]);
    expect(result.employeesAffected.total).toBe(0);
    expect(result.distribution).toHaveLength(5);
  });

  it("counts employee statuses correctly", () => {
    const results: ComparisonOutput[] = [
      makeComparison({ employeeExternalId: "1", status: "increased", netDelta: 500, previousComponents: { salary: 5000 }, currentComponents: { salary: 5500 } }),
      makeComparison({ employeeExternalId: "2", status: "decreased", netDelta: -300, previousComponents: { salary: 5000 }, currentComponents: { salary: 4700 } }),
      makeComparison({ employeeExternalId: "3", status: "unchanged", netDelta: 0, previousComponents: { salary: 5000 }, currentComponents: { salary: 5000 } }),
      makeComparison({ employeeExternalId: "4", status: "new", previousComponents: {}, currentComponents: { salary: 4000 } }),
      makeComparison({ employeeExternalId: "5", status: "departed", previousComponents: { salary: 4000 }, currentComponents: {} }),
    ];

    const result = aggregateResults(results);
    expect(result.employeesAffected.increased).toBe(1);
    expect(result.employeesAffected.decreased).toBe(1);
    expect(result.employeesAffected.unchanged).toBe(1);
    expect(result.newEmployees).toBe(1);
    expect(result.departedEmployees).toBe(1);
  });

  it("calculates total payroll variance", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        status: "increased",
        previousComponents: { salary: 5000 },
        currentComponents: { salary: 5500 },
        netDelta: 500,
      }),
      makeComparison({
        employeeExternalId: "2",
        status: "decreased",
        previousComponents: { salary: 3000 },
        currentComponents: { salary: 2500 },
        netDelta: -500,
      }),
    ];

    const result = aggregateResults(results);
    expect(result.totalPayrollVariance.absolute).toBe(0);
    expect(result.totalPayrollVariance.percentage).toBe(0);
  });

  it("finds largest increase and decrease", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        department: "Eng",
        status: "increased",
        netDelta: 1000,
        previousComponents: { salary: 5000 },
        currentComponents: { salary: 6000 },
      }),
      makeComparison({
        employeeExternalId: "2",
        employeeName: "Bob",
        department: "Sales",
        status: "decreased",
        netDelta: -2000,
        previousComponents: { salary: 8000 },
        currentComponents: { salary: 6000 },
      }),
    ];

    const result = aggregateResults(results);
    expect(result.largestIncrease?.employeeName).toBe("Alice");
    expect(result.largestIncrease?.amount).toBe(1000);
    expect(result.largestDecrease?.employeeName).toBe("Bob");
    expect(result.largestDecrease?.amount).toBe(-2000);
  });

  it("computes distribution buckets", () => {
    const results: ComparisonOutput[] = [
      makeComparison({ status: "increased", netDelta: 1500, previousComponents: { salary: 5000 }, currentComponents: { salary: 6500 } }),
      makeComparison({ status: "decreased", netDelta: -1000, previousComponents: { salary: 5000 }, currentComponents: { salary: 4000 } }),
      makeComparison({ status: "unchanged", netDelta: 0, previousComponents: { salary: 5000 }, currentComponents: { salary: 5000 } }),
    ];

    const result = aggregateResults(results);
    const inc10 = result.distribution.find((d) => d.label === "increased >10%");
    const dec10 = result.distribution.find((d) => d.label === "decreased >10%");
    const unc = result.distribution.find((d) => d.label === "unchanged");
    expect(inc10?.count).toBe(1);
    expect(dec10?.count).toBe(1);
    expect(unc?.count).toBe(1);
  });

  it("computes top movers", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        status: "increased",
        netDelta: 5000,
        previousComponents: { salary: 10000 },
        currentComponents: { salary: 15000 },
      }),
      makeComparison({
        employeeExternalId: "2",
        employeeName: "Bob",
        status: "decreased",
        netDelta: -3000,
        previousComponents: { salary: 10000 },
        currentComponents: { salary: 7000 },
      }),
    ];

    const result = aggregateResults(results);
    expect(result.topMovers).toHaveLength(2);
    expect(result.topMovers[0].employeeName).toBe("Alice");
    expect(result.topMovers[0].changeAmount).toBe(5000);
  });

  it("computes department breakdown", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        department: "Eng",
        status: "increased",
        previousComponents: { salary: 5000 },
        currentComponents: { salary: 6000 },
      }),
      makeComparison({
        employeeExternalId: "2",
        employeeName: "Bob",
        department: "Sales",
        status: "unchanged",
        previousComponents: { salary: 4000 },
        currentComponents: { salary: 4000 },
      }),
    ];

    const result = aggregateResults(results);
    expect(result.departmentBreakdown).toHaveLength(2);
    const eng = result.departmentBreakdown.find((d) => d.department === "Eng")!;
    expect(eng.absoluteChange).toBe(1000);
  });

  it("collects anomalies", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        anomalyFlags: [{ type: "test", severity: "critical", description: "Critical issue" }],
      }),
    ];

    const result = aggregateResults(results);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe("test");
  });
});
