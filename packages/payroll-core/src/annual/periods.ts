import type { AnnualPeriodInput, ExpectedSlot, PeriodType } from "./types";
import { addDays, endOfMonth, periodYear, withinYear, yearStart } from "./dates";

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Keep the most recent upload per (period_type, period_start, period_end).
 * Later createdAt wins; returns the deduplicated set sorted by periodStart.
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
): ExpectedSlot[] {
  if (periodType === "monthly" || periodType === "bi_monthly") {
    const slots: ExpectedSlot[] = [];
    for (let m = 1; m <= 12; m++) {
      const start = `${year}-${m < 10 ? `0${m}` : m}-01`;
      const end = endOfMonth(year, m);
      if (periodType === "monthly") {
        slots.push({ label: `${MONTH_NAMES[m - 1]} ${year}`, start, end, index: slots.length + 1 });
      } else {
        slots.push({ label: `B1 ${MONTH_NAMES[m - 1]} ${year}`, start, end: `${year}-${m < 10 ? `0${m}` : m}-15`, index: slots.length + 1 });
        slots.push({ label: `B2 ${MONTH_NAMES[m - 1]} ${year}`, start: `${year}-${m < 10 ? `0${m}` : m}-16`, end, index: slots.length + 1 });
      }
    }
    return slots;
  }

  const step = periodType === "weekly" ? 7 : 14;
  const gridStart: string = anchor ?? yearStart(year);
  const ys = yearStart(year);
  const ye = `${year}-12-31`;

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
    .filter((s) => withinYear(s.end, year))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s, i) => ({ label: `${prefix}${i + 1}`, start: s.start, end: s.end, index: i + 1 }));
}

function maxEnd(actual: readonly { periodEnd: string }[]): string | null {
  if (actual.length === 0) return null;
  return actual.map((a) => a.periodEnd).sort((a, b) => a.localeCompare(b))[actual.length - 1] ?? null;
}

/**
 * Missing periods: expected slots with no uploaded period whose END is on or
 * before the last uploaded end. Leading gaps (before the first upload) and the
 * future (after the last upload) are never flagged.
 */
export function detectMissingPeriods(
  actual: readonly { periodEnd: string }[],
  expected: readonly ExpectedSlot[],
): ExpectedSlot[] {
  const lastEnd = maxEnd(actual);
  if (lastEnd === null) return [];
  const uploaded = new Set(actual.map((a) => a.periodEnd));
  return expected.filter((s) => s.end <= lastEnd && !uploaded.has(s.end));
}

/** Expected slots that still lie in the future after the last upload. */
export function futureExpectedPeriods(
  actual: readonly { periodEnd: string }[],
  expected: readonly ExpectedSlot[],
): ExpectedSlot[] {
  const lastEnd = maxEnd(actual);
  if (lastEnd === null) return [...expected];
  return expected.filter((s) => s.end > lastEnd);
}

/** Actual coverage for the year after deduplicating uploads. */
export function countsPerCadence(
  periods: readonly Pick<AnnualPeriodInput, "periodType" | "periodStart" | "periodEnd" | "createdAt">[],
  year: number,
): Record<PeriodType, number> {
  const deduped = dedupePeriods(periods);
  const counts: Record<PeriodType, number> = { monthly: 0, weekly: 0, bi_monthly: 0, bi_weekly: 0 };
  for (const p of deduped) {
    if (periodYear(p.periodEnd) === year && counts[p.periodType as PeriodType] !== undefined) {
      counts[p.periodType as PeriodType] += 1;
    }
  }
  return counts;
}