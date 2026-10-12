import { describe, it, expect } from "vitest";
import { computeSummary, type AnnualSummaryOptions } from "./summary";
import { period, pos, neg, qty } from "./test-utils";

/**
 * The QA matrix's fixtures (step 47).
 *
 * The plan lists six: USD monthly with June missing, LBP monthly, a 53-week
 * weekly year, a 26th-to-25th cycle, an off-cycle bonus, and a gross-and-net-only
 * upload. Each is a shape that broke something in the review, so each gets a
 * test that the whole engine survives it and produces figures that reconcile.
 *
 * The other half of step 47 — rendering each fixture at 390/1280/1440/1920 in
 * light and dark and diffing Playwright snapshots — needs a browser and is not
 * covered here.
 */

function summaryFor(overrides: Partial<AnnualSummaryOptions>) {
  return computeSummary({
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    allPeriodTypes: ["monthly"],
    allCurrencies: ["USD"],
    periods: [],
    forecastMethod: "run_rate",
    ...overrides,
  });
}

function monthlyPeriod(opts: {
  year?: number;
  month: number;
  gross: number;
  net: number;
  currency?: string;
  withComponents?: boolean;
}) {
  const year = opts.year ?? 2026;
  const mm = String(opts.month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, opts.month, 0)).getUTCDate();
  return period({
    periodType: "monthly",
    currency: opts.currency ?? "USD",
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${lastDay}`,
    gross: opts.gross,
    net: opts.net,
    headcount: 10,
    employeeIds: ["E1", "E2"],
    components:
      opts.withComponents === false
        ? []
        : [
            pos("Base Salary", opts.gross * 0.8),
            pos("Housing Allowance", opts.gross * 0.2),
            neg("Income Tax", opts.gross - opts.net),
            pos("Employer Social Security", opts.gross * 0.1),
            qty("Absence Days", 1.37),
          ],
  });
}

/** Every fixture must satisfy these, whatever its shape. */
function expectInternallyConsistent(s: ReturnType<typeof summaryFor>) {
  // No NaN anywhere that matters.
  for (const line of [s.bridge.actual, s.bridge.forecast, s.bridge.fullYear]) {
    for (const [key, value] of Object.entries(line)) {
      expect(Number.isFinite(value), `${key} is finite`).toBe(true);
    }
  }
  // The bridge balances: net = gross - deductions - unreconciled.
  for (const line of [s.bridge.actual, s.bridge.fullYear]) {
    expect(line.gross - line.employeeDeductions - line.balance).toBeCloseTo(line.net, 2);
  }
  // Total employment cost is gross plus employer costs.
  for (const line of [s.bridge.actual, s.bridge.forecast, s.bridge.fullYear]) {
    expect(line.gross + line.employerCosts).toBeCloseTo(line.totalEmploymentCost, 2);
  }
  // Earnings plus the balance reconcile to gross.
  expect(
    (s.categories.byCategory.base_salary ?? 0) +
      (s.categories.byCategory.allowance ?? 0) +
      (s.categories.byCategory.bonus_commission ?? 0) +
      (s.categories.byCategory.overtime ?? 0) +
      (s.categories.byCategory.other_earning ?? 0) +
      s.bridge.actual.earningsBalance,
  ).toBeCloseTo(s.bridge.actual.gross, 2);
  // Full year is actuals plus estimates plus forecast, never less than actuals.
  expect(s.bridge.fullYear.gross).toBeGreaterThanOrEqual(s.bridge.actual.gross - 0.01);
  // Departments add up to total employment cost when departments are supplied.
  if (s.departments.length > 0) {
    const deptTotal = s.departments.reduce((a, d) => a + d.actual, 0);
    expect(deptTotal).toBeCloseTo(s.bridge.actual.totalEmploymentCost, 0);
  }
}

describe("QA fixture: USD monthly with June missing", () => {
  const s = summaryFor({
    periods: [1, 2, 3, 4, 5, 7, 8, 9].map((m) =>
      monthlyPeriod({ month: m, gross: 10_000, net: 8_000 }),
    ),
  });

  it("flags and estimates the gap, and still spans the year", () => {
    expect(s.missingLabels).toEqual(["Jun 2026"]);
    expect(s.coverage.estimatedLabels).toEqual(["Jun 2026"]);
    expect(s.periods).toHaveLength(12);
    expect(s.warnings.map((w) => w.code)).toContain("MISSING_PERIODS");
  });

  it("is internally consistent", () => expectInternallyConsistent(s));
});

describe("QA fixture: LBP monthly at scale", () => {
  const s = summaryFor({
    currency: "LBP",
    allCurrencies: ["LBP"],
    periods: [1, 2, 3].map((m) =>
      monthlyPeriod({ month: m, gross: 90_000_000_000, net: 72_000_000_000, currency: "LBP" }),
    ),
  });

  it("handles LBP-scale figures without losing precision in the bridge", () => {
    expect(s.currency).toBe("LBP");
    expect(s.bridge.actual.gross).toBeCloseTo(270_000_000_000, 0);
    expectInternallyConsistent(s);
  });
});

describe("QA fixture: 53-week weekly year", () => {
  // 2026 weeks anchored so the grid yields a full year of weekly slots.
  const weekly = [...Array(20).keys()].map((i) => {
    const start = new Date(Date.UTC(2026, 0, 1 + i * 7));
    const end = new Date(Date.UTC(2026, 0, 7 + i * 7));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return period({
      periodType: "weekly",
      periodStart: iso(start),
      periodEnd: iso(end),
      gross: 2_000,
      net: 1_600,
      headcount: 10,
      employeeIds: ["E1"],
      components: [pos("Base Salary", 2_000), neg("Income Tax", 400)],
    });
  });

  const s = summaryFor({
    periodType: "weekly",
    allPeriodTypes: ["weekly"],
    periods: weekly,
  });

  it("generates a weekly calendar and labels slots W1 onward", () => {
    expect(s.coverage.expected).toBeGreaterThanOrEqual(52);
    expect(s.coverage.uploaded).toBe(20);
    expect(s.periods[0]!.label).toMatch(/^W\d+$/);
    // No month names leaking into a weekly year.
    expect(s.periods.every((p) => /^W\d+$/.test(p.label))).toBe(true);
  });

  it("is internally consistent", () => expectInternallyConsistent(s));
});

describe("QA fixture: 26th-to-25th cycle", () => {
  const cycle = [...Array(12).keys()].map((i) => {
    const m = i + 1;
    const startMonth = m === 1 ? 12 : m - 1;
    const startYear = m === 1 ? 2025 : 2026;
    return period({
      periodType: "monthly",
      periodStart: `${startYear}-${String(startMonth).padStart(2, "0")}-26`,
      periodEnd: `2026-${String(m).padStart(2, "0")}-25`,
      gross: 5_000,
      net: 4_000,
      headcount: 10,
      employeeIds: ["E1"],
      components: [pos("Base Salary", 5_000), neg("Income Tax", 1_000)],
    });
  });

  const s = summaryFor({ periods: cycle });

  it("reports full coverage with month labels, not ISO dates", () => {
    // v1 flagged 7 months missing and labelled bars "2026-01-25".
    expect(s.missingLabels).toEqual([]);
    expect(s.coverage.uploaded).toBe(12);
    expect(s.periods.some((p) => p.label.includes("-"))).toBe(false);
  });

  it("is internally consistent", () => expectInternallyConsistent(s));
});

describe("QA fixture: off-cycle bonus run", () => {
  const regular = [1, 2, 3].map((m) => monthlyPeriod({ month: m, gross: 10_000, net: 8_000 }));
  const bonusRun = period({
    periodType: "monthly",
    periodStart: "2026-03-10",
    periodEnd: "2026-03-15",
    gross: 3_000,
    net: 2_400,
    headcount: 4,
    employeeIds: ["E1"],
    components: [pos("Bonus", 3_000), neg("Income Tax", 600)],
  });

  const s = summaryFor({ periods: [...regular, bonusRun] });

  it("merges the run into March rather than adding a thirteenth period", () => {
    expect(s.coverage.uploaded).toBe(3);
    const march = s.periods.filter((p) => p.label === "Mar 2026");
    expect(march).toHaveLength(1);
    expect(march[0]!.gross).toBeCloseTo(13_000, 2);
    // Headcount takes the larger of the two, not the bonus run's subset.
    expect(march[0]!.headcount).toBe(10);
  });

  it("is internally consistent", () => expectInternallyConsistent(s));
});

describe("QA fixture: gross-and-net-only upload", () => {
  const s = summaryFor({
    periods: [1, 2, 3].map((m) =>
      monthlyPeriod({ month: m, gross: 10_000, net: 8_000, withComponents: false }),
    ),
  });

  it("forecasts a positive net with no components mapped", () => {
    // v1 produced a negative forecast net for this shape.
    expect(s.bridge.forecast.net).toBeGreaterThan(0);
    expect(s.bridge.fullYear.net).toBeCloseTo(8_000 * 12, 2);
    expect(s.bridge.fullYear.gross).toBeCloseTo(10_000 * 12, 2);
  });

  it("is internally consistent", () => expectInternallyConsistent(s));
});

describe("QA fixture: a second company's data never leaks in", () => {
  it("computes only from the periods it is given", () => {
    // Tenant scoping is enforced in SQL (covered by the router tests); this
    // asserts the engine adds nothing of its own.
    const a = summaryFor({ periods: [monthlyPeriod({ month: 1, gross: 1_000, net: 800 })] });
    const b = summaryFor({ periods: [monthlyPeriod({ month: 1, gross: 9_999, net: 7_000 })] });
    expect(a.bridge.actual.gross).toBeCloseTo(1_000, 2);
    expect(b.bridge.actual.gross).toBeCloseTo(9_999, 2);
  });
});

describe("QA fixture: an empty year", () => {
  const s = summaryFor({ periods: [] });

  it("produces zeros without NaN and says there is no data", () => {
    expect(s.warnings.map((w) => w.code)).toContain("NO_DATA");
    expect(s.bridge.actual.gross).toBe(0);
    expect(s.bridge.fullYear.gross).toBe(0);
    expect(Number.isNaN(s.avgHeadcountFullYear)).toBe(false);
  });
});
