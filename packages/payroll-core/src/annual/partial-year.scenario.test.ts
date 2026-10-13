import { describe, it, expect, vi, afterEach } from "vitest";
import { computeSummary } from "./summary";
import type { AnnualPeriodInput } from "./types";

/**
 * Scenario checks for a partially-uploaded year, mirroring the reported case:
 * seven monthly periods of 2026 uploaded, viewed in October 2026.
 *
 * The requirement being pinned here is that a part-filled year is a first-class
 * view — selectable, forecast to a full twelve months, and labelled as a
 * forecast rather than presented as fact.
 */

function month(year: number, m: number, gross: number, headcount = 10): AnnualPeriodInput {
  const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  return {
    id: `p-${year}-${String(m).padStart(2, "0")}`,
    periodType: "monthly",
    currency: "USD",
    periodStart: `${year}-${String(m).padStart(2, "0")}-01`,
    periodEnd: end,
    createdAt: `${year}-${String(m).padStart(2, "0")}-28T00:00:00.000Z`,
    headcount,
    gross,
    net: gross * 0.78,
    components: [
      { key: "Basic Salary", total: gross * 0.8, posRows: headcount, negRows: 0 },
      { key: "Income Tax", total: -(gross * 0.12), posRows: 0, negRows: headcount },
      { key: "Employer Social Security", total: gross * 0.09, posRows: headcount, negRows: 0 },
    ],
    employeeIds: Array.from({ length: headcount }, (_, i) => `e${i + 1}`),
  };
}

const base = {
  year: 2026,
  periodType: "monthly" as const,
  currency: "USD",
  allPeriodTypes: ["monthly" as const],
  allCurrencies: ["USD"],
  forecastMethod: undefined,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("partial year: 7 of 12 months uploaded, viewed in October", () => {
  // The engine reads the clock to decide which slots are past and which are
  // future, so the scenario has to pin it.
  function atOctober() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
  }

  const sevenMonths = [1, 2, 3, 4, 5, 6, 7].map((m) => month(2026, m, 100_000));

  it("still produces a full-year figure from a part-filled year", () => {
    atOctober();
    const s = computeSummary({ ...base, periods: sevenMonths });

    expect(s.coverage.expected).toBe(12);
    expect(s.coverage.uploaded).toBe(7);
    // 7 actuals at 100k, plus 5 projected slots -> a whole year.
    expect(s.bridge.actual.gross).toBeCloseTo(700_000, 2);
    expect(s.bridge.fullYear.gross).toBeCloseTo(1_200_000, 2);
    expect(s.bridge.forecast.gross).toBeCloseTo(500_000, 2);
  });

  it("accounts for all twelve slots, with none silently dropped", () => {
    atOctober();
    const s = computeSummary({ ...base, periods: sevenMonths });

    expect(s.periods).toHaveLength(12);
    const kinds = s.periods.map((p) => p.kind);
    expect(kinds.slice(0, 7).every((k) => k === "actual")).toBe(true);
    // Aug/Sep/Oct are past-with-no-upload; Nov/Dec are the future. Both are
    // projected, neither may vanish.
    expect(kinds.slice(7).every((k) => k === "estimated" || k === "forecast")).toBe(true);
    expect(kinds).not.toContain("missing");
  });

  it("says in writing that the figures are projected", () => {
    atOctober();
    const s = computeSummary({ ...base, periods: sevenMonths });

    expect(s.assumptions.length).toBeGreaterThan(0);
    const prose = [...s.assumptions, ...s.warnings.map((w) => `${w.title} ${w.detail}`)]
      .join(" ")
      .toLowerCase();
    expect(prose).toMatch(/forecast|estimat|project/);
  });

  it("labels the projected months by name, not raw ISO dates", () => {
    atOctober();
    const s = computeSummary({ ...base, periods: sevenMonths });
    const projected = s.periods.filter((p) => p.kind !== "actual");
    for (const p of projected) {
      expect(p.label).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("keeps the bridge internally consistent on a partial year", () => {
    atOctober();
    const s = computeSummary({ ...base, periods: sevenMonths });
    for (const line of [s.bridge.actual, s.bridge.forecast, s.bridge.fullYear]) {
      expect(line.totalEmploymentCost).toBeCloseTo(line.gross + line.employerCosts, 2);
    }
  });
});

describe("partial year: the sparse and single-period edges", () => {
  it("forecasts a whole year from a single uploaded month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
    const s = computeSummary({ ...base, periods: [month(2026, 1, 100_000)] });

    expect(s.coverage.uploaded).toBe(1);
    expect(s.periods).toHaveLength(12);
    expect(s.bridge.fullYear.gross).toBeCloseTo(1_200_000, 2);
  });

  it("handles a gap in the middle rather than treating it as the end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
    // March and April missing.
    const gappy = [1, 2, 5, 6, 7].map((m) => month(2026, m, 100_000));
    const s = computeSummary({ ...base, periods: gappy });

    expect(s.coverage.uploaded).toBe(5);
    expect(s.periods).toHaveLength(12);
    expect(s.bridge.fullYear.gross).toBeCloseTo(1_200_000, 2);
  });

  it("does not crash or produce NaN for a year with no uploads at all", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
    const s = computeSummary({ ...base, periods: [] });

    expect(s.coverage.uploaded).toBe(0);
    expect(Number.isNaN(s.bridge.fullYear.gross)).toBe(false);
    expect(s.bridge.fullYear.gross).toBe(0);
  });

  it("treats a fully uploaded year as having nothing left to forecast", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-01T12:00:00.000Z"));
    const full = Array.from({ length: 12 }, (_, i) => month(2026, i + 1, 100_000));
    const s = computeSummary({ ...base, periods: full });

    expect(s.coverage.uploaded).toBe(12);
    expect(s.bridge.forecast.gross).toBeCloseTo(0, 2);
    expect(s.bridge.fullYear.gross).toBeCloseTo(1_200_000, 2);
    expect(s.periods.every((p) => p.kind === "actual")).toBe(true);
  });
});
