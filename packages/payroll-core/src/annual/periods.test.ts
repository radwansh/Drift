import { describe, it, expect } from "vitest";
import { period } from "./test-utils";
import {
  dedupePeriods,
  detectMissingPeriods,
  futureExpectedPeriods,
  generateExpectedPeriods,
} from "./periods";
import { periodYear } from "./dates";

describe("dedupePeriods", () => {
  it("keeps the newest upload per (type, start, end) and sorts by start", () => {
    const older = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1000,
      net: 800,
      createdAt: "2026-01-31T08:00:00Z",
    });
    const newer = period({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      gross: 1100,
      net: 900,
      createdAt: "2026-01-31T18:00:00Z",
    });
    const feb = period({
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      gross: 1200,
      net: 1000,
      createdAt: "2026-02-28T10:00:00Z",
    });

    const result = dedupePeriods([feb, older, newer]);
    expect(result).toHaveLength(2);
    expect(result[0]!.periodEnd).toBe("2026-01-31");
    expect(result[0]!.gross).toBe(1100);
    expect(result[1]!.periodEnd).toBe("2026-02-28");
  });
});

describe("generateExpectedPeriods", () => {
  it("generates 12 monthly slots whose ends are month-end dates", () => {
    const slots = generateExpectedPeriods("monthly", 2026);
    expect(slots).toHaveLength(12);
    expect(slots[0]!.label).toBe("Jan 2026");
    expect(slots[0]!.end).toBe("2026-01-31");
    expect(slots[11]!.end).toBe("2026-12-31");
  });

  it("generates 24 bi-monthly slots with B1/B2 halves", () => {
    const slots = generateExpectedPeriods("bi_monthly", 2026);
    expect(slots).toHaveLength(24);
    expect(slots[0]).toMatchObject({ label: "B1 Jan 2026", end: "2026-01-15" });
    expect(slots[1]).toMatchObject({ label: "B2 Jan 2026", end: "2026-01-31" });
  });

  it("labels bi-monthly February as a 28-day month in a common year and 29 days in a leap year", () => {
    const common = generateExpectedPeriods("bi_monthly", 2026);
    expect(common.find((s) => s.index === 3)?.end).toBe("2026-02-15");
    expect(common.find((s) => s.index === 4)?.end).toBe("2026-02-28");

    const leap = generateExpectedPeriods("bi_monthly", 2024);
    expect(leap.find((s) => s.end === "2024-02-29")).toBeDefined();
    expect(leap.find((s) => s.index === 4)?.end).toBe("2024-02-29");
    expect(leap).toHaveLength(24);
  });

  it("counts 53 weekly periods in a 53-week end-year (2023) from generation", () => {
    const slots = generateExpectedPeriods("weekly", 2023, "2023-01-02");
    expect(slots).toHaveLength(53);
    expect(slots[0]!.end).toBe("2023-01-01");
    expect(slots[52]!.end).toBe("2023-12-31");
  });

  it("counts 52 weekly periods in 2026 from generation", () => {
    const slots = generateExpectedPeriods("weekly", 2026, "2026-01-01");
    expect(slots).toHaveLength(52);
  });

  it("counts 27 bi-weekly periods in 2023", () => {
    const slots = generateExpectedPeriods("bi_weekly", 2023, "2023-01-02");
    expect(slots).toHaveLength(27);
  });

  it("counts 26 bi-weekly periods in 2026", () => {
    const slots = generateExpectedPeriods("bi_weekly", 2026, "2026-01-01");
    expect(slots).toHaveLength(26);
  });

  it("assigns a weekly period crossing 31 Dec to the year of its END date", () => {
    const slots = generateExpectedPeriods("weekly", 2026, "2025-12-29");
    const crossing = slots.find((s) => s.end === "2026-01-04");
    expect(crossing).toBeDefined();
    expect(crossing?.start).toBe("2025-12-29");

    expect(periodYear("2026-01-04")).toBe(2026);
    expect(periodYear("2025-12-31")).toBe(2025);
  });
});

describe("detectMissingPeriods / futureExpectedPeriods", () => {
  const expected = generateExpectedPeriods("monthly", 2026);

  it("flags an internal gap (no June) but not the future", () => {
    const actual = [...Array(12).keys()]
      .map((m) => m + 1)
      .filter((m) => m !== 6)
      .map((m) => period({ periodStart: `2026-${m < 10 ? `0${m}` : m}-01`, periodEnd: expected[m - 1]!.end, gross: 1000, net: 800 }));

    const missing = detectMissingPeriods(actual, expected);
    expect(missing.map((m) => m.label)).toEqual(["Jun 2026"]);

    const remaining = futureExpectedPeriods(actual, expected);
    expect(remaining).toEqual([]);
  });

  it("flags a leading gap when the first upload is in March", () => {
    const actual = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
      period({ periodStart: `2026-${m < 10 ? `0${m}` : m}-01`, periodEnd: expected[m - 1]!.end, gross: 1000, net: 800 }),
    );
    const missing = detectMissingPeriods(actual, expected);
    expect(missing.map((m) => m.label)).toEqual(["Jan 2026", "Feb 2026"]);
  });

  it("treats an empty year as no missing, no future", () => {
    expect(detectMissingPeriods([], expected)).toEqual([]);
    expect(futureExpectedPeriods([], expected)).toHaveLength(12);
  });
});