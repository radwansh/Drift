import { describe, it, expect } from "vitest";
import { detectAnomalies, collectAnomalies } from "./anomaly-detector";
import type { EmployeeRecord, ComparisonOutput } from "./types";

function makeComparison(overrides: Partial<ComparisonOutput>): ComparisonOutput {
  return {
    employeeExternalId: "1",
    employeeName: "Alice",
    department: "Eng",
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

describe("detectAnomalies", () => {
  it("returns empty for new employees", () => {
    const flags = detectAnomalies(null, { externalId: "1", name: "A", department: null, components: {}, grossSalary: 0, netSalary: 0 }, makeComparison({}));
    expect(flags).toHaveLength(0);
  });

  it("returns empty for departed employees", () => {
    const flags = detectAnomalies({ externalId: "1", name: "A", department: null, components: {}, grossSalary: 0, netSalary: 0 }, null, makeComparison({}));
    expect(flags).toHaveLength(0);
  });

  it("flags large net change without component change", () => {
    const flags = detectAnomalies(
      { externalId: "1", name: "Alice", department: "Eng", components: { salary: 5000 }, grossSalary: 5000, netSalary: 5000 },
      { externalId: "1", name: "Alice", department: "Eng", components: { salary: 5000 }, grossSalary: 4000, netSalary: 4000 },
      makeComparison({
        currentComponents: { salary: 5000 },
        previousComponents: { salary: 5000 },
        grossDelta: 1000,
        netDelta: 1000,
      }),
    );
    expect(flags.some((f) => f.type === "large_net_change_no_component_change")).toBe(true);
  });

  it("flags new components", () => {
    const flags = detectAnomalies(
      { externalId: "1", name: "A", department: null, components: { salary: 5000, bonus: 500 }, grossSalary: 5500, netSalary: 5500 },
      { externalId: "1", name: "A", department: null, components: { salary: 5000 }, grossSalary: 5000, netSalary: 5000 },
      makeComparison({
        currentComponents: { salary: 5000, bonus: 500 },
        previousComponents: { salary: 5000 },
        componentDeltas: [],
      }),
    );
    expect(flags.some((f) => f.type === "new_component")).toBe(true);
  });

  it("flags removed components", () => {
    const flags = detectAnomalies(
      { externalId: "1", name: "A", department: null, components: { salary: 5000 }, grossSalary: 5000, netSalary: 5000 },
      { externalId: "1", name: "A", department: null, components: { salary: 5000, bonus: 500 }, grossSalary: 5500, netSalary: 5500 },
      makeComparison({
        currentComponents: { salary: 5000 },
        previousComponents: { salary: 5000, bonus: 500 },
        componentDeltas: [],
      }),
    );
    expect(flags.some((f) => f.type === "removed_component")).toBe(true);
  });

  it("flags zero salary components", () => {
    const flags = detectAnomalies(
      { externalId: "1", name: "A", department: null, components: { salary: 0 }, grossSalary: 0, netSalary: 0 },
      { externalId: "1", name: "A", department: null, components: { salary: 5000 }, grossSalary: 5000, netSalary: 5000 },
      makeComparison({
        currentComponents: { salary: 0 },
        previousComponents: { salary: 5000 },
      }),
    );
    expect(flags.some((f) => f.type === "zero_salary_component")).toBe(true);
  });
});

describe("collectAnomalies", () => {
  it("collects anomalies from multiple results", () => {
    const results: ComparisonOutput[] = [
      makeComparison({
        employeeExternalId: "1",
        employeeName: "Alice",
        anomalyFlags: [{ type: "test", severity: "warning", description: "flag1" }],
      }),
      makeComparison({
        employeeExternalId: "2",
        employeeName: "Bob",
        anomalyFlags: [{ type: "test", severity: "info", description: "flag2" }],
      }),
    ];

    const collected = collectAnomalies(results);
    expect(collected).toHaveLength(2);
    expect(collected[0].employeeId).toBe("1");
    expect(collected[1].employeeId).toBe("2");
  });

  it("skips results with null anomalyFlags", () => {
    const results: ComparisonOutput[] = [
      makeComparison({ anomalyFlags: null }),
    ];
    expect(collectAnomalies(results)).toHaveLength(0);
  });
});
