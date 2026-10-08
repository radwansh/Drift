import { describe, it, expect } from "vitest";
import { computeSummary } from "./summary";
import { generateExpectedPeriods } from "./periods";
import { period, pos, neg } from "./test-utils";

describe("performance", () => {
  it("computes a 26-period / 2000-employee year in well under a second", () => {
    const slots = generateExpectedPeriods("bi_weekly", 2026, "2026-01-01");
    expect(slots.length).toBe(26);

    const employeesPerPeriod = 2000;
    const periods = slots.map((slot) =>
      period({
        periodType: "bi_weekly",
        periodStart: slot.start,
        periodEnd: slot.end,
        gross: 2000 * employeesPerPeriod,
        net: 1700 * employeesPerPeriod,
        headcount: employeesPerPeriod,
        employeeIds: Array.from({ length: employeesPerPeriod }, (_, e) => `${slot.end}-e${e}`),
        components: [pos("Base Salary", 1900 * employeesPerPeriod), pos("Overtime", 100 * employeesPerPeriod), neg("Income Tax", 300 * employeesPerPeriod)],
        createdAt: `${slot.end}T10:00:00Z`,
      }),
    );

    const start = Date.now();
    const s = computeSummary({
      year: 2026,
      periodType: "bi_weekly",
      currency: "USD",
      allPeriodTypes: ["bi_weekly"],
      allCurrencies: ["USD"],
      periods,
      forecastMethod: "run_rate",
    });
    const elapsed = Date.now() - start;

    expect(s.coverage.uploaded).toBe(26);
    expect(s.headcount.avgHeadcount).toBe(employeesPerPeriod);
    expect(Number.isFinite(s.bridge.fullYear.gross)).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});