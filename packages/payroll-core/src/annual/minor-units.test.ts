import { describe, it, expect } from "vitest";
import { computeSummary, type AnnualSummaryOptions } from "./summary";
import { applyScenario, costPerHeadLatest } from "./scenario";
import { period, pos, neg, qty } from "./test-utils";
import { roundToMinorUnits } from "../money";
import { roundMoney } from "./math";
import type { AnnualPeriodInput, ComponentAggregate } from "./types";

/**
 * Step 8a-ii of docs/PAYROLL_AUDIT_FIX_PLAN.md: the currency's minor units,
 * threaded through the annual engine.
 *
 * Step 8a built the machinery and threaded the comparison side. This is the
 * annual half — 82 rounding sites across forecast.ts, summary.ts, yoy.ts and
 * scenario.ts — and the defect it closes is a silent one: the engine rounded
 * both sides of the bridge to two decimals, so a three-decimal payroll lost its
 * fils with `balance` still reading zero. Nothing looked wrong; the money was
 * simply not there.
 */

const MONTH_END = ["31", "28", "31"];

function quarter(
  currency: string,
  gross: number,
  net: number,
  components: () => ComponentAggregate[],
  year = 2026,
): AnnualPeriodInput[] {
  return [1, 2, 3].map((m) =>
    period({
      periodStart: `${year}-0${m}-01`,
      periodEnd: `${year}-0${m}-${MONTH_END[m - 1]}`,
      gross,
      net,
      currency,
      components: components(),
      headcount: 4,
    }),
  );
}

function summaryFor(
  currency: string,
  periods: AnnualPeriodInput[],
  overrides: Partial<AnnualSummaryOptions> = {},
) {
  return computeSummary({
    year: 2026,
    periodType: "monthly",
    currency,
    allPeriodTypes: ["monthly"],
    allCurrencies: [currency],
    periods,
    forecastMethod: undefined,
    ...overrides,
  });
}

// --- the plan's case: KWD 3,703.701 a month over three months ---
const KWD_MONTHLY_GROSS = 3703.701;
const KWD_MONTHLY_TAX = 370.37;
const KWD_MONTHLY_NET = 3333.331;
const kwdQuarter = (year = 2026) =>
  quarter(
    "KWD",
    KWD_MONTHLY_GROSS,
    KWD_MONTHLY_NET,
    () => [pos("Base Salary", KWD_MONTHLY_GROSS), neg("Income Tax", KWD_MONTHLY_TAX)],
    year,
  );

describe("per-currency minor units in the annual engine (step 8a-ii)", () => {
  it("reports a three-decimal payroll to the fils instead of rounding them away", () => {
    const s = summaryFor("KWD", kwdQuarter());

    // 3,703.701 x 3 = 11,111.103. The engine reported 11,111.10.
    expect(KWD_MONTHLY_GROSS * 3).toBe(11111.103);
    expect(s.bridge.actual.gross).toBe(11111.103);
    expect(s.bridge.actual.net).toBe(9999.993);
    expect(s.bridge.actual.employeeDeductions).toBe(1111.11);

    // The bridge balances *and* the figures are whole, which is the pairing
    // that was missing: it balanced before too, at 11,111.10, because both
    // sides were rounded the same way.
    //
    // Magnitude rather than value, because the residue is a negative zero —
    // pinned and explained in the next case.
    expect(Math.abs(s.bridge.actual.balance)).toBe(0);
    expect(s.bridge.actual.earningsBalance).toBe(0);
    // Balances at the fils. Not `toBe`: 11,111.103 - 1,111.11 computes as
    // 9,999.992999999999, a representation artefact a thousand times smaller
    // than the smallest unit KWD can express.
    expect(
      s.bridge.actual.gross - s.bridge.actual.employeeDeductions - s.bridge.actual.balance,
    ).toBeCloseTo(s.bridge.actual.net, 3);
  });

  it("never reports `balance` as a negative zero", () => {
    // This was pinned the other way by step 8a-ii, which found it and was
    // scoped out of fixing it: the bridge residue is -1.8e-13 at three decimals
    // where it happened to be positive at two, `Math.round` carries the sign,
    // and `Intl.NumberFormat` renders -0 as "-KWD 0.000". A minus sign on the
    // reconciliation line a payroll manager reads to decide the bridge is
    // clean.
    //
    // `roundToMinorUnits` now normalises it. Nothing else can move, because
    // `-0 === 0` is already true, so no arithmetic or comparison in the engine
    // distinguishes them — only `Object.is` and the formatter do.
    const s = summaryFor("KWD", kwdQuarter());
    expect(Object.is(s.bridge.actual.balance, -0)).toBe(false);
    expect(s.bridge.actual.balance).toBe(0);

    // And it renders without the sign, which is the point.
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "KWD",
      currencyDisplay: "code",
    }).format(s.bridge.actual.balance);
    expect(formatted).not.toMatch(/^-/);

    // The two-decimal path on the same data never produced it either.
    expect(Object.is(summaryFor("USD", kwdQuarter()).bridge.actual.balance, -0)).toBe(false);
  });

  it("is the defect the plan names: two decimals on the same data drop three fils", () => {
    // The same figures read as a two-decimal currency — which is what the annual
    // engine did for every company, whatever its currency.
    const twoDecimals = summaryFor("USD", kwdQuarter());

    expect(twoDecimals.bridge.actual.gross).toBe(11111.1);
    expect(11111.103 - twoDecimals.bridge.actual.gross).toBeCloseTo(0.003, 6);

    // And `balance` still read zero, so the loss was invisible rather than
    // wrong-looking.
    expect(twoDecimals.bridge.actual.balance).toBe(0);
    // RECONCILIATION_GAP fires on a percentage of gross (2%), so three fils on
    // an 11,111 payroll is six orders of magnitude below it and stays silent.
    // The absolute floor that would catch it is step 4 — so the silence of this
    // list is NOT what proves the rounding above is exact; the figures are.
    expect(twoDecimals.warnings.map((w) => w.code)).not.toContain("RECONCILIATION_GAP");
  });

  it("balances the bridge at three decimals when the components do not divide into two", () => {
    // Every component carries a non-zero third decimal, and no two of them sum
    // to a round cent.
    const components = (): ComponentAggregate[] => [
      pos("Base Salary", 1234.567),
      pos("Housing Allowance", 89.013),
      pos("Overtime", 7.119),
      neg("Social Security EE", 72.001),
      neg("Income Tax", 0.333),
      pos("Social Security ER", 148.777),
    ];
    // earnings 1,234.567 + 89.013 + 7.119 = 1,330.699 = gross
    // deductions 72.001 + 0.333 = 72.334; net = 1,330.699 - 72.334 = 1,258.365
    const s = summaryFor("BHD", quarter("BHD", 1330.699, 1258.365, components));
    const a = s.bridge.actual;

    expect(a.gross).toBe(3992.097);
    expect(a.net).toBe(3775.095);
    expect(a.employeeDeductions).toBe(217.002);
    expect(a.employerCosts).toBe(446.331);
    expect(a.totalEmploymentCost).toBe(4438.428);
    expect(a.earningsBalance).toBe(0);
    expect(a.balance).toBe(0);
    expect(a.gross - a.employeeDeductions - a.balance).toBeCloseTo(a.net, 3);
  });

  it("ties a three-decimal forecast back to the full year", () => {
    // Forecast figures are derived: each remaining slot is rounded, then summed.
    // Rounding the slots to a coarser quantum than the actuals would lose money
    // twice — in each slot, and again in the total it is meant to tie to.
    const s = summaryFor("KWD", kwdQuarter());

    expect(s.bridge.forecast.gross).toBe(33333.309);
    expect(s.bridge.fullYear.gross).toBe(44444.412);
    expect(s.bridge.actual.gross + s.bridge.forecast.gross).toBeCloseTo(s.bridge.fullYear.gross, 3);
    expect(s.bridge.actual.net + s.bridge.forecast.net).toBeCloseTo(s.bridge.fullYear.net, 3);

    // Nine forecast slots of 3,703.701 each, to the fils.
    const forecast = s.periods.filter((p) => p.kind === "forecast");
    expect(forecast).toHaveLength(9);
    for (const f of forecast) expect(f.gross).toBe(3703.701);
    expect(s.forecastPerPeriod[0]!.gross).toBe(3703.701);

    const fy = s.bridge.fullYear;
    expect(fy.gross - fy.employeeDeductions - fy.balance).toBeCloseTo(fy.net, 3);
  });

  it("rounds a zero-decimal currency to whole yen, and still balances the bridge", () => {
    const components = (): ComponentAggregate[] => [
      pos("Base Salary", 420000.4),
      pos("Commuting Allowance", 30000.3),
      neg("Income Tax", 45000.2),
      neg("Social Insurance EE", 20000.1),
    ];
    const s = summaryFor("JPY", quarter("JPY", 450000.7, 385000.4, components));

    for (const bridge of [s.bridge.actual, s.bridge.forecast, s.bridge.fullYear]) {
      for (const [line, value] of Object.entries(bridge)) {
        expect(Number.isInteger(value), `${line} = ${value} is not whole yen`).toBe(true);
      }
      expect(bridge.gross - bridge.employeeDeductions - bridge.balance).toBe(bridge.net);
    }

    expect(s.bridge.actual.gross).toBe(1350002);
    expect(s.bridge.actual.employeeDeductions).toBe(195001);
    expect(s.bridge.actual.net).toBe(1155001);
    // A sub-yen residue has nowhere to go in a currency with no minor unit, so
    // it rounds into the lines rather than surviving as a phantom balance.
    expect(s.bridge.actual.balance).toBe(0);
  });

  it("carries fils through year-on-year, the scenario layer and cost per head", () => {
    const s = summaryFor("KWD", kwdQuarter(), {
      previousYear: {
        periods: quarter(
          "KWD",
          3500.555,
          3150.5,
          () => [pos("Base Salary", 3500.555), neg("Income Tax", 350.055)],
          2025,
        ),
      },
    });

    expect(s.yoy.current.gross).toBe(11111.103);
    expect(s.yoy.previous.gross).toBe(10501.665);
    expect(s.yoy.current.net).toBe(9999.993);
    // 11,111.103 / 4 heads = 2,777.77575 -> 2,777.776
    expect(s.yoy.current.costPerHead).toBe(2777.776);
    expect(s.yoy.slotPairs[0]!.currentGross).toBe(3703.701);
    expect(s.yoy.slotPairs[0]!.previousGross).toBe(3500.555);

    // 3,703.701 / 4 heads = 925.92525 -> 925.925
    expect(costPerHeadLatest(s)).toBe(925.925);

    // The scenario layer takes its minor units from the summary it is compared
    // against, so a scenario cannot differ from its own baseline by rounding.
    const scenario = applyScenario(s, { salaryIncreasePct: { fromSlotIndex: 4, percent: 3 } });
    expect(scenario.baseline.gross).toBe(44444.412);
    expect(scenario.scenario.gross).toBe(45444.411);
    expect(scenario.difference.gross).toBe(999.999);
    const april = scenario.periods.find((p) => p.label === "Apr 2026");
    expect(april!.scenarioGross).toBe(3814.812);
  });

  it("keeps days and headcount at two decimals whatever the currency is", () => {
    // Three of the 82 sites deliberately keep `roundMoney`'s two-decimal
    // default, because they are not money. A JPY company's absence days must
    // not round to whole days, nor its average headcount to whole people.
    const s = summaryFor(
      "JPY",
      quarter("JPY", 450000, 385000, () => [
        pos("Base Salary", 450000),
        neg("Income Tax", 65000),
        qty("Absence Days", 0.75),
      ]),
      {
        departments: [
          {
            department: "Operations",
            components: [pos("Base Salary", 450000), qty("Absence Days", 0.75)],
            headcounts: [3, 4],
          },
        ],
      },
    );

    expect(s.quantities.absence_days).toBe(2.25);
    expect(s.departments[0]!.avgHeadcount).toBe(3.5);
    expect(s.departments[0]!.absencesDays).toBe(0.75);
    // The money beside them did go to whole yen.
    expect(s.bridge.actual.gross).toBe(1350000);
  });

  it("treats an unknown currency code exactly as two decimals", () => {
    // The guarantee that makes this change safe: an unrecognised code falls
    // back to 2, which is what the whole engine did before step 8a-ii.
    const periods = () =>
      quarter("USD", 1330.69, 1258.36, () => [
        pos("Base Salary", 1234.56),
        pos("Housing Allowance", 96.13),
        neg("Income Tax", 72.33),
      ]);
    const usd = summaryFor("USD", periods());
    const unknown = summaryFor("ZZZ", periods());

    const withoutCurrencyLabels = (s: typeof usd) => ({ ...s, currency: "", allCurrencies: [] });
    expect(withoutCurrencyLabels(unknown)).toEqual(withoutCurrencyLabels(usd));
  });
});

describe("the Number.EPSILON nudge at three decimals (step 8a-ii, trap 1)", () => {
  it("cannot move a figure at payroll magnitudes", () => {
    // The nudge is a fixed 2.22e-16, so against a fils it is ten times what it
    // is against a cent. That does not make it bite: at or above 4 the nudge is
    // below half an ULP, so `value + EPSILON === value` and the nudge is
    // arithmetically absent whatever `decimals` is.
    expect(4 + Number.EPSILON).toBe(4);
    expect(KWD_MONTHLY_GROSS + Number.EPSILON).toBe(KWD_MONTHLY_GROSS);

    // Swept over every exact half-fils from 4 to 60 — the hardest values for
    // it, since a midpoint is where a nudge could decide the direction. The
    // nudged and un-nudged results never differ.
    const divergent: number[] = [];
    for (let fils = 4000; fils < 60000; fils++) {
      const value = (fils + 0.5) / 1000;
      if (roundMoney(value, 3) !== roundToMinorUnits(value, 3)) divergent.push(value);
    }
    expect(divergent).toEqual([]);

    // And the plan's own figures are untouched by it.
    expect(roundMoney(11111.103, 3)).toBe(11111.103);
    expect(roundMoney(KWD_MONTHLY_GROSS * 3, 3)).toBe(11111.103);
  });

  it("still rounds 1.005 up at two decimals, which is why it is there", () => {
    // Below 4 the nudge does decide midpoints, and the USD suite depends on
    // that. It is kept, not removed.
    expect(roundMoney(1.005, 2)).toBe(1.01);
    expect(roundToMinorUnits(1.005, 2)).toBe(1);
    // The same behaviour one decimal deeper, which is the nudge doing its job
    // at a finer quantum rather than a new behaviour: 2.0075 is an exact
    // midpoint in fils and rounds away from zero.
    expect(roundMoney(2.0075, 3)).toBe(2.008);
    expect(roundToMinorUnits(2.0075, 3)).toBe(2.007);
  });
});
