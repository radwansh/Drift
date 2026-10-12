import type { AnnualPeriodInput, ExpectedSlot, PeriodType } from "./types";
import { generateExpectedPeriods } from "./periods";
import { fiscalYearOf } from "./fiscal";
import { groupBySlot } from "./slots";
import { pctChange, roundMoney } from "./math";

export interface YoYMetrics {
  gross: number;
  net: number;
  employerCost: number;
  headcount: number;
  costPerHead: number;
}

export interface YoYSlotPair {
  slotIndex: number;
  label: string;
  currentGross: number | null;
  previousGross: number | null;
}

export interface YoYResult {
  available: boolean;
  comparablePeriods: number;
  /** Like-for-like totals over slots present in both years. */
  current: YoYMetrics;
  previous: YoYMetrics;
  changePct: {
    gross: number | null;
    net: number | null;
    employerCost: number | null;
    headcount: number | null;
    costPerHead: number | null;
  };
  /** True when last year covered every slot in its calendar. */
  previousYearComplete: boolean;
  /**
   * Signed change from last year's full-year total to this year's forecast, in
   * percent. Null unless last year is complete — comparing a forecast against a
   * part-year total is meaningless.
   */
  forecastVsLastYearPct: number | null;
  /** Per-slot gross pairs for the chart's last-year reference line. */
  slotPairs: YoYSlotPair[];

  // Retained for the existing UI, which reads these four directly.
  currentGross: number;
  previousGross: number;
  currentNet: number;
  previousNet: number;
}

interface SlotSnapshot {
  gross: number;
  net: number;
  employerCost: number;
  headcount: number;
  label: string;
}

const EMPTY_METRICS: YoYMetrics = { gross: 0, net: 0, employerCost: 0, headcount: 0, costPerHead: 0 };

function unavailable(): YoYResult {
  return {
    available: false,
    comparablePeriods: 0,
    current: { ...EMPTY_METRICS },
    previous: { ...EMPTY_METRICS },
    changePct: { gross: null, net: null, employerCost: null, headcount: null, costPerHead: null },
    previousYearComplete: false,
    forecastVsLastYearPct: null,
    slotPairs: [],
    currentGross: 0,
    previousGross: 0,
    currentNet: 0,
    previousNet: 0,
  };
}

/**
 * Index a year's periods by slot position, using the shared slot model so a
 * payroll that does not end on a month boundary still aligns (finding C8).
 */
function snapshotBySlot(
  periods: readonly AnnualPeriodInput[],
  employerCostFor: (p: AnnualPeriodInput) => number,
  fiscalStartMonth = 1,
): { map: Map<number, SlotSnapshot>; expected: ExpectedSlot[] } {
  if (periods.length === 0) return { map: new Map(), expected: [] };

  const first = periods[0]!;
  const cadence = first.periodType as PeriodType;
  const year = fiscalYearOf(first.periodEnd, fiscalStartMonth);
  const expected = generateExpectedPeriods(cadence, year, first.periodStart, fiscalStartMonth);
  const slotted = groupBySlot(periods, cadence, expected);

  const map = new Map<number, SlotSnapshot>();
  for (const { slot, period } of slotted) {
    map.set(slot.index, {
      gross: period.gross,
      net: period.net,
      employerCost: employerCostFor(period),
      headcount: period.headcount,
      label: slot.label,
    });
  }
  return { map, expected };
}

export interface YoYOptions {
  current: readonly AnnualPeriodInput[];
  previous: readonly AnnualPeriodInput[];
  /** Full-year forecast gross for this year, when one exists. */
  forecastFullYearGross?: number;
  /** Per-period employer cost, so YoY can compare employer cost too. */
  employerCostFor?: (p: AnnualPeriodInput) => number;
  /** First month of the fiscal year (step 45); 1 = calendar year. */
  fiscalStartMonth?: number;
}

/**
 * Like-for-like year-over-year, aligned by slot index.
 *
 * The headline fix (finding C10): v1 divided this year's forecast by last year's
 * total and multiplied by 100, so an unchanged payroll printed "200%" (P15) and a
 * 4.7% fall printed "95.3%". That is a ratio, not a change. It also compared
 * against a possibly incomplete last year, which flatters or punishes the number
 * depending on how much of last year was uploaded.
 */
export function computeYoY(opts: YoYOptions): YoYResult {
  const { current, previous, forecastFullYearGross } = opts;
  const employerCostFor = opts.employerCostFor ?? (() => 0);

  if (current.length === 0 || previous.length === 0) return unavailable();

  const fiscalStartMonth = opts.fiscalStartMonth ?? 1;
  const cur = snapshotBySlot(current, employerCostFor, fiscalStartMonth);
  const prev = snapshotBySlot(previous, employerCostFor, fiscalStartMonth);

  let comparablePeriods = 0;
  const currentTotals = { gross: 0, net: 0, employerCost: 0, headcounts: [] as number[] };
  const previousTotals = { gross: 0, net: 0, employerCost: 0, headcounts: [] as number[] };

  for (const [slotIndex, c] of cur.map) {
    const p = prev.map.get(slotIndex);
    if (!p) continue;
    comparablePeriods += 1;
    currentTotals.gross += c.gross;
    currentTotals.net += c.net;
    currentTotals.employerCost += c.employerCost;
    currentTotals.headcounts.push(c.headcount);
    previousTotals.gross += p.gross;
    previousTotals.net += p.net;
    previousTotals.employerCost += p.employerCost;
    previousTotals.headcounts.push(p.headcount);
  }

  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const currentHeadcount = avg(currentTotals.headcounts);
  const previousHeadcount = avg(previousTotals.headcounts);

  const currentMetrics: YoYMetrics = {
    gross: roundMoney(currentTotals.gross),
    net: roundMoney(currentTotals.net),
    employerCost: roundMoney(currentTotals.employerCost),
    headcount: Math.round(currentHeadcount * 100) / 100,
    costPerHead:
      currentHeadcount > 0
        ? roundMoney((currentTotals.gross + currentTotals.employerCost) / currentHeadcount)
        : 0,
  };
  const previousMetrics: YoYMetrics = {
    gross: roundMoney(previousTotals.gross),
    net: roundMoney(previousTotals.net),
    employerCost: roundMoney(previousTotals.employerCost),
    headcount: Math.round(previousHeadcount * 100) / 100,
    costPerHead:
      previousHeadcount > 0
        ? roundMoney((previousTotals.gross + previousTotals.employerCost) / previousHeadcount)
        : 0,
  };

  // Complete means every slot of last year's own calendar carried data.
  const previousYearComplete = prev.expected.length > 0 && prev.map.size >= prev.expected.length;

  const lastYearFullGross = previous.reduce((a, p) => a + p.gross, 0);
  const forecastVsLastYearPct =
    typeof forecastFullYearGross === "number" && previousYearComplete
      ? pctChange(forecastFullYearGross, lastYearFullGross)
      : null;

  const slotIndexes = [...new Set([...cur.map.keys(), ...prev.map.keys()])].sort((a, b) => a - b);
  const slotPairs: YoYSlotPair[] = slotIndexes.map((slotIndex) => {
    const c = cur.map.get(slotIndex);
    const p = prev.map.get(slotIndex);
    return {
      slotIndex,
      label: c?.label ?? p?.label ?? `#${slotIndex}`,
      currentGross: c ? roundMoney(c.gross) : null,
      previousGross: p ? roundMoney(p.gross) : null,
    };
  });

  return {
    available: comparablePeriods > 0,
    comparablePeriods,
    current: currentMetrics,
    previous: previousMetrics,
    changePct: {
      gross: pctChange(currentTotals.gross, previousTotals.gross),
      net: pctChange(currentTotals.net, previousTotals.net),
      employerCost: pctChange(currentTotals.employerCost, previousTotals.employerCost),
      headcount: pctChange(currentHeadcount, previousHeadcount),
      costPerHead: pctChange(currentMetrics.costPerHead, previousMetrics.costPerHead),
    },
    previousYearComplete,
    forecastVsLastYearPct,
    slotPairs,
    currentGross: currentMetrics.gross,
    previousGross: previousMetrics.gross,
    currentNet: currentMetrics.net,
    previousNet: previousMetrics.net,
  };
}
