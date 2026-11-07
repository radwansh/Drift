import { classifyComponentWithReason } from "../annual/classify";
import { parseISO } from "../annual/dates";
import { smallestUnit } from "../money";
import { coveredSlots, paidSlots } from "./slots";
import type {
  EmployeeSlotRow,
  EmployeeStatus,
  PresenceResult,
  PresenceSpan,
} from "./types";

/**
 * Presence spans, status, and the three "possibly" labels (step C5).
 *
 * Nothing here resolves anything. Every inference carries the word "possible"
 * or "may", and states what would confirm it, because none of it can be proven
 * from a pay register: proration needs a working-day calendar, an id change
 * needs a stored decision, and both are in the list of data Clarivo does not
 * collect.
 */

/** The classifier rule that marks a one-off earning (retro, severance, payout). */
const ONE_OFF_RULES = new Set(["one-off-earning", "paid-leave"]);

/**
 * A name reduced to something comparable: lower case, no diacritics, no
 * punctuation, tokens sorted so "Haddad Mariam" and "Mariam Haddad" match.
 *
 * Used only to **detect candidates**, never to merge. Merging on name
 * similarity merges two people who share a name and splits one who married.
 */
export function normaliseEmployeeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Runs of paid slots, split by `not_paid` slots and **never** by `missing` ones.
 *
 * A gap in uploads is not a gap in employment. A `missing` slot is therefore
 * transparent here: it neither extends a span nor breaks one. Conflating the
 * two invents a leaver out of a month somebody forgot to upload, and then
 * reports a rehire when it is finally uploaded.
 */
export function presenceSpans(slots: readonly EmployeeSlotRow[]): PresenceSpan[] {
  const spans: PresenceSpan[] = [];
  let open: PresenceSpan | null = null;

  for (const slot of slots) {
    if (slot.kind === "missing") continue;

    if (slot.kind === "not_paid") {
      open = null;
      continue;
    }

    if (open === null) {
      open = {
        fromIndex: slot.slot.index,
        toIndex: slot.slot.index,
        fromLabel: slot.slot.label,
        toLabel: slot.slot.label,
        paidSlots: 1,
      };
      spans.push(open);
      continue;
    }

    open.toIndex = slot.slot.index;
    open.toLabel = slot.slot.label;
    open.paidSlots += 1;
  }

  return spans;
}

/** Whether a YYYY-MM-DD date falls inside a slot's window, inclusive. */
function withinSlot(date: string | null, slot: EmployeeSlotRow): boolean {
  if (!date) return false;
  return date >= slot.slot.start && date <= slot.slot.end;
}

/**
 * Status per spec 3.1/3.2, always naming the slot it is derived from.
 *
 * `left` outranks `joined`: somebody who joined in March and left in June is a
 * leaver, and that is the fact a payroll admin is looking for. A single value
 * is what the list column holds, so the order is a decision rather than an
 * accident of the conditions.
 */
function statusOf(
  slots: readonly EmployeeSlotRow[],
  spans: readonly PresenceSpan[],
  idMayBeReused: boolean,
): EmployeeStatus {
  const base = { idMayBeReused, idMayHaveChanged: false };
  const paid = paidSlots(slots);
  const covered = coveredSlots(slots);

  const lastPaid = paid[paid.length - 1];
  const firstPaid = paid[0];
  const lastCovered = covered[covered.length - 1];
  const firstCovered = covered[0];

  if (!lastPaid || !firstPaid) {
    return { kind: "not_paid_in_range", slotLabel: null, slotIndex: null, ...base };
  }

  if (spans.length >= 2) {
    return {
      kind: "rehired",
      slotLabel: lastPaid.slot.label,
      slotIndex: lastPaid.slot.index,
      ...base,
    };
  }

  // Absent from the latest slot anybody uploaded, so as far as the data goes
  // they stopped being paid.
  if (lastCovered && lastPaid.slot.index < lastCovered.slot.index) {
    return { kind: "left", slotLabel: lastPaid.slot.label, slotIndex: lastPaid.slot.index, ...base };
  }

  if (firstCovered && firstPaid.slot.index > firstCovered.slot.index) {
    return {
      kind: "joined",
      slotLabel: firstPaid.slot.label,
      slotIndex: firstPaid.slot.index,
      ...base,
    };
  }

  return { kind: "active", slotLabel: lastPaid.slot.label, slotIndex: lastPaid.slot.index, ...base };
}

/** The one-off component keys on a slot, itemised rather than totalled. */
function oneOffKeys(slot: EmployeeSlotRow): string[] {
  const keys: string[] = [];
  for (const component of slot.components) {
    if (component.total === 0) continue;
    const reason = classifyComponentWithReason(component.key);
    if (ONE_OFF_RULES.has(reason.rule)) keys.push(component.key);
  }
  return keys;
}

/**
 * Spec 7.6: the last paid slot is a final settlement when any of
 *   (a) `termination_date` falls within the slot window,
 *   (b) a component whose classifier rule is a one-off earning is present, or
 *   (c) the employee does not appear in the next **covered** slot.
 *
 * It is excluded from K5-K8 and from any "largest increase" ranking, because a
 * month carrying severance, notice and a leave payout reads as a 300% pay rise.
 */
function finalSettlementOf(
  slots: readonly EmployeeSlotRow[],
): { index: number | null; keys: string[] } {
  const paid = paidSlots(slots);
  const last = paid[paid.length - 1];
  if (!last) return { index: null, keys: [] };

  const keys = oneOffKeys(last);

  // The next slot anybody **uploaded**, not the next slot on the calendar:
  // absence from a `missing` slot says nothing, because nobody was uploaded
  // for it at all.
  const nextCovered = coveredSlots(slots).find((s) => s.slot.index > last.slot.index);
  const absentFromNextCovered = nextCovered !== undefined && nextCovered.kind === "not_paid";

  const terminated = withinSlot(last.terminationDate, last);

  if (terminated || keys.length > 0 || absentFromNextCovered) {
    return { index: last.slot.index, keys };
  }

  return { index: null, keys: [] };
}

/**
 * Spec 7.7: the first paid slot is **possibly** prorated when `hire_date` falls
 * inside its window, or when its recurring pay is below the next slot's by more
 * than q with no base-rate change between them.
 *
 * "possibly", never "prorated". Proration cannot be proven without a
 * working-day calendar, which Clarivo does not hold, so the honest ceiling is a
 * label that says what would confirm it.
 */
function possiblyProratedOf(
  slots: readonly EmployeeSlotRow[],
  decimals: number,
): number | null {
  const paid = paidSlots(slots);
  const first = paid[0];
  if (!first) return null;

  if (withinSlot(first.hireDate, first)) return first.slot.index;

  const second = paid[1];
  if (!second) return null;

  const q = smallestUnit(decimals);
  const below = second.recurring - first.recurring > q;
  if (!below) return null;

  // A real base-rate rise between the two explains the difference without
  // proration, and labelling it would turn an increase into a data note.
  const baseChanged = Math.abs(baseTotal(second) - baseTotal(first)) > q;
  return baseChanged ? null : first.slot.index;
}

function baseTotal(slot: EmployeeSlotRow): number {
  let total = 0;
  for (const entry of Object.values(slot.byKey)) {
    if (entry.category === "base_salary") total += entry.total;
  }
  return total;
}

/** Whole months between two dates, floored. */
function monthsBetween(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

export function buildPresence(opts: {
  slots: readonly EmployeeSlotRow[];
  decimals: number;
}): PresenceResult {
  const { slots, decimals } = opts;
  const paid = paidSlots(slots);
  const spans = presenceSpans(slots);

  // Names newest first, so index 0 is what the header displays and the rest are
  // the change log's and the search's business.
  const names: string[] = [];
  for (let i = paid.length - 1; i >= 0; i--) {
    const name = paid[i]?.name;
    if (name && !names.includes(name)) names.push(name);
  }

  const hireDates: string[] = [];
  for (const slot of paid) {
    if (slot.hireDate && !hireDates.includes(slot.hireDate)) hireDates.push(slot.hireDate);
  }

  /**
   * Spec 7.12: the same id carrying a materially different name after a gap.
   *
   * A recycled staff number is a different person, and merging their year is
   * worse than splitting it. Reported, never resolved — and the comparison is
   * on the normalised name, so a re-transliteration or a marriage is not
   * mistaken for a different person.
   */
  let idMayBeReused = false;
  if (spans.length >= 2 && names.length >= 2) {
    const first = names[names.length - 1];
    const last = names[0];
    if (first && last && normaliseEmployeeName(first) !== normaliseEmployeeName(last)) {
      idMayBeReused = true;
    }
  }

  const status = statusOf(slots, spans, idMayBeReused);
  const settlement = finalSettlementOf(slots);

  // Tenure only when `hire_date` is mapped, and never across a gap.
  //
  // `hire_date` usually carries the *latest* hire date, overwriting the first
  // spell, so a rehire's tenure computed as "latest period end minus hire
  // date" either ignores the first spell or counts unpaid months as service.
  // Where the dates differ between spells, both become change-log entries
  // rather than one number.
  let tenureMonths: number | null = null;
  let tenureSuppressed: PresenceResult["tenureSuppressed"] = null;
  const hire = hireDates[0];
  const lastPaid = paid[paid.length - 1];
  if (!hire) {
    tenureSuppressed = "not_mapped";
  } else if (spans.length >= 2) {
    tenureSuppressed = "spans_gap";
  } else if (lastPaid) {
    const end = lastPaid.terminationDate ?? lastPaid.slot.end;
    tenureMonths = Math.max(0, monthsBetween(hire, end));
  }

  return {
    spans,
    status,
    finalSettlementIndex: settlement.index,
    finalSettlementKeys: settlement.keys,
    possiblyProratedIndex: possiblyProratedOf(slots, decimals),
    tenureMonths,
    tenureSuppressed,
    hireDates,
    names,
  };
}

/** One employee, as the roster-wide id-change detector needs them. */
export interface RosterEntry {
  externalId: string;
  latestName: string;
  departments: readonly string[];
  /** Slot indexes the id was paid in, so coverage overlap is checkable. */
  paidSlotIndexes: readonly number[];
  /** Recurring pay at the id's own latest clean paid slot. */
  recurring: number;
}

export interface IdChangeCandidate {
  leftId: string;
  joinedId: string;
  normalisedName: string;
  sharedDepartments: string[];
  recurringDifference: number;
}

/**
 * Spec 7.4: candidates for "the same person under a new id", detected and
 * reported, never merged.
 *
 * A payroll provider migration renumbers everyone, so the file splits in two
 * and both halves look like a leaver and a joiner. The shape to look for is
 * the same normalised name, an overlapping department, **disjoint** slot
 * coverage, and recurring pay within q across the join.
 *
 * Bucketed by normalised name first, so this is one pass to build the buckets
 * and then a comparison only within each bucket — not a pairwise pass over the
 * whole roster, which is what makes the naive version the most expensive
 * detection in the feature.
 *
 * Merging would need a stored decision and there is no table for one, so this
 * only ever produces a dismissible note on both files. It is exported and
 * tested but nothing in the v1 query layer calls it: `employeeFile.get` fetches
 * one employee's rows, not the roster.
 */
export function detectIdChangeCandidates(
  roster: readonly RosterEntry[],
  decimals: number,
): IdChangeCandidate[] {
  const q = smallestUnit(decimals);
  const buckets = new Map<string, RosterEntry[]>();

  for (const entry of roster) {
    const key = normaliseEmployeeName(entry.latestName);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const candidates: IdChangeCandidate[] = [];

  for (const [normalisedName, bucket] of buckets) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (!a || !b) continue;

        const aSlots = new Set(a.paidSlotIndexes);
        const overlapping = b.paidSlotIndexes.some((index) => aSlots.has(index));
        if (overlapping) continue;

        const shared = a.departments.filter((d) => b.departments.includes(d));
        if (shared.length === 0) continue;

        const difference = Math.abs(a.recurring - b.recurring);
        if (difference > q) continue;

        const aLast = Math.max(...a.paidSlotIndexes);
        const bLast = Math.max(...b.paidSlotIndexes);
        const [left, joined] = aLast < bLast ? [a, b] : [b, a];

        candidates.push({
          leftId: left.externalId,
          joinedId: joined.externalId,
          normalisedName,
          sharedDepartments: shared,
          recurringDifference: difference,
        });
      }
    }
  }

  return candidates;
}
