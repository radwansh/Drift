import { describe, it, expect } from "vitest";
import {
  fiscalMonths,
  fiscalYearInterval,
  fiscalYearLabel,
  fiscalYearOf,
  normaliseFiscalStartMonth,
  withinFiscalYear,
} from "./fiscal";
import { generateExpectedPeriods } from "./periods";
import { computeSummary } from "./summary";
import { period, pos, neg } from "./test-utils";

describe("fiscal year rules (step 45)", () => {
  it("treats a start month of 1 as the calendar year", () => {
    const interval = fiscalYearInterval(2026, 1);
    expect(interval).toEqual({ start: "2026-01-01", end: "2026-12-31", endExclusive: "2027-01-01" });
    expect(fiscalYearOf("2026-06-30", 1)).toBe(2026);
  });

  it("runs an April start month from April to the following March", () => {
    const interval = fiscalYearInterval(2026, 4);
    expect(interval.start).toBe("2026-04-01");
    expect(interval.end).toBe("2027-03-31");
    expect(interval.endExclusive).toBe("2027-04-01");
  });

  it("assigns a period to the fiscal year its end date falls in", () => {
    // February 2026 belongs to fiscal 2025 (Apr 2025 - Mar 2026).
    expect(fiscalYearOf("2026-02-28", 4)).toBe(2025);
    expect(fiscalYearOf("2026-03-31", 4)).toBe(2025);
    expect(fiscalYearOf("2026-04-30", 4)).toBe(2026);
    expect(withinFiscalYear("2026-03-31", 2025, 4)).toBe(true);
    expect(withinFiscalYear("2026-03-31", 2026, 4)).toBe(false);
  });

  it("orders the twelve months from the start month", () => {
    const months = fiscalMonths(2026, 4);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 4 });
    expect(months[8]).toEqual({ year: 2026, month: 12 });
    expect(months[9]).toEqual({ year: 2027, month: 1 });
    expect(months[11]).toEqual({ year: 2027, month: 3 });
  });

  it("falls back to the calendar year for an invalid start month", () => {
    expect(normaliseFiscalStartMonth(0)).toBe(1);
    expect(normaliseFiscalStartMonth(13)).toBe(1);
    expect(normaliseFiscalStartMonth(null)).toBe(1);
    expect(normaliseFiscalStartMonth(undefined)).toBe(1);
  });

  it("labels a non-calendar year distinctly", () => {
    expect(fiscalYearLabel(2026, 1)).toBe("2026");
    expect(fiscalYearLabel(2026, 4)).toBe("FY2026/27");
  });
});

describe("the slot calendar follows the fiscal year", () => {
  it("generates Apr-Mar slots for an April start month", () => {
    const slots = generateExpectedPeriods("monthly", 2026, undefined, 4);
    expect(slots).toHaveLength(12);
    expect(slots[0]).toMatchObject({ label: "Apr 2026", end: "2026-04-30" });
    expect(slots[8]).toMatchObject({ label: "Dec 2026", end: "2026-12-31" });
    expect(slots[9]).toMatchObject({ label: "Jan 2027", end: "2027-01-31" });
    expect(slots[11]).toMatchObject({ label: "Mar 2027", end: "2027-03-31" });
  });

  it("still generates Jan-Dec by default", () => {
    const slots = generateExpectedPeriods("monthly", 2026);
    expect(slots[0]!.label).toBe("Jan 2026");
    expect(slots[11]!.label).toBe("Dec 2026");
  });

  it("generates a weekly grid bounded by the fiscal interval", () => {
    const slots = generateExpectedPeriods("weekly", 2026, "2026-04-01", 4);
    expect(slots.length).toBeGreaterThanOrEqual(52);
    expect(slots[0]!.start).toBe("2026-04-01");
    // Nothing may end after the fiscal year does.
    for (const s of slots) expect(s.end <= "2027-03-31").toBe(true);
  });
});

describe("computeSummary on an April-March fiscal year", () => {
  /**
   * The plan's acceptance is that an April-March fixture matches a manual pivot.
   * The pivot here: twelve periods of 1,000 gross running Apr 2026 to Mar 2027
   * total 12,000 gross and 9,600 net, with no missing periods and nothing left
   * to forecast.
   */
  function aprilToMarch() {
    const months: { year: number; month: number }[] = [
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({ year: 2026, month: m })),
      ...[1, 2, 3].map((m) => ({ year: 2027, month: m })),
    ];
    return months.map(({ year, month }) => {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const mm = String(month).padStart(2, "0");
      return period({
        periodType: "monthly",
        periodStart: `${year}-${mm}-01`,
        periodEnd: `${year}-${mm}-${lastDay}`,
        gross: 1_000,
        net: 800,
        components: [pos("Base Salary", 1_000), neg("Income Tax", 200)],
      });
    });
  }

  it("covers twelve periods with none missing", () => {
    const summary = computeSummary({
      year: 2026,
      periodType: "monthly",
      currency: "USD",
      allPeriodTypes: ["monthly"],
      allCurrencies: ["USD"],
      periods: aprilToMarch(),
      forecastMethod: "run_rate",
      fiscalStartMonth: 4,
    });

    expect(summary.coverage.expected).toBe(12);
    expect(summary.coverage.uploaded).toBe(12);
    expect(summary.missingLabels).toEqual([]);
    expect(summary.bridge.actual.gross).toBeCloseTo(12_000, 2);
    expect(summary.bridge.actual.net).toBeCloseTo(9_600, 2);
    // Nothing remains to forecast, so full year equals actuals.
    expect(summary.bridge.fullYear.gross).toBeCloseTo(12_000, 2);
    expect(summary.periods.map((p) => p.label)[0]).toBe("Apr 2026");
    expect(summary.periods.map((p) => p.label)[11]).toBe("Mar 2027");
  });

  it("reports the same data as eleven of twelve on a calendar year", () => {
    // The same uploads read as a calendar year: Apr-Dec 2026 is nine periods,
    // and the Jan-Mar 2027 ones fall outside 2026 entirely.
    const summary = computeSummary({
      year: 2026,
      periodType: "monthly",
      currency: "USD",
      allPeriodTypes: ["monthly"],
      allCurrencies: ["USD"],
      periods: aprilToMarch(),
      forecastMethod: "run_rate",
    });

    expect(summary.coverage.uploaded).toBe(9);
    expect(summary.bridge.actual.gross).toBeCloseTo(9_000, 2);
  });
});
