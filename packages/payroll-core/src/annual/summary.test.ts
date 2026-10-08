import { describe, it, expect } from "vitest";
import { computeSummary } from "./summary";
import { computeYoY } from "./yoy";
import { monthPeriod, period, pos, neg, qty, monthStart } from "./test-utils";
import { endOfMonth } from "./dates";
import { classifyComponent } from "./classify";

function summaryFor(overrides: Partial<Parameters<typeof computeSummary>[0]> = {}) {
  return computeSummary({
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    allPeriodTypes: ["monthly"],
    allCurrencies: ["USD"],
    periods: [],
    forecastMethod: undefined,
    ...overrides,
  });
}

describe("computeSummary sign conventions and quantities", () => {
  it("treats a deduction stored positive as an expense and preserves negative earnings signs", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1500,
      net: 1250,
      components: [pos("Base Salary", 2000), neg("Bonus", 500), pos("Income Tax", 250), qty("Absence Days", 3), pos("Mystery X", 100)],
    });

    const s = summaryFor({ periods: [jan] });

    expect(s.categories.byCategory.bonus_commission).toBe(-500);
    expect(s.categories.byCategory.income_tax).toBe(250);
    expect(s.quantities.absence_days).toBe(3);
    expect(s.categories.byKey["Mystery X"]!.category).toBe("uncategorised");
    expect(s.warnings.some((w) => w.includes("UNCATEGORISED"))).toBe(true);

    expect(s.bridge.actual.gross).toBe(1500);
    expect(s.bridge.actual.employeeDeductions).toBe(250);
    expect(s.bridge.actual.net).toBe(1250);
    // Bridge always balances: net === gross - employee deductions - balance
    expect(s.bridge.actual.gross - s.bridge.actual.employeeDeductions - s.bridge.actual.balance).toBeCloseTo(s.bridge.actual.net, 2);
  });

  it("never counts quantities in money totals", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1100,
      net: 900,
      components: [pos("Base Salary", 1100), qty("Overtime Hours", 40), qty("Absence Days", 2)],
    });
    const s = summaryFor({ periods: [jan] });
    expect(s.quantities.other_quantity).toBe(40);
    expect(s.quantities.absence_days).toBe(2);
    expect(Object.keys(s.bridge.actual)).toContain("gross");
    expect(s.bridge.actual.gross).toBe(1100);
  });

  it("raises MIXED_SIGN when a deduction component has both signed rows across the year", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1100,
      net: 1000,
      components: [pos("Base Salary", 1100), pos("Loan Recovery", 100)],
    });
    const feb = period({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gross: 1100,
      net: 1000,
      components: [pos("Base Salary", 1100), neg("Loan Recovery", 80)],
    });
    const s = summaryFor({ periods: [jan, feb] });
    expect(s.warnings.some((w) => w.includes("MIXED_SIGN") && w.includes("Loan Recovery"))).toBe(true);
  });
});

describe("computeSummary coverage and warnings", () => {
  it("flags a missing June and counts duplicates once", () => {
    const months = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    const periods = months.flatMap((m, i) => {
      const base = monthPeriod(2026, m);
      // simulate a duplicate upload of March
      if (m === 3) {
        return [base, { ...base, createdAt: `${base.periodEnd}T23:00:00Z`, gross: 9999 }];
      }
      return [base];
    });

    const s = summaryFor({ periods });
    expect(s.coverage.uploaded).toBe(11);
    expect(s.coverage.expected).toBe(12);
    expect(s.missingLabels).toEqual(["Jun 2026"]);
    expect(s.warnings.some((w) => w.includes("MISSING_PERIODS"))).toBe(true);
  });

  it("emits MIXED_CADENCE and MULTI_CURRENCY warnings", () => {
    const jan = monthPeriod(2026, 1);
    const s = summaryFor({
      periods: [jan],
      allPeriodTypes: ["monthly", "weekly"],
      allCurrencies: ["USD", "EUR"],
    });
    expect(s.warnings.some((w) => w.includes("MIXED_CADENCE"))).toBe(true);
    expect(s.warnings.some((w) => w.includes("MULTI_CURRENCY"))).toBe(true);
  });

  it("returns zeros without NaN for an empty year", () => {
    const s = summaryFor();
    expect(s.warnings.some((w) => w.includes("NO_DATA"))).toBe(true);
    expect(s.bridge.actual.gross).toBe(0);
    expect(s.bridge.actual.net).toBe(0);
    expect(s.coverage.uploaded).toBe(0);
    expect(Number.isNaN(s.bridge.actual.gross)).toBe(false);
    expect(Number.isNaN(s.avgHeadcountFullYear)).toBe(false);
    expect(Number.isNaN(s.yoy.changePct.gross ?? 0)).toBe(false);
    expect(s.quantities).toEqual({});
  });
});

describe("computeSummary headcount flows", () => {
  it("computes joiners and leavers against the previous year's last period", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1000,
      net: 800,
      headcount: 3,
      employeeIds: ["1", "2", "3"],
    });
    const feb = period({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gross: 1000,
      net: 800,
      headcount: 2,
      employeeIds: ["2", "3"],
    });

    const s = summaryFor({ periods: [jan, feb], previousYearLastEmployeeIds: ["1", "2"] });
    const flows = s.headcount.perPeriod;
    expect(flows[0]).toMatchObject({ headcount: 3, joiners: 1, leavers: 0 });
    expect(flows[1]).toMatchObject({ headcount: 2, joiners: 0, leavers: 1 });
    expect(s.headcount.joinerTotal).toBe(1);
    expect(s.headcount.leaverTotal).toBe(1);
  });
});

describe("computeYoY", () => {
  it("compares like-for-like periods only", () => {
    const mk = (year: number, months: number[], base: number) =>
      months.map((m) =>
        period({
          periodType: "monthly",
          periodStart: monthStart(year, m),
          periodEnd: endOfMonth(year, m),
          gross: base,
          net: base * 0.8,
          components: [pos("Base Salary", base), neg("Income Tax", base * 0.2)],
        }),
      );

    const current = mk(2026, [1, 2, 3, 4], 1100);
    const previous = mk(2025, [1, 2, 3], 1000);
    const yoy = computeYoY(current, previous, 12 * 1100);

    expect(yoy.available).toBe(true);
    expect(yoy.comparablePeriods).toBe(3);
    expect(yoy.currentGross).toBeCloseTo(3300, 2);
    expect(yoy.previousGross).toBeCloseTo(3000, 2);
    expect(yoy.changePct.gross).toBeCloseTo(10, 2);
    expect(yoy.forecastVsLastYearPct).toBeCloseTo((12 * 1100) / 3000 * 100, 2);
  });

  it("returns unavailable when a side has no data", () => {
    expect(computeYoY([], []).available).toBe(false);
  });
});