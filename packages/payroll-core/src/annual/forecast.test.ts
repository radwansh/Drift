import { describe, it, expect } from "vitest";
import { buildForecast, isPriorYearAvailable } from "./forecast";
import { generateExpectedPeriods, futureExpectedPeriods } from "./periods";
import { monthPeriod, period, pos, neg } from "./test-utils";
import { classifyComponent } from "./classify";

const ALL = classifyComponent;
const monthPeriods = (months: number[]) => months.map((m) => monthPeriod(2026, m));

function monthlyRemaining(actual: { periodEnd: string }[]) {
  const expected = generateExpectedPeriods("monthly", 2026);
  return futureExpectedPeriods(actual, expected);
}

describe("buildForecast", () => {
  it("run_rate: recurring held at last period, statutory at YTD rate, variable at average", () => {
    const actual = monthPeriods([1, 2, 3, 4]);

    const remaining = monthlyRemaining(actual);
    const result = buildForecast({ year: 2026, periodType: "monthly", method: "run_rate", actual, remaining, resolve: ALL });

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

    const forecast = buildForecast({ year: 2026, periodType: "monthly", method: "average", actual, remaining, resolve: ALL });
    const runRate = buildForecast({ year: 2026, periodType: "monthly", method: "run_rate", actual, remaining, resolve: ALL });

    expect(forecast.method).toBe("average");
    expect(forecast.totals.base_salary).toBe(1000 * remaining.length);
    expect(forecast.totals.income_tax).toBe(200 * remaining.length);
    expect(runRate.totals.base_salary).toBe(900 * remaining.length);
  });

  it("prior_year: scales previous-year slots by the clamped YoY ratio", () => {
    const year = 2026;
    const mk = (yr: number, months: number[], base: number) =>
      months.map((m) =>
        period({
          periodType: "monthly",
          periodStart: `${yr}-0${m}-01`,
          periodEnd: `${yr}-0${m}-${m === 2 ? 28 : 31}`,
          gross: base,
          net: base * 0.8,
          components: [pos("Base Salary", base), neg("Income Tax", base * 0.2)],
        }),
      );

    const prev = mk(2025, [1, 2, 3, 4, 5, 6], 1000);
    const actual = mk(2026, [1, 2, 3, 4, 5, 6], 2000);
    const remaining = monthlyRemaining(actual);

    const previousYear = { periods: prev, expectedCount: 12 };
    expect(isPriorYearAvailable(previousYear)).toBe(true);

    const result = buildForecast({
      year,
      periodType: "monthly",
      method: "prior_year",
      actual,
      remaining,
      previousYear,
      resolve: ALL,
    });

    expect(result.method).toBe("prior_year");
    expect(result.methodsAvailable).toContain("prior_year");
    expect(result.totals.base_salary).toBe(12000);
    expect(result.totals.income_tax).toBe(2400);
    expect(result.gross).toBe(12000);
    expect(result.net).toBe(9600);
  });

  it("prior_year: falls back to run_rate when prior data is insufficient", () => {
    const actual = [1, 2, 3, 4].map((m) =>
      period({
        periodStart: `2026-0${m}-01`,
        periodEnd: `2026-0${m}-${m === 2 ? 28 : 31}`,
        gross: 1200,
        net: 1000,
        components: [pos("Base Salary", 1100), neg("Income Tax", 200)],
      }),
    );
    const prev = [1, 2].map((m) =>
      period({
        periodType: "monthly",
        periodStart: `2025-0${m}-01`,
        periodEnd: `2025-0${m}-${m === 2 ? 28 : 31}`,
        gross: 900,
        net: 700,
        components: [pos("Base Salary", 850), neg("Income Tax", 150)],
      }),
    );
    const remaining = monthlyRemaining(actual);
    const previousYear = { periods: prev, expectedCount: 12 };

    expect(isPriorYearAvailable(previousYear)).toBe(false);
    const result = buildForecast({
      year: 2026,
      periodType: "monthly",
      method: "prior_year",
      actual,
      remaining,
      previousYear,
      resolve: ALL,
    });

    expect(result.method).toBe("run_rate");
    expect(result.methodsAvailable).not.toContain("prior_year");
    expect(result.assumptions.join(" ")).toContain("fell back");
  });
});