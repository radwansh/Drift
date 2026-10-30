import { describe, it, expect } from "vitest";
import { computeSummary } from "@saas/payroll-core";
import { buildWaterfall } from "@/components/annual/annual-bridge";
import { formatDays, formatMoney, formatCompact, periodNameFor } from "@/components/annual/annual-utils";

/**
 * Pure-logic checks for the UI work in phase 5. The parts that need a browser —
 * Playwright snapshots at 390/1280/1440/1920 in light and dark, and the axe
 * pass — are not covered here; these are the assertions that can be made
 * without one.
 */

function summaryWith(opts: {
  gross: number;
  net: number;
  components: { key: string; total: number }[];
  months?: number[];
}) {
  const months = opts.months ?? [1];
  return computeSummary({
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    allPeriodTypes: ["monthly"],
    allCurrencies: ["USD"],
    forecastMethod: "run_rate",
    periods: months.map((m) => {
      const lastDay = new Date(Date.UTC(2026, m, 0)).getUTCDate();
      return {
        id: `p${m}`,
        periodType: "monthly" as const,
        currency: "USD",
        periodStart: `2026-${String(m).padStart(2, "0")}-01`,
        periodEnd: `2026-${String(m).padStart(2, "0")}-${lastDay}`,
        createdAt: `2026-${String(m).padStart(2, "0")}-${lastDay}T12:00:00Z`,
        headcount: 10,
        gross: opts.gross,
        net: opts.net,
        components: opts.components.map((c) => ({
          key: c.key,
          total: c.total,
          negRows: c.total < 0 ? 1 : 0,
          posRows: c.total > 0 ? 1 : 0,
        })),
        employeeIds: ["E1"],
      };
    }),
  });
}

// ---- step 32, finding U1 ----
describe("gross-to-net waterfall (step 32)", () => {
  const summary = summaryWith({
    gross: 1000,
    net: 700,
    components: [
      { key: "Base Salary", total: 1000 },
      { key: "Income Tax", total: -200 },
      { key: "Employer Social Security", total: 100 },
    ],
  });
  const rows = buildWaterfall(summary);
  const byLabel = new Map(rows.map((r) => [r.label, r]));

  it("starts every total at zero", () => {
    // The whole of finding U1: v1 accumulated a running total across the totals
    // too, so Net was drawn from net up to twice net and Employer cost floated
    // above that, pushing the axis to nearly three times gross.
    for (const label of ["Gross", "Net", "Total employment cost"]) {
      const row = byLabel.get(label);
      expect(row, label).toBeDefined();
      expect(row!.kind).toBe("total");
      expect(row!.base).toBe(0);
    }
  });

  it("draws Net spanning zero to the net figure", () => {
    const net = byLabel.get("Net")!;
    expect(net.base).toBe(0);
    expect(net.span).toBeCloseTo(700, 2);
    expect(net.base + net.span).toBeCloseTo(summary.bridge.actual.net, 2);
  });

  it("steps deductions down from gross and lands on net", () => {
    const steps = rows.filter((r) => r.kind === "decrease");
    expect(steps.length).toBeGreaterThan(0);
    // The lowest point reached by the down-steps is the net figure.
    const lowest = Math.min(...steps.map((s) => s.base));
    expect(lowest).toBeCloseTo(summary.bridge.actual.net, 2);
  });

  it("steps employer costs up from gross to total employment cost", () => {
    const increases = rows.filter((r) => r.kind === "increase");
    expect(increases.length).toBeGreaterThan(0);
    const top = Math.max(...increases.map((s) => s.base + s.span));
    expect(top).toBeCloseTo(summary.bridge.actual.totalEmploymentCost, 2);
  });

  it("keeps the axis at total employment cost rather than a stacked sum", () => {
    const axisMax = Math.max(...rows.map((r) => r.base + r.span));
    // v1 reached gross + net + employer cost here.
    expect(axisMax).toBeCloseTo(summary.bridge.actual.totalEmploymentCost, 2);
    expect(axisMax).toBeLessThan(summary.bridge.actual.gross * 2);
  });
});

// ---- step 36, finding U3 ----
describe("formatters (steps 34, 36)", () => {
  it("rounds absence days to one decimal", () => {
    // The raw sum printed as "44.540000000000006 days".
    expect(formatDays(44.540000000000006)).toBe("44.5 days");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(null)).toBe("—");
  });

  it("uses the currency code and never a symbol, so cards cannot mix the two", () => {
    const full = formatMoney(3_089_200, "USD");
    expect(full).toContain("USD");
    expect(full).not.toContain("$");
    const compact = formatCompact(3_089_200, "USD");
    expect(compact).toContain("USD");
    expect(compact).not.toContain("$");
  });

  it("formats billions, which an LBP company needs", () => {
    // v1 had no billions step, so this rendered as a clipped "600000.0M".
    expect(formatCompact(600_000_000_000, "LBP")).toMatch(/600B/);
  });

  it("names periods instead of printing ISO dates", () => {
    expect(periodNameFor("2026-09-30")).toBe("Sep 2026");
    expect(periodNameFor(null)).toBe("—");
  });
});

// ---- step 37, finding U6 ----
describe("year elapsed (step 37)", () => {
  it("measures elapsed from the last slot, not the number of uploads", () => {
    // Jan-May plus Jul-Sep: 8 uploads, but the year has run to September.
    const summary = summaryWith({
      gross: 1000,
      net: 800,
      components: [{ key: "Base Salary", total: 1000 }],
      months: [1, 2, 3, 4, 5, 7, 8, 9],
    });

    const elapsedSlots = summary.periods.filter((p) => p.kind !== "forecast").length;
    const elapsed = elapsedSlots / summary.coverage.expected;

    // v1 divided 8 uploads by 12 and reported 67%.
    expect(summary.coverage.uploaded).toBe(8);
    expect(elapsedSlots).toBe(9);
    expect(elapsed).toBeCloseTo(0.75, 5);
  });
});

// ---- step 36, KPI 5 ----
describe("components table reconciliation (step 36)", () => {
  it("earnings plus the uncategorised balance add up to gross", () => {
    const summary = summaryWith({
      gross: 1000,
      net: 800,
      // Only 700 of the 1000 gross is a mapped earning.
      components: [
        { key: "Base Salary", total: 700 },
        { key: "Income Tax", total: -200 },
      ],
    });

    const earnings = summary.categories.byCategory.base_salary ?? 0;
    const balance = summary.bridge.actual.earningsBalance;

    expect(earnings).toBeCloseTo(700, 2);
    expect(balance).toBeCloseTo(300, 2);
    expect(earnings + balance).toBeCloseTo(summary.bridge.actual.gross, 2);
  });
});

/**
 * Step 12a: the held headcount reaches everything that reads the engine's
 * assumptions.
 *
 * It used to be prose built inside `annual-periods-chart.tsx` from the last
 * actual row — "Forecast holds headcount at 141, as in Mar 2025" — while
 * `buildForecast` said nothing about the roster it had assumed. So the Excel
 * export's Assumptions sheet, which maps `summary.assumptions`, did not carry
 * it, and neither did anything else reading them.
 */
describe("the held headcount is in the engine's assumptions (step 12a)", () => {
  function growingYear(heads: readonly number[]) {
    return computeSummary({
      year: 2026,
      periodType: "monthly",
      currency: "USD",
      allPeriodTypes: ["monthly"],
      allCurrencies: ["USD"],
      forecastMethod: "run_rate",
      periods: heads.map((headcount, i) => ({
        id: `p${i}`,
        periodType: "monthly" as const,
        currency: "USD",
        periodStart: `2026-${String(i + 1).padStart(2, "0")}-01`,
        periodEnd: new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10),
        createdAt: `2026-${String(i + 1).padStart(2, "0")}-05T00:00:00Z`,
        headcount,
        gross: 1000 * headcount,
        net: 800 * headcount,
        components: [{ key: "Base Salary", total: 1000 * headcount, negRows: 0, posRows: headcount }],
      })),
    });
  }

  it("states it, so the Excel Assumptions sheet carries it", () => {
    const summary = growingYear([100, 105, 110]);

    expect(summary.assumptions).toContain(
      "Headcount held at 110 for the remaining 9 periods: no joiners or leavers are assumed.",
    );
    // This is the list the workbook's Assumptions sheet is built from.
    const sheetRows = summary.assumptions.map((a) => [a]);
    expect(sheetRows.some((r) => r[0]!.includes("Headcount held at 110"))).toBe(true);
  });

  it("is a single sentence, not duplicated by the chart's own copy", () => {
    const summary = growingYear([100, 105, 110]);
    const caption = summary.assumptions.join(" ");

    expect(caption.match(/Headcount held/g)).toHaveLength(1);
    // The chart renders `assumptions` verbatim now, so what it shows is what
    // the engine said — no second sentence assembled from the rows.
    expect(caption).not.toContain("as in");
  });

  it("carries the figure the chart draws on every projected row", () => {
    const summary = growingYear([100, 105, 110]);
    const projected = summary.periods.filter((p) => p.kind === "forecast");

    expect(summary.heldHeadcount?.held).toBe(110);
    expect(new Set(projected.map((p) => p.headcount))).toEqual(new Set([110]));
  });
});
