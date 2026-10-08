import type { AnnualPeriodInput } from "./types";
import { average } from "./math";

export interface HeadcountFlowPeriod {
  label: string;
  periodEnd: string;
  headcount: number;
  joiners: number;
  leavers: number;
}

export interface HeadcountFlows {
  perPeriod: HeadcountFlowPeriod[];
  joinerTotal: number;
  leaverTotal: number;
  avgHeadcount: number;
  turnoverRate: number | null;
}

/**
 * Compute joiners/leavers per period against the previous period. The first
 * period of the year is compared against the previous year's last period when
 * its employee ids are available; otherwise flows start from zero.
 */
export function computeHeadcountFlows(
  periods: readonly AnnualPeriodInput[],
  previousYearLastEmployeeIds?: readonly string[],
): HeadcountFlows {
  let previousIds = previousYearLastEmployeeIds ? new Set(previousYearLastEmployeeIds) : null;
  const perPeriod: HeadcountFlowPeriod[] = [];

  for (const period of periods) {
    const currentIds = period.employeeIds ?? [];
    const current = new Set(currentIds);
    let joiners = 0;
    let leavers = 0;
    if (previousIds) {
      for (const id of current) if (!previousIds.has(id)) joiners += 1;
      for (const id of previousIds) if (!current.has(id)) leavers += 1;
    }
    perPeriod.push({
      label: period.periodEnd,
      periodEnd: period.periodEnd,
      headcount: period.headcount,
      joiners,
      leavers,
    });
    previousIds = current;
  }

  const joinerTotal = perPeriod.reduce((a, p) => a + p.joiners, 0);
  const leaverTotal = perPeriod.reduce((a, p) => a + p.leavers, 0);
  const avgHeadcount = average(perPeriod.map((p) => p.headcount));
  const turnoverRate =
    avgHeadcount > 0 ? ((joinerTotal + leaverTotal) / 2 / avgHeadcount) * 100 : null;

  return { perPeriod, joinerTotal, leaverTotal, avgHeadcount, turnoverRate };
}