import { describe, it, expect } from "vitest";
import { buildForecast, priorYearAvailability } from "./forecast";
import { generateExpectedPeriods, futureExpectedPeriods, coveredSlotIndexes } from "./periods";
import { monthPeriod, period, pos, neg, monthStart } from "./test-utils";
import { endOfMonth } from "./dates";
import { classifyComponent } from "./classify";

const ALL = classifyComponent;
const monthPeriods = (months: number[]) => months.map((m) => monthPeriod(2026, m));

const EXPECTED_2026 = generateExpectedPeriods("monthly", 2026);

function monthlyRemaining(actual: { periodEnd: string }[]) {
  return futureExpectedPeriods(actual, EXPECTED_2026, "monthly");
}

function elapsedIndexes(actual: { periodEnd: string }[]) {
  return [...coveredSlotIndexes(actual, EXPECTED_2026, "monthly")].sort((a, b) => a - b);
}

/** Month periods with real month-end dates — the old fixture produced 2026-04-31. */
function realMonths(year: number, months: number[], gross: number, taxRate = 0.2) {
  return months.map((m) =>
    period({
      periodType: "monthly",
      periodStart: monthStart(year, m),
      periodEnd: endOfMonth(year, m),
      gross,
      net: gross * (1 - taxRate),
      components: [pos("Base Salary", gross), neg("Income Tax", gross * taxRate)],
    }),
  );
}

describe("buildForecast", () => {
  it("run_rate: recurring held at last period, statutory at YTD rate, variable at average", () => {
    const actual = monthPeriods([1, 2, 3, 4]);
    const remaining = monthlyRemaining(actual);
    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "run_rate",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    });

    expect(result.method).toBe("run_rate");
    expect(result.totals.base_salary).toBe(1100 * remaining.length);
    expect(result.totals.allowance).toBe(100 * remaining.length);
    expect(result.gross).toBe(1200 * remaining.length);
    expect(result.employeeDeductions).toBe(200 * remaining.length);
    expect(result.balance).toBe(0);
    expect(result.net).toBe(1000 * remaining.length);
  });

  it("average: uses the window of the last 3 actual periods", () => {
    const jan = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1100,
      net: 880,
      components: [pos("Base Salary", 1100), neg("Income Tax", 220)],
    });
    const feb = period({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gross: 900,
      net: 720,
      components: [pos("Base Salary", 900), neg("Income Tax", 180)],
    });
    const actual = [jan, feb];
    const remaining = monthlyRemaining(actual);
    const common = {
      year: 2026,
      periodType: "monthly" as const,
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    };

    const forecast = buildForecast({ ...common, method: "average" });
    const runRate = buildForecast({ ...common, method: "run_rate" });

    expect(forecast.method).toBe("average");
    expect(forecast.totals.base_salary).toBe(1000 * remaining.length);
    expect(forecast.totals.income_tax).toBe(200 * remaining.length);
    expect(runRate.totals.base_salary).toBe(900 * remaining.length);
  });

  // ---- step 11, finding C2 ----
  it("includes the earnings balance so uncategorised earnings still forecast gross", () => {
    // Gross 1000 a month, but the only earning column is unrecognised, so no
    // earning category is populated. v1 forecast a gross of 0 here.
    const actual = [1, 2, 3].map((m) =>
      period({
        periodType: "monthly",
        periodStart: monthStart(2026, m),
        periodEnd: endOfMonth(2026, m),
        gross: 1000,
        net: 800,
        components: [pos("Mystery Earnings Line", 1000), neg("Income Tax", 200)],
      }),
    );
    const remaining = monthlyRemaining(actual);

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "run_rate",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    });

    expect(remaining).toHaveLength(9);
    expect(result.earningsBalance).toBeCloseTo(1000 * 9, 2);
    expect(result.gross).toBeCloseTo(1000 * 9, 2);
    expect(result.net).toBeGreaterThan(0);
  });

  it("projects gross and net directly when no earnings component is mapped at all", () => {
    // A gross-and-net-only upload. v1 produced a negative forecast net.
    const actual = [1, 2].map((m) =>
      period({
        periodType: "monthly",
        periodStart: monthStart(2026, m),
        periodEnd: endOfMonth(2026, m),
        gross: 1000,
        net: 800,
        components: [],
      }),
    );
    const remaining = monthlyRemaining(actual);

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "run_rate",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    });

    expect(result.directGrossNet).toBe(true);
    expect(result.gross).toBeCloseTo(1000 * 10, 2);
    expect(result.net).toBeCloseTo(800 * 10, 2);
    expect(result.net).toBeGreaterThan(0);
  });

  // ---- step 12, finding C5 ----
  it("run_rate spreads the unreconciled balance over the actual periods, not the last one", () => {
    // Seven clean months then one with a 400 unreconciled correction.
    const clean = [1, 2, 3, 4, 5, 6, 7].map((m) =>
      period({
        periodType: "monthly",
        periodStart: monthStart(2026, m),
        periodEnd: endOfMonth(2026, m),
        gross: 1000,
        net: 800,
        components: [pos("Base Salary", 1000), neg("Income Tax", 200)],
      }),
    );
    const august = period({
      periodType: "monthly",
      periodStart: monthStart(2026, 8),
      periodEnd: endOfMonth(2026, 8),
      gross: 1000,
      net: 400,
      components: [pos("Base Salary", 1000), neg("Income Tax", 200)],
    });
    const actual = [...clean, august];
    const remaining = monthlyRemaining(actual);

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "run_rate",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    });

    // 400 spread over 8 actual periods = 50 a period, not 400.
    expect(result.perPeriod[0]!.balance).toBeCloseTo(50, 2);
  });

  // ---- step 13, findings C3 / C4 ----
  it("prior_year is available when last year covers 3 elapsed slots and 1 remaining slot", () => {
    const prevComplete = realMonths(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 1000);
    const actual = realMonths(2026, [1, 2, 3, 4, 5, 6], 2000);
    const elapsed = elapsedIndexes(actual);
    const remaining = monthlyRemaining(actual).map((s) => s.index);
    const prevSlots = new Set([...Array(12).keys()].map((i) => i + 1));

    // A complete prior year must ENABLE the method. v1 disabled it.
    expect(priorYearAvailability(prevSlots, elapsed, remaining).available).toBe(true);

    // Jan-Jun only last year: no overlap with Jul-Dec, so it must NOT be available.
    const janToJun = new Set([1, 2, 3, 4, 5, 6]);
    expect(priorYearAvailability(janToJun, elapsed, remaining).available).toBe(false);

    void prevComplete;
  });

  it("prior_year aligns by slot index and scales by the clamped growth", () => {
    // Last year: 1000 a month Jan-Nov, with a 2200 thirteenth-month in December.
    const prevRegular = realMonths(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1000);
    const prevDecember = period({
      periodType: "monthly",
      periodStart: monthStart(2025, 12),
      periodEnd: endOfMonth(2025, 12),
      gross: 2200,
      net: 1760,
      components: [pos("Base Salary", 2200), neg("Income Tax", 440)],
    });
    const prev = [...prevRegular, prevDecember];

    // This year: same 1000 a month for Jan-Jun, so growth is 1.0.
    const actual = realMonths(2026, [1, 2, 3, 4, 5, 6], 1000);
    const remaining = monthlyRemaining(actual);

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "prior_year",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      previousYear: { periods: prev, expectedCount: 12 },
      resolve: ALL,
    });

    expect(result.method).toBe("prior_year");
    expect(result.methodsAvailable).toContain("prior_year");

    // Jul-Nov at 1000 plus December's 2200 = 7200. The December payment is
    // carried because alignment is by slot, not by comparing 2025 and 2026 end
    // dates (which never matched, so v1 lost it).
    const december = result.perPeriod.find((p) => p.slot.label === "Dec 2026");
    expect(december).toBeDefined();
    expect(december!.gross).toBeCloseTo(2200, 2);
    expect(result.gross).toBeCloseTo(5 * 1000 + 2200, 2);
  });

  it("prior_year falls back to run_rate when the prior year does not overlap enough", () => {
    const actual = realMonths(2026, [1, 2, 3, 4], 1200, 1 / 6);
    const prev = realMonths(2025, [1, 2], 900, 1 / 6);
    const remaining = monthlyRemaining(actual);

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "prior_year",
      actual,
      remaining,
      elapsedSlotIndexes: elapsedIndexes(actual),
      previousYear: { periods: prev, expectedCount: 12 },
      resolve: ALL,
    });

    expect(result.method).toBe("run_rate");
    expect(result.methodsAvailable).not.toContain("prior_year");
    expect(result.assumptions.join(" ")).toContain("fell back");
  });

  // ---- step 14 ----
  it("estimates missing past slots separately from the future forecast", () => {
    const actual = realMonths(2026, [1, 2, 3, 5], 1000);
    const remaining = monthlyRemaining(actual);
    const missingPast = [EXPECTED_2026[3]!]; // April

    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "run_rate",
      actual,
      remaining,
      missingPast,
      elapsedSlotIndexes: elapsedIndexes(actual),
      resolve: ALL,
    });

    expect(result.perEstimated).toHaveLength(1);
    expect(result.perEstimated[0]!.slot.label).toBe("Apr 2026");
    expect(result.estimated.gross).toBeCloseTo(1000, 2);
    // The estimate is not double-counted into the forecast totals.
    expect(result.perPeriod.map((p) => p.slot.label)).not.toContain("Apr 2026");
  });
});
