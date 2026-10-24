import { describe, it, expect } from "vitest";
import { computeSummary } from "./summary";
import { computeYoY } from "./yoy";
import { monthPeriod, period, pos, neg, qty, monthStart } from "./test-utils";
import { endOfMonth } from "./dates";
import type { WarningCode } from "./warnings";

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

const codes = (s: ReturnType<typeof summaryFor>): WarningCode[] => s.warnings.map((w) => w.code);
const hasCode = (s: ReturnType<typeof summaryFor>, code: WarningCode) => codes(s).includes(code);

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
    expect(hasCode(s, "UNCATEGORISED")).toBe(true);

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
    const mixed = s.warnings.find((w) => w.code === "MIXED_SIGN");
    expect(mixed).toBeDefined();
    expect(mixed!.items).toContain("Loan Recovery");
  });
});

describe("computeSummary category byKey", () => {
  it("sums each component across periods instead of keeping only the last", () => {
    const months = [
      period({ periodStart: "2026-01-01", periodEnd: "2026-01-31", gross: 1000, net: 800, components: [pos("Base Salary", 1000), pos("Income Tax", 200)] }),
      period({ periodStart: "2026-02-01", periodEnd: "2026-02-28", gross: 1000, net: 800, components: [pos("Base Salary", 1000), pos("Income Tax", 200)] }),
      period({ periodStart: "2026-03-01", periodEnd: "2026-03-31", gross: 1000, net: 800, components: [pos("Base Salary", 1000), pos("Income Tax", 200)] }),
    ];

    const s = summaryFor({ periods: months });

    // byKey used `acc[k] = v` inside a reduce over every period, so it held
    // March alone: one month's figure under a year's label, on screen and in
    // the Excel Components sheet headed "Total to date".
    expect(s.categories.byKey["Base Salary"]!.total).toBe(3000);
    expect(s.categories.byKey["Income Tax"]!.total).toBe(600);

    // The invariant worth holding onto: a category's children must sum to the
    // category row. It was three times out.
    const childrenOf = (category: string) =>
      Object.values(s.categories.byKey)
        .filter((v) => v.category === category)
        .reduce((a, v) => a + v.total, 0);

    expect(childrenOf("base_salary")).toBe(s.categories.byCategory.base_salary);
    expect(childrenOf("income_tax")).toBe(s.categories.byCategory.income_tax);
  });
});

describe("computeSummary coverage and warnings", () => {
  it("flags a missing June and counts duplicates once", () => {
    const months = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    const periods = months.flatMap((m) => {
      const base = monthPeriod(2026, m);
      if (m === 3) {
        // simulate a duplicate upload of March
        return [base, { ...base, createdAt: `${base.periodEnd}T23:00:00Z`, gross: 9999 }];
      }
      return [base];
    });

    const s = summaryFor({ periods });
    expect(s.coverage.uploaded).toBe(11);
    expect(s.coverage.expected).toBe(12);
    expect(s.missingLabels).toEqual(["Jun 2026"]);
    expect(hasCode(s, "MISSING_PERIODS")).toBe(true);
    // Step 19: the superseded upload is reported rather than silently dropped.
    expect(hasCode(s, "DUPLICATES_IGNORED")).toBe(true);
  });

  it("emits MIXED_CADENCE and MIXED_CURRENCY warnings", () => {
    const jan = monthPeriod(2026, 1);
    const s = summaryFor({
      periods: [jan],
      allPeriodTypes: ["monthly", "weekly"],
      allCurrencies: ["USD", "EUR"],
    });
    expect(hasCode(s, "MIXED_CADENCE")).toBe(true);
    // Renamed from MULTI_CURRENCY to match the spec (step 19).
    expect(hasCode(s, "MIXED_CURRENCY")).toBe(true);
  });

  it("emits LOW_HISTORY under three periods", () => {
    const s = summaryFor({ periods: [monthPeriod(2026, 1), monthPeriod(2026, 2)] });
    expect(hasCode(s, "LOW_HISTORY")).toBe(true);

    const more = summaryFor({ periods: [1, 2, 3, 4].map((m) => monthPeriod(2026, m)) });
    expect(hasCode(more, "LOW_HISTORY")).toBe(false);
  });

  it("emits RECONCILIATION_GAP when deductions do not reconcile to net", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1500,
      net: 1400,
      components: [pos("Base Salary", 1500)],
    });
    const s = summaryFor({ periods: [jan] });
    expect(s.bridge.actual.balance).toBe(100);
    expect(hasCode(s, "RECONCILIATION_GAP")).toBe(true);
  });

  it("emits RECONCILIATION_GAP on the earnings line when earnings fall short of gross", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1500,
      net: 1250,
      // Only 1000 of the 1500 gross is a mapped earning.
      components: [pos("Base Salary", 1000), pos("Income Tax", 250)],
    });
    const s = summaryFor({ periods: [jan] });
    expect(s.bridge.actual.earningsBalance).toBe(500);
    expect(hasCode(s, "RECONCILIATION_GAP")).toBe(true);
  });

  it("does not emit RECONCILIATION_GAP when both balancing lines reconcile", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1500,
      net: 1250,
      components: [pos("Base Salary", 1500), pos("Income Tax", 250)],
    });
    const s = summaryFor({ periods: [jan] });
    expect(s.bridge.actual.balance).toBe(0);
    expect(s.bridge.actual.earningsBalance).toBe(0);
    expect(hasCode(s, "RECONCILIATION_GAP")).toBe(false);
  });

  it("returns zeros without NaN for an empty year", () => {
    const s = summaryFor();
    expect(hasCode(s, "NO_DATA")).toBe(true);
    expect(s.bridge.actual.gross).toBe(0);
    expect(s.bridge.actual.net).toBe(0);
    expect(s.coverage.uploaded).toBe(0);
    expect(Number.isNaN(s.bridge.actual.gross)).toBe(false);
    expect(Number.isNaN(s.avgHeadcountFullYear)).toBe(false);
    expect(Number.isNaN(s.yoy.changePct.gross ?? 0)).toBe(false);
    expect(s.quantities).toEqual({});
  });
});

// ---- step 10, findings C8 / P7 / P9 ----
describe("computeSummary slot model", () => {
  it("covers a 26th-to-25th cycle with no missing months and month labels", () => {
    const periods = [...Array(12).keys()].map((i) => {
      const m = i + 1;
      const startMonth = m === 1 ? 12 : m - 1;
      const startYear = m === 1 ? 2025 : 2026;
      return period({
        periodType: "monthly",
        periodStart: `${startYear}-${String(startMonth).padStart(2, "0")}-26`,
        periodEnd: `2026-${String(m).padStart(2, "0")}-25`,
        gross: 1000,
        net: 800,
        components: [pos("Base Salary", 1000), neg("Income Tax", 200)],
      });
    });

    const s = summaryFor({ periods });

    expect(s.missingLabels).toEqual([]);
    expect(s.coverage.uploaded).toBe(12);
    expect(s.periods.filter((p) => p.kind === "actual")).toHaveLength(12);
    // Labels are month names, not raw ISO end dates.
    expect(s.periods.map((p) => p.label)).toContain("Jan 2026");
    expect(s.periods.map((p) => p.label)).toContain("Dec 2026");
    expect(s.periods.some((p) => p.label.includes("-"))).toBe(false);
  });

  it("merges an off-cycle bonus run into its month instead of adding a period", () => {
    const regular = [1, 2, 3].map((m) =>
      period({
        periodType: "monthly",
        periodStart: monthStart(2026, m),
        periodEnd: endOfMonth(2026, m),
        gross: 1000,
        net: 800,
        components: [pos("Base Salary", 1000), neg("Income Tax", 200)],
      }),
    );
    // A mid-March bonus payroll, ending on the 15th.
    const bonusRun = period({
      periodType: "monthly",
      periodStart: "2026-03-10",
      periodEnd: "2026-03-15",
      gross: 500,
      net: 400,
      components: [pos("Bonus", 500), neg("Income Tax", 100)],
      headcount: 4,
    });

    const s = summaryFor({ periods: [...regular, bonusRun] });

    expect(s.coverage.uploaded).toBe(3);
    const marchRows = s.periods.filter((p) => p.label === "Mar 2026");
    expect(marchRows).toHaveLength(1);
    expect(marchRows[0]!.gross).toBe(1500);
  });
});

// ---- step 14, finding A7 ----
describe("computeSummary estimated past periods", () => {
  it("estimates a missing June so the full year spans twelve periods", () => {
    const months = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    const s = summaryFor({ periods: months.map((m) => monthPeriod(2026, m)) });

    expect(s.coverage.estimatedLabels).toEqual(["Jun 2026"]);
    const kinds = s.periods.map((p) => p.kind);
    expect(kinds.filter((k) => k === "actual")).toHaveLength(11);
    expect(kinds.filter((k) => k === "estimated")).toHaveLength(1);
    expect(s.periods).toHaveLength(12);
    // Full-year gross includes the estimate, so a 12-month budget compares fairly.
    expect(s.bridge.fullYear.gross).toBeCloseTo(1200 * 12, 2);
  });

  it("leaves the gap visible but unestimated when estimateMissing is off", () => {
    const months = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    const s = summaryFor({ periods: months.map((m) => monthPeriod(2026, m)), estimateMissing: false });

    expect(s.coverage.estimatedLabels).toEqual([]);
    expect(s.periods.find((p) => p.label === "Jun 2026")!.kind).toBe("missing");
    expect(s.bridge.fullYear.gross).toBeCloseTo(1200 * 11, 2);
  });
});

// ---- step 16, finding C7 ----
describe("computeSummary period series", () => {
  it("reports total employment cost as gross plus employer costs", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1200,
      net: 1000,
      components: [
        pos("Base Salary", 1200),
        neg("Income Tax", 200),
        pos("Employer Social Security", 150),
      ],
    });
    const s = summaryFor({ periods: [jan] });
    const row = s.periods.find((p) => p.kind === "actual")!;

    expect(row.employerCosts).toBe(150);
    // v1 published 150 here and labelled it "Employer cost".
    expect(row.totalEmploymentCost).toBe(1350);
  });
});

// ---- step 15, finding C6 ----
describe("computeSummary departments", () => {
  it("costs a department as gross plus employer costs, not gross plus deductions", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1200,
      net: 1000,
      components: [pos("Base Salary", 1200), neg("Income Tax", 200), pos("Employer Social Security", 150)],
    });

    const s = summaryFor({
      periods: [jan],
      departments: [
        {
          department: "Ops",
          gross: 1200,
          components: [
            { key: "Base Salary", total: 1200 },
            { key: "Income Tax", total: -200 },
            { key: "Employer Social Security", total: 150 },
          ],
          headcounts: [10],
        },
      ],
    });

    // 1200 + 150. v1 added the 200 of tax on top and reported 1550.
    expect(s.departments[0]!.actual).toBe(1350);
    expect(s.departments[0]!.costPerHead).toBe(135);
  });
});

// ---- step 17, finding C9 ----
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

  it("reports the first period's flows as null without a prior-year roster", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1000,
      net: 800,
      headcount: 3,
      employeeIds: ["1", "2", "3"],
    });
    const s = summaryFor({ periods: [jan] });
    expect(s.headcount.perPeriod[0]!.joiners).toBeNull();
    expect(s.headcount.perPeriod[0]!.leavers).toBeNull();
  });

  it("reports zero turnover when four people join and nobody leaves", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1000,
      net: 800,
      headcount: 10,
      employeeIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    });
    const feb = period({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gross: 1000,
      net: 800,
      headcount: 14,
      employeeIds: [...Array(14).keys()].map((i) => String(i + 1)),
    });

    const s = summaryFor({ periods: [jan, feb], previousYearLastEmployeeIds: jan.employeeIds });
    expect(s.headcount.joinerTotal).toBe(4);
    expect(s.headcount.leaverTotal).toBe(0);
    // v1 reported 16.7% here because it averaged joiners into turnover.
    expect(s.headcount.turnoverRate).toBe(0);
  });
});

// ---- step 18, finding C10 ----
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
    const yoy = computeYoY({ current, previous });

    expect(yoy.available).toBe(true);
    expect(yoy.comparablePeriods).toBe(3);
    expect(yoy.current.gross).toBeCloseTo(3300, 2);
    expect(yoy.previous.gross).toBeCloseTo(3000, 2);
    expect(yoy.changePct.gross).toBeCloseTo(10, 2);
  });

  it("returns null for forecast-vs-last-year when last year is incomplete", () => {
    const mk = (year: number, months: number[], base: number) =>
      months.map((m) =>
        period({
          periodType: "monthly",
          periodStart: monthStart(year, m),
          periodEnd: endOfMonth(year, m),
          gross: base,
          net: base * 0.8,
        }),
      );

    const partial = computeYoY({
      current: mk(2026, [1, 2, 3, 4], 1000),
      previous: mk(2025, [1, 2, 3], 1000),
      forecastFullYearGross: 12000,
    });
    expect(partial.previousYearComplete).toBe(false);
    expect(partial.forecastVsLastYearPct).toBeNull();
  });

  it("reports an unchanged payroll as 0%, not 200%", () => {
    const mk = (year: number, base: number) =>
      [...Array(12).keys()].map((i) =>
        period({
          periodType: "monthly",
          periodStart: monthStart(year, i + 1),
          periodEnd: endOfMonth(year, i + 1),
          gross: base,
          net: base * 0.8,
        }),
      );

    const yoy = computeYoY({
      current: mk(2026, 1000),
      previous: mk(2025, 1000),
      forecastFullYearGross: 12000,
    });

    expect(yoy.previousYearComplete).toBe(true);
    // v1 printed (12000 / 12000) * 100 = 200 here... a ratio, not a change.
    expect(yoy.forecastVsLastYearPct).toBeCloseTo(0, 6);
  });

  it("returns null rather than +100% when the previous base is zero", () => {
    const current = [
      period({ periodStart: monthStart(2026, 1), periodEnd: endOfMonth(2026, 1), gross: 1000, net: 800 }),
    ];
    const previous = [
      period({ periodStart: monthStart(2025, 1), periodEnd: endOfMonth(2025, 1), gross: 0, net: 0 }),
    ];
    const yoy = computeYoY({ current, previous });
    expect(yoy.changePct.gross).toBeNull();
  });

  it("returns unavailable when a side has no data", () => {
    expect(computeYoY({ current: [], previous: [] }).available).toBe(false);
  });
});
