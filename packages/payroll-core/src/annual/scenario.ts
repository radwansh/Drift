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

export function applyScenario(summary: AnnualSummary, scenario: Scenario): ScenarioResult {
  const decimals = minorUnits(summary.currency);
  const round = (value: number) => roundMoney(value, decimals);
  const assumptions: string[] = [];

  // Per-head cost in a projected period, measured from the latest actual period
  // so a hire is costed at current pay rather than a year-long average.
  const actuals = summary.periods.filter((p) => p.kind === "actual");
  const lastActual = actuals[actuals.length - 1];
  const headcount = lastActual?.headcount ?? 0;
  const grossPerHead = headcount > 0 && lastActual ? lastActual.gross / headcount : 0;
  const costPerHead = headcount > 0 && lastActual ? lastActual.totalEmploymentCost / headcount : 0;

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
      } from period ${fromSlotIndex}, costed at the latest actual period's cost per head.`,
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
        const perHead = scenario.salaryIncreasePct && slotIndex >= scenario.salaryIncreasePct.fromSlotIndex
          ? grossPerHead * (1 + scenario.salaryIncreasePct.percent / 100)
          : grossPerHead;
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

/** Cost per head in the latest actual period, for the UI to display. */
export function costPerHeadLatest(summary: AnnualSummary): Money {
  const actuals = summary.periods.filter((p) => p.kind === "actual");
  const last = actuals[actuals.length - 1];
  if (!last || !last.headcount) return 0;
  return roundMoney(last.totalEmploymentCost / last.headcount, minorUnits(summary.currency));
}
