import type { AnnualPeriodInput, PeriodType } from "./types";
import { generateExpectedPeriods } from "./periods";
import { roundMoney } from "./math";

export interface YoYResult {
  available: boolean;
  comparablePeriods: number;
  currentGross: number;
  previousGross: number;
  currentNet: number;
  previousNet: number;
  changePct: { gross: number | null; net: number | null };
  forecastVsLastYearPct: number | null;
}

interface PeriodSnapshot {
  gross: number;
  net: number;
}

function periodMap(periods: readonly AnnualPeriodInput[]): Map<string, PeriodSnapshot> {
  if (periods.length === 0) return new Map();
  const first = periods[0]!;
  const type = first.periodType as PeriodType;
  const year = Number(first.periodEnd.slice(0, 4));
  const expected = generateExpectedPeriods(type, year, first.periodStart);
  const map = new Map<string, PeriodSnapshot>();
  for (const p of periods) {
    const slot = expected.find((s) => s.end === p.periodEnd);
    map.set(slot ? `s${slot.index}` : `z${p.periodEnd}`, { gross: p.gross, net: p.net });
  }
  return map;
}

function pctChange(c: number, p: number): number | null {
  if (p === 0) return c !== 0 ? 100 : null;
  return ((c - p) / p) * 100;
}

/**
 * Like-for-like year-over-year. Periods are aligned by their slot position
 * within the cadence calendar, so only periods present in both years count.
 */
export function computeYoY(
  current: readonly AnnualPeriodInput[],
  previous: readonly AnnualPeriodInput[],
  forecastFullYearGross?: number,
): YoYResult {
  if (current.length === 0 || previous.length === 0) {
    return {
      available: false,
      comparablePeriods: 0,
      currentGross: 0,
      previousGross: 0,
      currentNet: 0,
      previousNet: 0,
      changePct: { gross: null, net: null },
      forecastVsLastYearPct: null,
    };
  }

  const currentMap = periodMap(current);
  const previousMap = periodMap(previous);

  let currentGross = 0;
  let previousGross = 0;
  let currentNet = 0;
  let previousNet = 0;
  let comparablePeriods = 0;
  for (const [key, c] of currentMap) {
    const p = previousMap.get(key);
    if (!p) continue;
    comparablePeriods += 1;
    currentGross += c.gross;
    previousGross += p.gross;
    currentNet += c.net;
    previousNet += p.net;
  }

  const lastYearTotalGross = previous.reduce((a, p) => a + p.gross, 0);
  const forecastVsLastYearPct =
    typeof forecastFullYearGross === "number" && lastYearTotalGross > 0
      ? (forecastFullYearGross / lastYearTotalGross) * 100
      : null;

  return {
    available: comparablePeriods > 0,
    comparablePeriods,
    currentGross: roundMoney(currentGross),
    previousGross: roundMoney(previousGross),
    currentNet: roundMoney(currentNet),
    previousNet: roundMoney(previousNet),
    changePct: {
      gross: pctChange(currentGross, previousGross),
      net: pctChange(currentNet, previousNet),
    },
    forecastVsLastYearPct,
  };
}