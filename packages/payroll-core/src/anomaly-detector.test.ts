import { describe, it, expect } from "vitest";
import { detectAnomalies, collectAnomalies, DEFAULT_TOLERANCES } from "./anomaly-detector";
import { diffComponents } from "./differ";
import type { EmployeeRecord, ComparisonOutput } from "./types";

function makeComparison(overrides: Partial<ComparisonOutput>): ComparisonOutput {
  const base: ComparisonOutput = {
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
  // Derive the deltas rather than hand-writing them, so a fixture cannot
  // describe a component movement the figures do not support.
  if (!overrides.componentDeltas) {
    base.componentDeltas = diffComponents(base.currentComponents, base.previousComponents);
  }
  return base;
}

function rec(components: Record<string, number | null>, gross: number, net: number): EmployeeRecord {
  return { externalId: "1", name: "Alice", department: "Eng", components, grossSalary: gross, netSalary: net };
}

const types = (flags: { type: string }[]) => flags.map((f) => f.type);

/**
 * Step 5. The old set produced 3,166 flags across the twelve samples/2025
 * registers, none critical, all of them the zero-value rule. These cases are
 * the exceptions that replaced it.
 */
describe("detectAnomalies - impossible values", () => {
  it("flags net above gross as critical", () => {
    const comp = makeComparison({ currentGross: 5000, currentNet: 7000, previousNet: 5000, netDelta: 2000 });
    const flags = detectAnomalies(rec({}, 5000, 7000), rec({}, 5000, 5000), comp);

    const flag = flags.find((f) => f.type === "net_exceeds_gross")!;
    expect(flag.severity).toBe("critical");
    // The old detector said "Net changed by 45.5% but no individual component
    // changed" here: true about the data, and the wrong diagnosis.
    expect(flag.description).toMatch(/above gross/i);
  });

  it("flags negative net as critical", () => {
    const comp = makeComparison({ currentGross: 1000, currentNet: -250, previousNet: 900, netDelta: -1150 });
    const flags = detectAnomalies(rec({}, 1000, -250), rec({}, 1000, 900), comp);
    expect(flags.find((f) => f.type === "negative_net")?.severity).toBe("critical");
  });

  it("checks impossible values for a joiner too", () => {
    // No previous record, so the old guard returned early and checked nothing.
    // Net above gross is the same defect whether or not the person is new.
    const comp = makeComparison({ status: "new", currentGross: 5000, currentNet: 6000 });
    const flags = detectAnomalies(rec({}, 5000, 6000), null, comp);
    expect(types(flags)).toContain("net_exceeds_gross");
  });
});

describe("detectAnomalies - rate and net movements", () => {
  it("flags a base-salary rise beyond tolerance, which fired nothing before", () => {
    // The audit's case: a 40% base rise with nothing else changed produced no
    // flag of any kind.
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000 },
      currentComponents: { "Basic Salary": 7000 },
      previousGross: 5000,
      currentGross: 7000,
      previousNet: 5000,
      currentNet: 7000,
      netDelta: 2000,
    });
    const flags = detectAnomalies(rec({ "Basic Salary": 7000 }, 7000, 7000), rec({ "Basic Salary": 5000 }, 5000, 5000), comp);

    const flag = flags.find((f) => f.type === "base_rate_change")!;
    expect(flag).toBeDefined();
    expect(flag.severity).toBe("warning");
    expect(flag.description).toMatch(/rose 40\.0%/);
  });

  it("stays quiet on a base movement inside tolerance", () => {
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000 },
      currentComponents: { "Basic Salary": 5100 },
      previousNet: 5000,
      currentNet: 5100,
      netDelta: 100,
    });
    const flags = detectAnomalies(rec({ "Basic Salary": 5100 }, 5100, 5100), rec({ "Basic Salary": 5000 }, 5000, 5000), comp);
    expect(types(flags)).not.toContain("base_rate_change");
  });

  it("honours a per-company tolerance", () => {
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000 },
      currentComponents: { "Basic Salary": 5100 },
      previousNet: 5000,
      currentNet: 5100,
      netDelta: 100,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 5100 }, 5100, 5100),
      rec({ "Basic Salary": 5000 }, 5000, 5000),
      comp,
      { tolerances: { baseChangePct: 1 } },
    );
    expect(types(flags)).toContain("base_rate_change");
  });

  it("names the component driving a net movement", () => {
    // The rule this replaces only fired when *no* component had changed —
    // the one case where there is nothing to name.
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 4000, Bonus: 0 },
      currentComponents: { "Basic Salary": 4000, Bonus: 2000 },
      previousNet: 4000,
      currentNet: 6000,
      netDelta: 2000,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 4000, Bonus: 2000 }, 6000, 6000),
      rec({ "Basic Salary": 4000, Bonus: 0 }, 4000, 4000),
      comp,
    );

    const flag = flags.find((f) => f.type === "net_change_beyond_tolerance")!;
    expect(flag.description).toMatch(/Bonus/);
    expect(flag.description).toMatch(/rose 50\.0%/);
  });

  it("measures the net movement against net, not against the component sum", () => {
    // The audit's case: previous net 4,000 -> 4,960 is +24.0%, but the old
    // rule divided by the component sum (6,000) and computed 16.0%, so it
    // stayed silent below its own 20% threshold.
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 4000, "Income Tax": 2000 },
      currentComponents: { "Basic Salary": 4960, "Income Tax": 2000 },
      previousNet: 4000,
      currentNet: 4960,
      netDelta: 960,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 4960, "Income Tax": 2000 }, 6960, 4960),
      rec({ "Basic Salary": 4000, "Income Tax": 2000 }, 6000, 4000),
      comp,
    );
    expect(flags.find((f) => f.type === "net_change_beyond_tolerance")?.description).toMatch(/24\.0%/);
  });
});

describe("detectAnomalies - components appearing and disappearing", () => {
  it("flags a component appearing with a value", () => {
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000 },
      currentComponents: { "Basic Salary": 5000, Housing: 300 },
      previousNet: 5000,
      currentNet: 5300,
      netDelta: 300,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 5000, Housing: 300 }, 5300, 5300),
      rec({ "Basic Salary": 5000 }, 5000, 5000),
      comp,
    );
    expect(types(flags)).toContain("new_component_with_value");
  });

  it("ignores a component appearing with nothing in it", () => {
    // The old rule flagged a new key whatever it held. A column the register
    // had simply not used before is not an event.
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000 },
      currentComponents: { "Basic Salary": 5000, Overtime: 0 },
      previousNet: 5000,
      currentNet: 5000,
      netDelta: 0,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 5000, Overtime: 0 }, 5000, 5000),
      rec({ "Basic Salary": 5000 }, 5000, 5000),
      comp,
    );
    expect(types(flags)).not.toContain("new_component_with_value");
  });

  it("flags a paid component that disappeared", () => {
    const comp = makeComparison({
      previousComponents: { "Basic Salary": 5000, Housing: 300 },
      currentComponents: { "Basic Salary": 5000 },
      previousNet: 5300,
      currentNet: 5000,
      netDelta: -300,
    });
    const flags = detectAnomalies(
      rec({ "Basic Salary": 5000 }, 5000, 5000),
      rec({ "Basic Salary": 5000, Housing: 300 }, 5300, 5300),
      comp,
    );
    expect(types(flags)).toContain("component_removed_with_value");
  });
});

describe("detectAnomalies - employer contribution", () => {
  it("flags an employee contribution with no employer counterpart", () => {
    const components = { "Basic Salary": 5000, "Social Security Employee": 400 };
    const comp = makeComparison({
      previousComponents: components,
      currentComponents: components,
      previousNet: 4600,
      currentNet: 4600,
      netDelta: 0,
    });
    const flags = detectAnomalies(rec(components, 5000, 4600), rec(components, 5000, 4600), comp);
    expect(types(flags)).toContain("employer_contribution_missing");
  });

  it("stays quiet when the employer side is mapped", () => {
    const components = {
      "Basic Salary": 5000,
      "Social Security Employee": 400,
      "Employer Social Security": 600,
    };
    const comp = makeComparison({
      previousComponents: components,
      currentComponents: components,
      previousNet: 4600,
      currentNet: 4600,
      netDelta: 0,
    });
    const flags = detectAnomalies(rec(components, 5000, 4600), rec(components, 5000, 4600), comp);
    expect(types(flags)).not.toContain("employer_contribution_missing");
  });
});

/**
 * The measurement that justified the rebuild, as a test rather than a claim.
 */
describe("detectAnomalies - the noise is gone", () => {
  it("raises nothing on an unchanged payroll whose optional components are zero", () => {
    // The audit's synthetic control: payroll completely unchanged, Overtime
    // and Bonus at zero. The old detector produced two flags per employee,
    // one of them severity "warning", for a month in which nothing happened.
    const components = { "Basic Salary": 5000, Overtime: 0, Bonus: 0 };
    const comp = makeComparison({
      previousComponents: components,
      currentComponents: components,
      previousGross: 5000,
      currentGross: 5000,
      previousNet: 5000,
      currentNet: 5000,
      netDelta: 0,
      grossDelta: 0,
    });
    const flags = detectAnomalies(rec(components, 5000, 5000), rec(components, 5000, 5000), comp);
    expect(flags).toEqual([]);
  });

  it("has defaults that keep the old net threshold", () => {
    expect(DEFAULT_TOLERANCES.netChangePct).toBe(20);
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
    expect(collected[0]!.employeeId).toBe("1");
    expect(collected[1]!.employeeId).toBe("2");
  });

  it("skips results with null anomalyFlags", () => {
    const results: ComparisonOutput[] = [
      makeComparison({ anomalyFlags: null }),
    ];
    expect(collectAnomalies(results)).toHaveLength(0);
  });
});
