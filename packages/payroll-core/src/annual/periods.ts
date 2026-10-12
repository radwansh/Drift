import type { ExpectedSlot, PeriodType } from "./types";
import { addDays, endOfMonth } from "./dates";
import {
  DEFAULT_FISCAL_START_MONTH,
  fiscalMonths,
  fiscalYearInterval,
  withinFiscalYear,
} from "./fiscal";
import { assignSlot } from "./slots";

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Keep the most recent upload per (period_type, period_start, period_end).
 * Later createdAt wins; returns the deduplicated set sorted by periodStart.
 *
 * This handles re-uploads of the *same* period. An off-cycle run with different
 * dates that belongs to the same calendar slot is a separate concern, merged by
 * groupBySlot in slots.ts.
 */
export function dedupePeriods<T extends { periodType: string; periodStart: string; periodEnd: string; createdAt: string }>(
  periods: readonly T[],
): T[] {
  const newest = new Map<string, T>();
  for (const p of periods) {
    const key = `${p.periodType}|${p.periodStart}|${p.periodEnd}`;
    const existing = newest.get(key);
    if (!existing || p.createdAt > existing.createdAt) newest.set(key, p);
  }
  return [...newest.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

/** How many uploads were superseded by de-duplication (for DUPLICATES_IGNORED). */
export function countSupersededUploads<T extends { periodType: string; periodStart: string; periodEnd: string; createdAt: string }>(
  periods: readonly T[],
): number {
  return periods.length - dedupePeriods(periods).length;
}

/**
 * The calendar of slots a full year should contain for a cadence (spec 4.5).
 * Weekly/bi-weekly grids are seeded by the anchor (first actual period of the
 * year, defaulting to Jan 1) and count only slots whose END date is in `year`,
 * so the count is generated (52/53, 26/27) — never hard-coded.
 */
export function generateExpectedPeriods(
  periodType: PeriodType,
  year: number,
  anchor?: string,
  /** 1 = calendar year (default). See fiscal.ts (step 45). */
  fiscalStartMonth: number = DEFAULT_FISCAL_START_MONTH,
): ExpectedSlot[] {
  const interval = fiscalYearInterval(year, fiscalStartMonth);

  if (periodType === "monthly" || periodType === "bi_monthly") {
    const slots: ExpectedSlot[] = [];
    // Months come from the fiscal calendar, so an April-start year runs
    // Apr, May … Mar rather than Jan … Dec.
    for (const { year: y, month: m } of fiscalMonths(year, fiscalStartMonth)) {
      const mm = m < 10 ? `0${m}` : String(m);
      const start = `${y}-${mm}-01`;
      const end = endOfMonth(y, m);
      if (periodType === "monthly") {
        slots.push({ label: `${MONTH_NAMES[m - 1]} ${y}`, start, end, index: slots.length + 1 });
      } else {
        slots.push({ label: `B1 ${MONTH_NAMES[m - 1]} ${y}`, start, end: `${y}-${mm}-15`, index: slots.length + 1 });
        slots.push({ label: `B2 ${MONTH_NAMES[m - 1]} ${y}`, start: `${y}-${mm}-16`, end, index: slots.length + 1 });
      }
    }
    return slots;
  }

  const step = periodType === "weekly" ? 7 : 14;
  const gridStart: string = anchor ?? interval.start;
  const ys = interval.start;
  const ye = interval.end;

  const candidates: string[] = [];
  // Back-fill so a slot that starts in the prior year but ends in `year` counts (weekly crossing 31 Dec).
  for (let d = gridStart; addDays(d, step - 1).localeCompare(ys) >= 0; d = addDays(d, -step)) {
    candidates.push(d);
  }
  // Forward-fill while each slot's END still lies within the year.
  for (let d = addDays(gridStart, step); addDays(d, step - 1).localeCompare(ye) <= 0; d = addDays(d, step)) {
    candidates.push(d);
  }

  const prefix = periodType === "weekly" ? "W" : "BW";
  return [...new Set(candidates)]
    .map((start) => ({ start, end: addDays(start, step - 1) }))
    .filter((s) => withinFiscalYear(s.end, year, fiscalStartMonth))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s, i) => ({ label: `${prefix}${i + 1}`, start: s.start, end: s.end, index: i + 1 }));
}

/** Slot indexes that have at least one uploaded period, via the shared slot model. */
export function coveredSlotIndexes(
  actual: readonly { periodEnd: string }[],
  expected: readonly ExpectedSlot[],
  cadence: PeriodType,
): Set<number> {
  const covered = new Set<number>();
  for (const p of actual) {
    const slot = assignSlot(p, cadence, expected);
    if (slot) covered.add(slot.index);
  }
  return covered;
}

/**
 * Missing periods: expected slots with no uploaded period at or before the newest
 * covered slot.
 *
 * Leading gaps ARE flagged — a year whose first upload is March is missing
 * January and February. (The old comment here claimed they never were, which
 * contradicted the code and its own test; finding C17/P19.) Only the future,
 * after the last upload, is excluded.
 */
export function detectMissingPeriods(
  actual: readonly { periodEnd: string }[],
  expected: readonly ExpectedSlot[],
  cadence: PeriodType = "monthly",
): ExpectedSlot[] {
  const covered = coveredSlotIndexes(actual, expected, cadence);
  if (covered.size === 0) return [];
  const lastCovered = Math.max(...covered);
  return expected.filter((s) => s.index <= lastCovered && !covered.has(s.index));
}

/** Expected slots that still lie in the future after the last upload. */
export function futureExpectedPeriods(
  actual: readonly { periodEnd: string }[],
  expected: readonly ExpectedSlot[],
  cadence: PeriodType = "monthly",
): ExpectedSlot[] {
  const covered = coveredSlotIndexes(actual, expected, cadence);
  if (covered.size === 0) return [...expected];
  const lastCovered = Math.max(...covered);
  return expected.filter((s) => s.index > lastCovered);
}
