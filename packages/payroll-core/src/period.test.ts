import { describe, it, expect } from "vitest";
import { getPeriodBoundaries } from "./period";

describe("getPeriodBoundaries - monthly", () => {
  it("returns 1st to last day of January", () => {
    const p = getPeriodBoundaries("monthly", 2025, 1);
    expect(p.start.getDate()).toBe(1);
    expect(p.start.getMonth()).toBe(0);
    expect(p.end.getDate()).toBe(31);
    expect(p.end.getMonth()).toBe(0);
    expect(p.label).toContain("2025-01-01");
    expect(p.label).toContain("2025-01-31");
  });

  it("handles February in non-leap year", () => {
    const p = getPeriodBoundaries("monthly", 2025, 2);
    expect(p.end.getDate()).toBe(28);
  });

  it("handles February in leap year", () => {
    const p = getPeriodBoundaries("monthly", 2024, 2);
    expect(p.end.getDate()).toBe(29);
  });

  it("handles 31-day months", () => {
    const p = getPeriodBoundaries("monthly", 2025, 3);
    expect(p.end.getDate()).toBe(31);
  });

  it("handles 30-day months", () => {
    const p = getPeriodBoundaries("monthly", 2025, 4);
    expect(p.end.getDate()).toBe(30);
  });

  it("handles December year boundary", () => {
    const p = getPeriodBoundaries("monthly", 2025, 12);
    expect(p.start.getFullYear()).toBe(2025);
    expect(p.start.getMonth()).toBe(11);
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getFullYear()).toBe(2025);
    expect(p.end.getMonth()).toBe(11);
    expect(p.end.getDate()).toBe(31);
  });
});

describe("getPeriodBoundaries - weekly", () => {
  it("returns Monday to Sunday for a given ISO week", () => {
    const p = getPeriodBoundaries("weekly", 2025, 1, 1);
    expect(p.start.getDay()).toBe(1);
    expect(p.end.getDay()).toBe(0);
  });

  it("handles a week in the middle of the year", () => {
    const p = getPeriodBoundaries("weekly", 2025, 6, 25);
    expect(p.start.getDay()).toBe(1);
    expect(p.end.getDay()).toBe(0);
  });

  it("throws when weekNumber is missing", () => {
    expect(() => getPeriodBoundaries("weekly", 2025, 1)).toThrow("weekNumber is required");
  });
});

describe("getPeriodBoundaries - bi_monthly", () => {
  it("returns 1st-15th for first half", () => {
    const p = getPeriodBoundaries("bi_monthly", 2025, 1, 1);
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getDate()).toBe(15);
  });

  it("returns 16th-last day for second half", () => {
    const p = getPeriodBoundaries("bi_monthly", 2025, 1, 2);
    expect(p.start.getDate()).toBe(16);
    expect(p.end.getDate()).toBe(31);
  });

  it("defaults to first half when weekNumber is 1", () => {
    const p = getPeriodBoundaries("bi_monthly", 2025, 3, 1);
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getDate()).toBe(15);
  });

  it("handles February second half in non-leap year", () => {
    const p = getPeriodBoundaries("bi_monthly", 2025, 2, 2);
    expect(p.start.getDate()).toBe(16);
    expect(p.end.getDate()).toBe(28);
  });

  it("handles February second half in leap year", () => {
    const p = getPeriodBoundaries("bi_monthly", 2024, 2, 2);
    expect(p.start.getDate()).toBe(16);
    expect(p.end.getDate()).toBe(29);
  });
});

describe("getPeriodBoundaries - bi_weekly", () => {
  it("returns a 14-day period for bi-week 1", () => {
    const p = getPeriodBoundaries("bi_weekly", 2025, 1, 1);
    expect(p.start.getDay()).toBe(1);
    const diffMs = p.end.getTime() - p.start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(13);
    expect(diffDays).toBeLessThan(14);
  });

  it("handles bi-week number 2", () => {
    const p1 = getPeriodBoundaries("bi_weekly", 2025, 1, 1);
    const p2 = getPeriodBoundaries("bi_weekly", 2025, 1, 2);
    expect(p2.start.getTime()).toBeGreaterThan(p1.end.getTime());
  });

  it("throws when weekNumber is missing", () => {
    expect(() => getPeriodBoundaries("bi_weekly", 2025, 1)).toThrow("weekNumber is required");
  });
});
