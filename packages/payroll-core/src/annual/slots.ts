import type { AnnualPeriodInput, ComponentAggregate, ExpectedSlot, PeriodType } from "./types";
import { diffDays, parseISO } from "./dates";

/**
 * One slot-assignment function, used by de-duplication, coverage, labels,
 * year-on-year and the prior-year forecast (finding A8).
 *
 * Before this existed, five places matched a period to a calendar slot by exact
 * end-date equality. Any payroll that does not end on the last day of the month —
 * a 26th-to-25th cycle, say — matched nothing, so the same year simultaneously
 * reported months missing, forecast a month twice, and labelled its bars with raw
 * ISO dates (findings C8, P7, P9).
 *
 * The rule per cadence:
 *   monthly      the month its END date falls in
 *   bi_monthly   that month's first half (end day <= 15) or second half
 *   weekly       the grid slot whose end date is nearest
 *   bi_weekly    likewise
 *
 * Returns null only when the period's end date lies outside every slot's year,
 * which the caller should treat as "not part of this year".
 */
export function assignSlot(
  period: { periodEnd: string },
  cadence: PeriodType,
  expected: readonly ExpectedSlot[],
): ExpectedSlot | null {
  if (expected.length === 0) return null;

  const end = parseISO(period.periodEnd);
  const month = end.getUTCMonth() + 1;
  const day = end.getUTCDate();

  if (cadence === "monthly") {
    return expected.find((s) => parseISO(s.end).getUTCMonth() + 1 === month) ?? null;
  }

  if (cadence === "bi_monthly") {
    const wantFirstHalf = day <= 15;
    return (
      expected.find((s) => {
        const slotEnd = parseISO(s.end);
        if (slotEnd.getUTCMonth() + 1 !== month) return false;
        return (slotEnd.getUTCDate() <= 15) === wantFirstHalf;
      }) ?? null
    );
  }

  // weekly / bi_weekly: nearest grid slot by end date. Ties go to the earlier
  // slot so assignment is deterministic.
  let best: ExpectedSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of expected) {
    const distance = Math.abs(diffDays(slot.end, period.periodEnd));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = slot;
    }
  }
  return best;
}

export interface SlottedPeriod {
  slot: ExpectedSlot;
  /** The merged period. Off-cycle runs sharing a slot are summed into one. */
  period: AnnualPeriodInput;
  /** How many uploaded periods were merged into this slot (1 = just the one). */
  mergedCount: number;
}

function mergeComponents(
  a: readonly ComponentAggregate[],
  b: readonly ComponentAggregate[],
): ComponentAggregate[] {
  const byKey = new Map<string, ComponentAggregate>();
  for (const c of [...a, ...b]) {
    const existing = byKey.get(c.key);
    if (!existing) {
      byKey.set(c.key, { ...c });
    } else {
      existing.total += c.total;
      existing.negRows += c.negRows;
      existing.posRows += c.posRows;
    }
  }
  return [...byKey.values()];
}

/**
 * Group periods onto their slots, merging any that share one.
 *
 * Merging is what makes an off-cycle run (a December bonus payroll, a mid-month
 * correction) add to its month rather than appear as an extra period — which is
 * what produced "13 periods in the year" and two March bars. Money and component
 * rows are summed; headcount takes the larger of the two (a bonus run covering a
 * subset of staff must not be read as a headcount drop), and employee ids are
 * unioned so joiner/leaver maths sees the full roster.
 */
export function groupBySlot(
  periods: readonly AnnualPeriodInput[],
  cadence: PeriodType,
  expected: readonly ExpectedSlot[],
): SlottedPeriod[] {
  const bySlotIndex = new Map<number, SlottedPeriod>();

  for (const p of periods) {
    const slot = assignSlot(p, cadence, expected);
    if (!slot) continue;

    const existing = bySlotIndex.get(slot.index);
    if (!existing) {
      bySlotIndex.set(slot.index, { slot, period: { ...p }, mergedCount: 1 });
      continue;
    }

    const merged = existing.period;
    merged.gross += p.gross;
    merged.net += p.net;
    merged.headcount = Math.max(merged.headcount, p.headcount);
    merged.components = mergeComponents(merged.components, p.components);
    merged.employeeIds = [...new Set([...(merged.employeeIds ?? []), ...(p.employeeIds ?? [])])];
    // The slot keeps the latest end date actually uploaded, so "last period end"
    // reflects reality rather than the calendar.
    if (p.periodEnd > merged.periodEnd) merged.periodEnd = p.periodEnd;
    if (p.periodStart < merged.periodStart) merged.periodStart = p.periodStart;
    existing.mergedCount += 1;
  }

  return [...bySlotIndex.values()].sort((a, b) => a.slot.index - b.slot.index);
}

/**
 * Split the calendar around what has been uploaded.
 *
 * `covered` are slots with data. `missingPast` are gaps at or before the newest
 * covered slot — including leading gaps, which are real gaps in the year even
 * though the old comment in periods.ts claimed they were never flagged.
 * `remaining` are slots after it, i.e. the future to forecast.
 */
export interface SlotCoverage {
  covered: SlottedPeriod[];
  missingPast: ExpectedSlot[];
  remaining: ExpectedSlot[];
  lastCoveredIndex: number | null;
}

export function splitCoverage(
  periods: readonly AnnualPeriodInput[],
  cadence: PeriodType,
  expected: readonly ExpectedSlot[],
): SlotCoverage {
  const covered = groupBySlot(periods, cadence, expected);
  if (covered.length === 0) {
    return { covered, missingPast: [], remaining: [...expected], lastCoveredIndex: null };
  }

  const coveredIndexes = new Set(covered.map((c) => c.slot.index));
  const lastCoveredIndex = Math.max(...coveredIndexes);

  const missingPast = expected.filter((s) => s.index <= lastCoveredIndex && !coveredIndexes.has(s.index));
  const remaining = expected.filter((s) => s.index > lastCoveredIndex);

  return { covered, missingPast, remaining, lastCoveredIndex };
}
