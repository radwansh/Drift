import type { AnnualPeriodInput } from "./types";
import { average } from "./math";

export interface HeadcountFlowPeriod {
  label: string;
  periodEnd: string;
  headcount: number;
  /**
   * null rather than 0 when the flow is unknowable: the first period of the year
   * with no prior-year roster to compare against, or a period whose predecessor
   * slot was never uploaded.
   */
  joiners: number | null;
  leavers: number | null;
  /** True when the preceding slot is missing, so this flow spans a gap. */
  spansGap: boolean;
}

export interface HeadcountFlows {
  perPeriod: HeadcountFlowPeriod[];
  joinerTotal: number;
  leaverTotal: number;
  avgHeadcount: number;
  /** Leavers over average headcount, as a percentage. Null without data. */
  turnoverRate: number | null;
  /** Turnover scaled to a full year from the elapsed periods. Null without data. */
  annualisedTurnoverRate: number | null;
}

export interface HeadcountOptions {
  periods: readonly AnnualPeriodInput[];
  previousYearLastEmployeeIds?: readonly string[];
  /** Slot index per period, so a gap between consecutive uploads is detectable. */
  slotIndexes?: readonly number[];
  /** Slots in a full year for this cadence, for the annualised rate. */
  periodsPerYear?: number;
}

/**
 * Joiners and leavers per period against the preceding period.
 *
 * Two corrections over v1 (finding C9):
 *   - Turnover is leavers over average headcount. v1 used
 *     ((joiners + leavers) / 2) / avg, so hiring 4 people with nobody leaving
 *     reported 16.7% turnover (P13) — a growing company looked like a churning
 *     one.
 *   - The first period reports null, not 0, when there is no prior-year roster
 *     to diff against (P14). Zero is a claim; null is the truth.
 */
export function computeHeadcountFlows(opts: HeadcountOptions): HeadcountFlows {
  const { periods, previousYearLastEmployeeIds, slotIndexes, periodsPerYear } = opts;

  const hasPriorRoster = previousYearLastEmployeeIds !== undefined;
  let previousIds: Set<string> | null = hasPriorRoster
    ? new Set(previousYearLastEmployeeIds)
    : null;
  let previousSlotIndex: number | null = null;

  const perPeriod: HeadcountFlowPeriod[] = [];

  periods.forEach((period, i) => {
    const currentIds = new Set(period.employeeIds ?? []);
    const slotIndex = slotIndexes?.[i] ?? null;

    // A gap means the diff spans more than one slot, so the flow mixes several
    // periods of movement and should be read with care.
    const spansGap =
      previousSlotIndex !== null && slotIndex !== null && slotIndex - previousSlotIndex > 1;

    let joiners: number | null = null;
    let leavers: number | null = null;
    if (previousIds !== null) {
      joiners = 0;
      leavers = 0;
      for (const id of currentIds) if (!previousIds.has(id)) joiners += 1;
      for (const id of previousIds) if (!currentIds.has(id)) leavers += 1;
    }

    perPeriod.push({
      label: period.periodEnd,
      periodEnd: period.periodEnd,
      headcount: period.headcount,
      joiners,
      leavers,
      spansGap,
    });

    previousIds = currentIds;
    previousSlotIndex = slotIndex;
  });

  const joinerTotal = perPeriod.reduce((a, p) => a + (p.joiners ?? 0), 0);
  const leaverTotal = perPeriod.reduce((a, p) => a + (p.leavers ?? 0), 0);
  const avgHeadcount = average(perPeriod.map((p) => p.headcount));

  const turnoverRate = avgHeadcount > 0 ? (leaverTotal / avgHeadcount) * 100 : null;

  // Scale the elapsed-period rate up to a full year. With 3 of 12 months
  // uploaded, 2% observed turnover annualises to 8%.
  const elapsed = perPeriod.length;
  const annualisedTurnoverRate =
    turnoverRate !== null && periodsPerYear && elapsed > 0
      ? turnoverRate * (periodsPerYear / elapsed)
      : null;

  return {
    perPeriod,
    joinerTotal,
    leaverTotal,
    avgHeadcount,
    turnoverRate,
    annualisedTurnoverRate,
  };
}
