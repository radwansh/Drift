import type { Money } from "./types";
import type { AnnualSummary } from "./summary";
import { roundMoney } from "./math";
import { minorUnits } from "../money";

/**
 * Scenario planning (step 43).
 *
 * Owners ask "what if we hire ten people in October" and need an answer against
 * the same forecast the dashboard shows. This takes a computed summary and
 * applies changes to the *remaining* periods only — the past is actuals and is
 * never rewritten.
 *
 * It deliberately works on the summary rather than re-running the engine: the
 * baseline a user is comparing against is the one on their screen, so a scenario
 * has to start from exactly that and show the difference.
 *
 * That is also where its minor units come from (step 8a-ii): `summary.currency`
 * is the currency the baseline is denominated in, so the scenario rounds to the
 * same quantum as the figures it is being compared against. Taking it from
 * anywhere else would let a scenario differ from its own baseline by rounding.
 */

export interface Scenario {
  /**
   * Headcount change applied from this slot onward (1-based slot index within
   * the year's calendar). Positive hires, negative reduces.
   */
  headcountChange?: { fromSlotIndex: number; people: number };
  /** Across-the-board salary increase, in percent, from this slot onward. */
  salaryIncreasePct?: { fromSlotIndex: number; percent: number };
  /** A one-off bonus paid in a single slot. */
  oneOffBonus?: { slotIndex: number; amountPerHead: number };
}

export interface ScenarioPeriod {
  label: string;
  kind: AnnualSummary["periods"][number]["kind"];
  /** Baseline gross for this period, as the dashboard shows it. */
  baselineGross: Money;
  scenarioGross: Money;
  baselineTotalEmploymentCost: Money;
  scenarioTotalEmploymentCost: Money;
}

export interface ScenarioResult {
  periods: ScenarioPeriod[];
  baseline: { gross: Money; net: Money; totalEmploymentCost: Money };
  scenario: { gross: Money; net: Money; totalEmploymentCost: Money };
  difference: { gross: Money; net: Money; totalEmploymentCost: Money };
  /** Plain-language description of what was applied, for the UI. */
  assumptions: string[];
}

/** Whether a period can still be changed: actuals cannot. */
function isProjected(kind: AnnualSummary["periods"][number]["kind"]): boolean {
  return kind === "forecast" || kind === "estimated" || kind === "missing";
}

/**
 * Step 12b: one projected slot's gross per head.
 *
 * `0` for a slot with no headcount or no projection — a `missing` slot is one
 * Clarivo projects nothing for, so a hire costs nothing *there*. It still costs
 * in every projected slot after it, because each slot is priced from its own
 * figures.
 */
function perHeadOf(period: AnnualSummary["periods"][number]): number {
  const heads = period.headcount ?? 0;
  return heads > 0 ? period.gross / heads : 0;
}

export function applyScenario(summary: AnnualSummary, scenario: Scenario): ScenarioResult {
  const decimals = minorUnits(summary.currency);
  const round = (value: number) => roundMoney(value, decimals);
  const assumptions: string[] = [];

  /**
   * Step 12b: a marginal head is priced off the **projection**, not the latest
   * actual period.
   *
   * It used to be `lastActual.gross / lastActual.headcount`. Step 6 stopped
   * projecting one-offs forward, but that per-head price still carried them, so
   * a cut whose latest period happened to contain the annual bonus priced every
   * hire as though bonuses recurred monthly. Measured on `samples/2025` at the
   * March cut: 14,965.13 a head against the recurring projection's 10,239.12 —
   * 46.2% over — and "hire 10 from April" reported 1,346,861.43 where the
   * recurring rate prices it at 921,520.80. That is 425,340.63 of overstatement
   * on a hiring decision. At the May cut, whose actual period carries no
   * one-off, the two agree to 1.1%.
   *
   * Per *slot*, not one rate for the year: under the average and prior-year
   * methods the projected slots differ, so a hire should cost what the slot it
   * lands in is projected to cost. Under the run rate they are all equal and
   * this is the same number for every slot.
   */
  const headcount = summary.heldHeadcount?.held ?? 0;

  // The employer-cost uplift on gross, so a scenario's extra gross carries its
  // on-costs rather than being treated as net of them.
  const employerUplift =
    summary.bridge.actual.gross > 0
      ? summary.bridge.actual.totalEmploymentCost / summary.bridge.actual.gross
      : 1;
  // Net as a share of gross, for translating a gross change into net.
  const netShare =
    summary.bridge.actual.gross > 0 ? summary.bridge.actual.net / summary.bridge.actual.gross : 0;

  if (scenario.headcountChange && scenario.headcountChange.people !== 0) {
    const { people, fromSlotIndex } = scenario.headcountChange;
    assumptions.push(
      `${people > 0 ? "Adding" : "Removing"} ${Math.abs(people)} ${
        Math.abs(people) === 1 ? "person" : "people"
      } from period ${fromSlotIndex}, costed at the projected cost per head — the recurring run rate, with one-offs excluded.`,
    );
  }
  if (scenario.salaryIncreasePct && scenario.salaryIncreasePct.percent !== 0) {
    assumptions.push(
      `${scenario.salaryIncreasePct.percent > 0 ? "Increasing" : "Reducing"} pay by ${Math.abs(
        scenario.salaryIncreasePct.percent,
      ).toFixed(1)}% from period ${scenario.salaryIncreasePct.fromSlotIndex}.`,
    );
  }
  if (scenario.oneOffBonus && scenario.oneOffBonus.amountPerHead !== 0) {
    assumptions.push(
      `A one-off bonus of ${scenario.oneOffBonus.amountPerHead} per head in period ${scenario.oneOffBonus.slotIndex}.`,
    );
  }

  const periods: ScenarioPeriod[] = summary.periods.map((p, i) => {
    // Slot position is 1-based and follows the order the engine emits, which is
    // calendar order.
    const slotIndex = i + 1;
    let gross = p.gross;

    if (isProjected(p.kind)) {
      if (scenario.salaryIncreasePct && slotIndex >= scenario.salaryIncreasePct.fromSlotIndex) {
        gross *= 1 + scenario.salaryIncreasePct.percent / 100;
      }
      if (scenario.headcountChange && slotIndex >= scenario.headcountChange.fromSlotIndex) {
        // This slot's own projected per-head, from its baseline gross — `gross`
        // above may already carry the salary increase, and applying the
        // increase twice would price the hire above the raise it was given.
        const slotPerHead = perHeadOf(p);
        const perHead =
          scenario.salaryIncreasePct && slotIndex >= scenario.salaryIncreasePct.fromSlotIndex
            ? slotPerHead * (1 + scenario.salaryIncreasePct.percent / 100)
            : slotPerHead;
        gross += scenario.headcountChange.people * perHead;
      }
      if (scenario.oneOffBonus && slotIndex === scenario.oneOffBonus.slotIndex) {
        const heads =
          headcount +
          (scenario.headcountChange && slotIndex >= scenario.headcountChange.fromSlotIndex
            ? scenario.headcountChange.people
            : 0);
        gross += scenario.oneOffBonus.amountPerHead * heads;
      }
    }

    return {
      label: p.label,
      kind: p.kind,
      baselineGross: round(p.gross),
      scenarioGross: round(gross),
      baselineTotalEmploymentCost: round(p.totalEmploymentCost),
      scenarioTotalEmploymentCost: round(gross * employerUplift),
    };
  });

  const baselineGross = periods.reduce((a, p) => a + p.baselineGross, 0);
  const scenarioGross = periods.reduce((a, p) => a + p.scenarioGross, 0);

  const baseline = {
    gross: round(baselineGross),
    net: round(baselineGross * netShare),
    totalEmploymentCost: round(baselineGross * employerUplift),
  };
  const scenarioTotals = {
    gross: round(scenarioGross),
    net: round(scenarioGross * netShare),
    totalEmploymentCost: round(scenarioGross * employerUplift),
  };

  return {
    periods,
    baseline,
    scenario: scenarioTotals,
    difference: {
      gross: round(scenarioTotals.gross - baseline.gross),
      net: round(scenarioTotals.net - baseline.net),
      totalEmploymentCost: round(
        scenarioTotals.totalEmploymentCost - baseline.totalEmploymentCost,
      ),
    },
    assumptions,
  };
}

/**
 * Step 12b: the projected total cost per head — what a marginal hire costs,
 * for the UI to display.
 *
 * Was `costPerHeadLatest`, the latest *actual* period's cost per head, and it
 * read 16,115.80 at the March cut of `samples/2025` against the recurring
 * projection's 11,265.63 — 43.1% over, because March carries the annual bonus.
 * It is the number on screen beside the scenario controls, so it is the number
 * an owner sizes a hire against; it has to be the one `applyScenario` actually
 * charges.
 *
 * The first projected slot, because that is the next period a hire could start
 * in. Under the average and prior-year methods later slots differ, and
 * `applyScenario` prices each slot from its own figures — this is the headline,
 * not the whole calculation.
 */
export function costPerHeadForecast(summary: AnnualSummary): Money {
  const projected = summary.periods.find((p) => isProjected(p.kind) && (p.headcount ?? 0) > 0);
  if (!projected || !projected.headcount) return 0;
  return roundMoney(
    projected.totalEmploymentCost / projected.headcount,
    minorUnits(summary.currency),
  );
}
