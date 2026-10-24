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
    currentGross: null,
    previousGross: null,
    currentNet: null,
    previousNet: null,
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
        previousNet: 5000,
        currentNet: 5500,
        previousGross: 6250,
        currentGross: 6875,
        netDelta: 500,
      }),
      makeComparison({
        employeeExternalId: "2",
        status: "decreased",
        previousComponents: { salary: 3000 },
        currentComponents: { salary: 2500 },
        previousNet: 3000,
        currentNet: 2500,
        previousGross: 3750,
        currentGross: 3125,
        netDelta: -500,
      }),
    ];

    const result = aggregateResults(results);
    expect(result.totalPayrollVariance.absolute).toBe(0);
    expect(result.totalPayrollVariance.percentage).toBe(0);
    expect(result.totalNet).toEqual({ previous: 8000, current: 8000, absolute: 0, percentage: 0 });
    expect(result.totalGross).toEqual({ previous: 10_000, current: 10_000, absolute: 0, percentage: 0 });
  });

  /**
   * The regression test for the headline bug.
   *
   * Deduction columns are **positive** here, which is the case the repo had no
   * fixture for — every existing one carried a negative tax column, where the
   * component sum happens to equal net and the bug is invisible. With positive
   * deductions the component sum comes to gross plus deductions, so all three
   * figures differ and the headline cannot accidentally be right.
   */
  it("reports net and gross, never the sum of components", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        status: "increased",
        // Sum: 10,000 -> 11,000. Gross: 8,000 -> 8,800. Net: 6,000 -> 6,600.
        previousComponents: { base: 8000, tax: 2000 },
        currentComponents: { base: 8800, tax: 2200 },
        previousGross: 8000,
        currentGross: 8800,
        previousNet: 6000,
        currentNet: 6600,
        netDelta: 600,
      }),
    ];

    const result = aggregateResults(results);

    expect(result.totalNet.absolute).toBe(600);
    expect(result.totalGross.absolute).toBe(800);
    // The old behaviour: 11,000 - 10,000.
    expect(result.totalPayrollVariance.absolute).not.toBe(1000);
    expect(result.totalPayrollVariance.absolute).toBe(600);

    // The three money cells in a top-movers row must tie.
    const mover = result.topMovers[0]!;
    expect(mover.currentNet - mover.previousNet).toBeCloseTo(mover.changeAmount, 2);
    expect(mover.previousNet).toBe(6000);
    expect(mover.currentNet).toBe(6600);

    // Percentage is against the employee's own previous net, not the sum.
    expect(mover.changePercentage).toBe(10);
  });

  it("counts a missing gross or net instead of adding it as zero", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        status: "increased",
        previousNet: 1000,
        currentNet: 1200,
        previousGross: 1000,
        // Current gross absent: must not read as a 1,000 drop.
        currentGross: null,
        netDelta: 200,
      }),
    ];

    const result = aggregateResults(results);
    expect(result.incompleteTotals).toEqual({ grossMissing: 1, netMissing: 0 });
    expect(result.totalNet.absolute).toBe(200);
  });

  it("reports an unmeasurable percentage as null rather than zero", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        status: "new",
        currentNet: 4000,
        currentGross: 5000,
      }),
    ];

    const result = aggregateResults(results);
    expect(result.totalNet.previous).toBe(0);
    expect(result.totalNet.current).toBe(4000);
    // A movement from nothing is not a 0% change.
    expect(result.totalNet.percentage).toBeNull();
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
      // Bucketing is against each employee's own previous net, so these need
      // net populated — the component values alone no longer stand in for it.
      makeComparison({ status: "increased", netDelta: 1500, previousNet: 5000, currentNet: 6500, previousComponents: { salary: 5000 }, currentComponents: { salary: 6500 } }),
      makeComparison({ status: "decreased", netDelta: -1000, previousNet: 5000, currentNet: 4000, previousComponents: { salary: 5000 }, currentComponents: { salary: 4000 } }),
      makeComparison({ status: "unchanged", netDelta: 0, previousNet: 5000, currentNet: 5000, previousComponents: { salary: 5000 }, currentComponents: { salary: 5000 } }),
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
    expect(result.topMovers[0]!.employeeName).toBe("Alice");
    expect(result.topMovers[0]!.changeAmount).toBe(5000);
  });

  it("computes department breakdown", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        department: "Eng",
        status: "increased",
        // Department totals are gross.
        previousGross: 5000,
        currentGross: 6000,
        previousComponents: { salary: 5000 },
        currentComponents: { salary: 6000 },
      }),
      makeComparison({
        employeeExternalId: "2",
        employeeName: "Bob",
        department: "Sales",
        status: "unchanged",
        previousGross: 4000,
        currentGross: 4000,
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
    expect(result.anomalies[0]!.type).toBe("test");
  });
});
