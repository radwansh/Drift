import { describe, it, expect } from "vitest";
import { computeSummary } from "./summary";
import { applyScenario, costPerHeadLatest } from "./scenario";
import { monthStart, period, pos, neg } from "./test-utils";
import { endOfMonth } from "./dates";

/** Nine months of actuals, so Oct, Nov and Dec remain to forecast. */
function summaryThroughSeptember() {
  const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) =>
    period({
      periodType: "monthly",
      periodStart: monthStart(2026, m),
      periodEnd: endOfMonth(2026, m),
      gross: 10_000,
      net: 8_000,
      headcount: 10,
      components: [pos("Base Salary", 10_000), neg("Income Tax", 2_000)],
    }),
  );

  return computeSummary({
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    allPeriodTypes: ["monthly"],
    allCurrencies: ["USD"],
    periods,
    forecastMethod: "run_rate",
  });
}

describe("applyScenario (step 43)", () => {
  it("adds ten people from October at the latest cost per head, for three periods", () => {
    const summary = summaryThroughSeptember();
    const perHead = costPerHeadLatest(summary);

    // 10 people at 10,000 gross with no employer costs: 1,000 each.
    expect(perHead).toBeCloseTo(1_000, 2);

    // October is slot 10 of 12, so three periods are affected.
    const result = applyScenario(summary, {
      headcountChange: { fromSlotIndex: 10, people: 10 },
    });

    // The plan's acceptance: 10 people x the monthly cost per head x 3 months.
    expect(result.difference.totalEmploymentCost).toBeCloseTo(10 * perHead * 3, 2);
  });

  it("never rewrites an actual period", () => {
    const summary = summaryThroughSeptember();
    const result = applyScenario(summary, {
      headcountChange: { fromSlotIndex: 1, people: 50 },
      salaryIncreasePct: { fromSlotIndex: 1, percent: 25 },
    });

    for (const row of result.periods.filter((p) => p.kind === "actual")) {
      expect(row.scenarioGross).toBeCloseTo(row.baselineGross, 2);
    }
    // Only the three projected periods move.
    const changed = result.periods.filter((p) => p.scenarioGross !== p.baselineGross);
    expect(changed).toHaveLength(3);
  });

  it("applies a salary increase only from the chosen period onward", () => {
    const summary = summaryThroughSeptember();
    const result = applyScenario(summary, {
      salaryIncreasePct: { fromSlotIndex: 12, percent: 10 },
    });

    const december = result.periods[11]!;
    expect(december.scenarioGross).toBeCloseTo(december.baselineGross * 1.1, 2);

    const november = result.periods[10]!;
    expect(november.scenarioGross).toBeCloseTo(november.baselineGross, 2);
  });

  it("adds a one-off bonus in a single period only", () => {
    const summary = summaryThroughSeptember();
    const result = applyScenario(summary, {
      oneOffBonus: { slotIndex: 12, amountPerHead: 500 },
    });

    // 10 heads x 500.
    expect(result.difference.gross).toBeCloseTo(5_000, 2);
    const affected = result.periods.filter((p) => p.scenarioGross !== p.baselineGross);
    expect(affected).toHaveLength(1);
    expect(affected[0]!.label).toBe("Dec 2026");
  });

  it("reports no difference for an empty scenario", () => {
    const summary = summaryThroughSeptember();
    const result = applyScenario(summary, {});
    expect(result.difference.gross).toBeCloseTo(0, 2);
    expect(result.assumptions).toEqual([]);
  });
});
