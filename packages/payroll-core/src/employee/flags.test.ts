import { describe, it, expect } from "vitest";
import { generateExpectedPeriods } from "../annual/periods";
import { minorUnits } from "../money";
import { buildEmployeeSlots, paidSlots } from "./slots";
import { sumSlots } from "./totals";
import { buildEmployeeFlags, reconcileEmployeeRange } from "./flags";
import { resolveEmployeeCategory } from "./file";
import { buildYear, e0002Year, type MonthSpec } from "./test-utils";

const expected = generateExpectedPeriods("monthly", 2025);
const decimals = minorUnits("USD");

function slotsFor(specs: readonly MonthSpec[], externalId = "E1") {
  const { periods, rows } = buildYear(2025, specs, externalId);
  return buildEmployeeSlots({
    expected,
    periods,
    cadence: "monthly",
    rows,
    resolve: resolveEmployeeCategory(),
    decimals,
  });
}

describe("the reconciliation cross-check (step C4)", () => {
  /**
   * `totals.unplaced` for the range should equal the sum of the per-slot
   * `earnBal` from C3, because both model unplaced money as sitting on the
   * earnings side — `other_earnings_balance` does the same thing for the
   * company. A cheap assertion that C3 and `reconcile.ts` have not drifted into
   * two answers about where unmapped money goes.
   */
  it("agrees with the per-slot earnBal on E0002's reimbursements", () => {
    const { periods, rows } = e0002Year();
    const slots = buildEmployeeSlots({
      expected, periods, cadence: "monthly", rows,
      resolve: resolveEmployeeCategory(), decimals,
    });

    const report = reconcileEmployeeRange({ slots, decimals });
    const earnBal = sumSlots(paidSlots(slots), (s) => s.earnBal, decimals);

    expect(report.totals.unplaced).toBe(3604.74);
    expect(report.totals.unplaced).toBe(earnBal);
    // An unmapped column is declared, not a breach: blocking on it would make
    // the gate unusable on the first real register.
    expect(report.breaches).toEqual([]);
    expect(report.balanced).toBe(true);
  });
});

describe("impossible arithmetic (spec 7.16)", () => {
  /**
   * Run on **every** slot in range, so a historical breach is visible when it
   * is being investigated rather than only in the month it was uploaded. Both
   * are `critical`, and both must be findable from the list without opening
   * four hundred files.
   */
  const slots = slotsFor([
    { month: 1, gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } },
    // Net above gross: a deduction mapped to the wrong side.
    { month: 2, gross: 1000, net: 1200, components: { "Base Salary": 1000, "Income Tax": -200 } },
    // A negative net. Nobody is paid less than nothing.
    { month: 3, gross: 1000, net: -50, components: { "Base Salary": 1000, "Income Tax": 1050 } },
  ]);

  const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });

  it("raises both, as critical, naming the slot", () => {
    const critical = flags.filter((f) => f.severity === "critical");
    const types = new Set(critical.map((f) => f.type));
    expect(types.has("net_exceeds_gross")).toBe(true);
    expect(types.has("negative_net")).toBe(true);

    const exceeds = critical.find((f) => f.type === "net_exceeds_gross");
    expect(exceeds?.slotLabel).toBe("Feb 2025");
    expect(exceeds?.slotIndex).toBe(2);
  });

  it("carries the expected figure, the register's figure and the difference", () => {
    const exceeds = flags.find((f) => f.type === "net_exceeds_gross");
    expect(exceeds?.expected).toBe(1000);
    expect(exceeds?.actual).toBe(1200);
    expect(exceeds?.difference).toBe(200);
    expect(exceeds?.source).toBe("reconciliation");
  });

  it("raises each impossibility once, not once per pair", () => {
    // `detectAnomalies` checks these on the current period alone, so iterating
    // pairs would double-count them and miss the first paid slot entirely.
    // Reconciliation owns them, which is both complete and deduplicated.
    expect(flags.filter((f) => f.type === "negative_net")).toHaveLength(1);
    expect(flags.filter((f) => f.type === "net_exceeds_gross")).toHaveLength(1);
  });
});

describe("mixed sign across the range (spec 7.15)", () => {
  /**
   * The reason for the pseudo-row shape. `reconcileRegister` infers a
   * deduction column's sign convention **per column across its rows**, so
   * passing one row per slot makes "this key has both signs for this employee
   * in range" fall out of a function that already does it.
   *
   * It is not obtainable by calling the function per slot: with one row there
   * is only ever one sign. A later reader who "simplifies" this into a per-slot
   * call silently loses all mixed-sign detection, which is what this test is
   * here to stop.
   */
  const slots = slotsFor([
    { month: 1, gross: 1000, net: 900, components: { "Base Salary": 1000, "Loan Recovery": 100 } },
    { month: 2, gross: 1000, net: 900, components: { "Base Salary": 1000, "Loan Recovery": 100 } },
    // Written the other way round in one month only.
    { month: 3, gross: 1000, net: 1100, components: { "Base Salary": 1000, "Loan Recovery": -100 } },
  ]);

  it("detects the column, and the per-slot call would not", () => {
    const acrossRange = reconcileEmployeeRange({ slots, decimals });
    expect(acrossRange.mixedSignColumns.map((c) => c.componentKey)).toEqual(["Loan Recovery"]);

    // The same data, one slot at a time: nothing found, on every slot.
    for (const slot of paidSlots(slots)) {
      const perSlot = reconcileEmployeeRange({ slots: [slot], decimals });
      expect(perSlot.mixedSignColumns).toEqual([]);
    }
  });

  it("reports it as a warning that names what is suppressed", () => {
    const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    const mixed = flags.find((f) => f.type === "mixed_sign_column");
    expect(mixed?.severity).toBe("warning");
    expect(mixed?.description).toContain("Loan Recovery");
    expect(mixed?.description).toContain("deduction identity is not stated");
  });
});

describe("pairwise anomaly flags", () => {
  it("skips a pair where either side is a duplicate", () => {
    /**
     * Summing two rows looks like a doubling, so a duplicate slot would fire
     * `net_change_beyond_tolerance` spuriously — reporting a 100% pay rise for
     * a register that paid the same salary twice.
     */
    const slots = slotsFor([
      { month: 1, gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } },
      {
        month: 2, gross: 1000, net: 800,
        components: { "Base Salary": 1000, "Income Tax": 200 },
        extraRows: [{ gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } }],
      },
      { month: 3, gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } },
    ]);

    expect(slots[1]?.kind).toBe("duplicate");
    const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    expect(flags.filter((f) => f.type === "net_change_beyond_tolerance")).toEqual([]);
  });

  it("marks a pair computed across a missing slot as spanning a gap", () => {
    const slots = slotsFor([
      { month: 1, gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } },
      // March is never uploaded, so the Feb->Apr pair spans a gap.
      { month: 4, gross: 2000, net: 1600, components: { "Base Salary": 2000, "Income Tax": 400 } },
    ]);

    const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    const movement = flags.find((f) => f.source === "anomaly" && f.slotLabel === "Apr 2025");
    expect(movement?.spansGap).toBe(true);
  });

  it("reports which tolerances were used", () => {
    const slots = slotsFor([{ month: 1, gross: 1000, net: 800 }]);

    const defaults = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    expect(defaults.tolerancesSource).toBe("default");
    expect(defaults.tolerances.netChangePct).toBe(20);

    // A 20% net threshold is a company policy, not a law of payroll, so the
    // result says which was applied.
    const company = buildEmployeeFlags({
      externalId: "E1", slots, decimals, tolerances: { netChangePct: 35 },
    });
    expect(company.tolerancesSource).toBe("company");
    expect(company.tolerances.netChangePct).toBe(35);
  });

  it("does not flag a zero-valued component", () => {
    /**
     * The rule that is deliberately not reintroduced: it produced 3,166 flags
     * across the twelve `samples/2025` registers, all one rule, none actionable.
     * Spec 7.14's distinction replaces it — absent renders blank, a real 0
     * renders 0.00.
     */
    const slots = slotsFor([
      { month: 1, gross: 1000, net: 800, components: { "Base Salary": 1000, Overtime: 0 } },
      { month: 2, gross: 1000, net: 800, components: { "Base Salary": 1000, Overtime: 0 } },
    ]);

    const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    expect(flags.filter((f) => f.type === "new_component_with_value")).toEqual([]);
    expect(flags.filter((f) => f.type === "component_removed_with_value")).toEqual([]);
  });

  it("treats absent and a real zero differently", () => {
    const slots = slotsFor([
      // Blank cell in January: absent, not 0.
      { month: 1, gross: 1000, net: 800, components: { "Base Salary": 1000, Overtime: null } },
      { month: 2, gross: 1200, net: 960, components: { "Base Salary": 1000, Overtime: 200 } },
    ]);

    const january = slots[0];
    const february = slots[1];
    // An absent cell contributes no key at all, so the matrix renders blank.
    expect(january?.byKey["Overtime"]).toBeUndefined();
    expect(february?.byKey["Overtime"]?.total).toBe(200);

    const { flags } = buildEmployeeFlags({ externalId: "E1", slots, decimals });
    // Absent -> a value is "component added".
    expect(flags.some((f) => f.type === "new_component_with_value")).toBe(true);
  });
});
