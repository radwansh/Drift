import { describe, it, expect } from "vitest";
import { generateExpectedPeriods } from "../annual/periods";
import { minorUnits } from "../money";
import { buildChangeLog } from "./changelog";
import { buildEmployeeSlots } from "./slots";
import { resolveEmployeeCategory } from "./file";
import { buildYear, e0002Year, monthRows, type MonthSpec } from "./test-utils";

const expected = generateExpectedPeriods("monthly", 2025);
const decimals = minorUnits("USD");

const pay = (month: number, overrides: Partial<MonthSpec> = {}): MonthSpec => ({
  month,
  gross: 1000,
  net: 800,
  components: { "Base Salary": 1000, "Income Tax": 200 },
  ...overrides,
});

function logFor(opts: { coveredMonths: readonly number[]; paid: readonly MonthSpec[] }) {
  const { periods } = buildYear(2025, opts.coveredMonths.map((m) => pay(m)), "E1");
  const rows = opts.paid.flatMap((spec) => monthRows(2025, spec, "E1"));
  const slots = buildEmployeeSlots({
    expected, periods, cadence: "monthly", rows,
    resolve: resolveEmployeeCategory(), decimals,
  });
  return buildChangeLog({ slots, decimals });
}

describe("the July event (spec 8.1)", () => {
  /**
   * The test case the change log exists for, and the reason a rate change is
   * named **per component**: base +4.20%, housing +4.20%, transport and meal
   * flat, recurring pay +4.06%. The run-rate percentage is not the increase
   * percentage, so a single "pay rose 4.06%" entry would be a different claim
   * from the one the data supports.
   */
  const { periods, rows } = e0002Year();
  const slots = buildEmployeeSlots({
    expected, periods, cadence: "monthly", rows,
    resolve: resolveEmployeeCategory(), decimals,
  });
  const log = buildChangeLog({ slots, decimals });

  it("names the base-rate movement with its own percentage", () => {
    const base = log.filter((e) => e.kind === "base_rate");
    expect(base).toHaveLength(1);
    const entry = base[0];
    expect(entry?.key).toBe("Base Salary");
    expect(entry?.fromSlot).toBe("Jun 2025");
    expect(entry?.toSlot).toBe("Jul 2025");
    expect(entry?.previous).toBe(16187.41);
    expect(entry?.current).toBe(16867.28);
    expect(entry?.absolute).toBe(679.87);
    expect(entry?.percentage).toBeCloseTo(4.2, 2);
  });

  it("names the allowance movement separately, and leaves the flat ones alone", () => {
    const allowances = log.filter((e) => e.kind === "allowance");
    expect(allowances.map((e) => e.key)).toEqual(["Housing Allowance"]);
    expect(allowances[0]?.percentage).toBeCloseTo(4.2, 2);
    // Transport and meal did not move, so there is no entry claiming they did.
    expect(log.some((e) => e.key === "Transport Allowance")).toBe(false);
    expect(log.some((e) => e.key === "Meal Allowance")).toBe(false);
  });

  it("logs the one-offs as components added and removed", () => {
    const added = log.filter((e) => e.kind === "component_added").map((e) => e.key);
    const removed = log.filter((e) => e.kind === "component_removed").map((e) => e.key);
    expect(added).toContain("Bonus");
    expect(added).toContain("Overtime");
    expect(added).toContain("Expense Reimbursement");
    expect(removed).toContain("Bonus");
    expect(removed).toContain("Overtime");
  });

  it("opens with a first appearance and closes with a last one", () => {
    expect(log[0]?.kind).toBe("first_appearance");
    expect(log[0]?.toSlot).toBe("Jan 2025");
    expect(log[log.length - 1]?.kind).toBe("last_appearance");
    expect(log[log.length - 1]?.toSlot).toBe("Dec 2025");
  });

  it("names no cause anywhere", () => {
    /**
     * Clarivo holds no reason codes, so "promotion", "merit review" and
     * "cost-of-living adjustment" are not in this vocabulary at all. Every
     * entry states what moved.
     */
    const text = JSON.stringify(log).toLowerCase();
    for (const word of ["promotion", "merit", "cost-of-living", "performance", "review"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("gaps in the log", () => {
  it("marks an entry computed across a slot nobody uploaded", () => {
    const log = logFor({
      // March is never uploaded, so the Feb -> Apr movement spans a gap.
      coveredMonths: [1, 2, 4],
      paid: [
        pay(1),
        pay(2),
        pay(4, { gross: 1200, net: 1000, components: { "Base Salary": 1200, "Income Tax": 200 } }),
      ],
    });

    const entry = log.find((e) => e.kind === "base_rate");
    expect(entry?.fromSlot).toBe("Feb 2025");
    expect(entry?.toSlot).toBe("Apr 2025");
    expect(entry?.spansGap).toBe(true);
    // "between Feb and Apr (Mar not uploaded)".
    expect(entry?.gapLabels).toEqual(["Mar 2025"]);
  });

  it("does not mark a not_paid slot as a gap", () => {
    // February WAS uploaded; this employee simply was not paid in it. That is a
    // fact about them, not a hole in the data.
    const log = logFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1),
        pay(3, { gross: 1200, net: 1000, components: { "Base Salary": 1200, "Income Tax": 200 } }),
      ],
    });

    const entry = log.find((e) => e.kind === "base_rate");
    expect(entry?.spansGap).toBe(false);
    expect(entry?.gapLabels).toEqual([]);
  });
});

describe("what counts as a change", () => {
  it("ignores a movement at or below the currency's smallest unit", () => {
    const log = logFor({
      coveredMonths: [1, 2],
      paid: [
        pay(1, { components: { "Base Salary": 1000 } }),
        pay(2, { components: { "Base Salary": 1000.01 } }),
      ],
    });
    expect(log.filter((e) => e.kind === "base_rate")).toEqual([]);
  });

  it("distinguishes absent -> value from 0 -> value", () => {
    /**
     * Spec 7.14. A blank cell read as 0 would make "component added" fire for
     * every employee who did not work overtime, and a real 0 moving to a value
     * is a movement rather than an addition.
     */
    const added = logFor({
      coveredMonths: [1, 2],
      paid: [
        pay(1, { components: { "Base Salary": 1000, Overtime: null } }),
        pay(2, { components: { "Base Salary": 1000, Overtime: 200 } }),
      ],
    });
    expect(added.filter((e) => e.kind === "component_added").map((e) => e.key)).toEqual(["Overtime"]);

    const moved = logFor({
      coveredMonths: [1, 2],
      paid: [
        pay(1, { components: { "Base Salary": 1000, Overtime: 0 } }),
        pay(2, { components: { "Base Salary": 1000, Overtime: 200 } }),
      ],
    });
    // The key existed, so this is not an addition.
    expect(moved.filter((e) => e.kind === "component_added")).toEqual([]);
  });

  it("logs a department change", () => {
    const log = logFor({
      coveredMonths: [1, 2],
      paid: [pay(1, { department: "Engineering" }), pay(2, { department: "Operations" })],
    });
    const entry = log.find((e) => e.kind === "department");
    expect(entry?.previous).toBe("Engineering");
    expect(entry?.current).toBe("Operations");
  });

  it("logs a name change", () => {
    const log = logFor({
      coveredMonths: [1, 2],
      paid: [pay(1, { name: "Mariam Haddad" }), pay(2, { name: "Mariam Khoury" })],
    });
    const entry = log.find((e) => e.kind === "name");
    expect(entry?.previous).toBe("Mariam Haddad");
    expect(entry?.current).toBe("Mariam Khoury");
  });

  it("logs an FTE change and an FTE first appearing", () => {
    const changed = logFor({
      coveredMonths: [1, 2],
      paid: [pay(1, { fte: 1 }), pay(2, { fte: 0.5 })],
    });
    const entry = changed.find((e) => e.kind === "fte");
    expect(entry?.previous).toBe(1);
    expect(entry?.current).toBe(0.5);

    const mapped = logFor({
      coveredMonths: [1, 2],
      paid: [pay(1), pay(2, { fte: 0.8 })],
    });
    const appeared = mapped.find((e) => e.kind === "fte");
    expect(appeared?.previous).toBeNull();
    expect(appeared?.current).toBe(0.8);
  });

  it("logs a dimension change on either side", () => {
    const log = logFor({
      coveredMonths: [1, 2],
      paid: [
        pay(1, { dimensions: { Location: "Beirut" } }),
        pay(2, { dimensions: { Location: "Dubai", "Cost Centre": "CC-9" } }),
      ],
    });
    const dimensions = log.filter((e) => e.kind === "dimension");
    expect(dimensions.map((e) => e.key).sort()).toEqual(["Cost Centre", "Location"]);
    expect(dimensions.find((e) => e.key === "Location")?.previous).toBe("Beirut");
    expect(dimensions.find((e) => e.key === "Cost Centre")?.previous).toBeNull();
  });

  it("is empty for an employee with no paid slot", () => {
    expect(logFor({ coveredMonths: [1, 2], paid: [] })).toEqual([]);
  });
});
