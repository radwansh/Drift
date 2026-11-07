import type { Category, ExpectedSlot, PeriodType } from "../annual/types";
import { assignSlot } from "../annual/slots";
import { roundToMinorUnits } from "../money";
import { buildSlotMoney } from "./totals";
import type {
  EmployeePeriodInput,
  EmployeeSlotKind,
  EmployeeSlotRow,
  EmployeeSlotRun,
  EmployeeSnapshotRow,
} from "./types";

/**
 * One output row per slot in R, in calendar order (step C2).
 *
 * **Never only the slots with data.** The slot list is R, from
 * `generateExpectedPeriods`, so a month nobody uploaded is shown, labelled and
 * excluded from every denominator rather than quietly absent — which is the
 * difference between "we paid this person nothing in April" and "we do not know
 * what we paid this person in April".
 *
 * Everything calendar-shaped goes through `assignSlot`. Not one end-date
 * comparison in this file: before `assignSlot` existed, five places matched a
 * period to a slot by exact end-date equality, so a 26th-to-25th payroll
 * matched nothing.
 */

/**
 * Which periods sit on which slot, and how many merged onto each.
 *
 * Several periods on one slot merge — an off-cycle bonus run, a mid-month
 * correction — the way `groupBySlot` merges them, summing money. That is what
 * stops a December bonus run appearing as a thirteenth period.
 */
function periodsBySlotIndex(
  periods: readonly EmployeePeriodInput[],
  cadence: PeriodType,
  expected: readonly ExpectedSlot[],
): Map<number, EmployeePeriodInput[]> {
  const bySlot = new Map<number, EmployeePeriodInput[]>();
  for (const period of periods) {
    const slot = assignSlot(period, cadence, expected);
    if (!slot) continue;
    const list = bySlot.get(slot.index);
    if (list) list.push(period);
    else bySlot.set(slot.index, [period]);
  }
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  }
  return bySlot;
}

/**
 * The slot kind for one slot's periods and rows.
 *
 * **`duplicate` is per period, not per slot**, and that is a deliberate
 * reading of a place where spec 2.3 and 7.2 pull against each other. Section
 * 2.3 defines `duplicate` as "rows(e,p) has more than one row", where rows(e,p)
 * spans every period on the slot; section 7.2 requires an off-cycle run to
 * merge and says nothing about flagging it. Taken literally together, every
 * December bonus run would be reported as a duplicated export.
 *
 * So: more than one row for this employee **within a single period** is a
 * duplicate (spec 7.3 — the dangerous case, where the register may have paid
 * somebody twice). One row in each of two merged periods is a merge, carried as
 * `mergedRunCount` and shown as "2 runs merged", not flagged. Both of the
 * spec's own confirmations hold under this reading and neither holds under the
 * literal one.
 */
function kindFor(runs: readonly EmployeeSlotRun[], hasPeriods: boolean): EmployeeSlotKind {
  if (!hasPeriods) return "missing";
  const rowCount = runs.reduce((a, r) => a + r.rowCount, 0);
  if (rowCount === 0) return "not_paid";
  if (runs.some((r) => r.rowCount > 1)) return "duplicate";
  return "actual";
}

/** The latest row by period end, then by the snapshot's own insert order. */
function latestRow(
  rows: readonly EmployeeSnapshotRow[],
  periodEndById: ReadonlyMap<string, string>,
): EmployeeSnapshotRow | undefined {
  let best: EmployeeSnapshotRow | undefined;
  let bestEnd = "";
  for (const row of rows) {
    const end = periodEndById.get(row.payrollPeriodId) ?? "";
    if (best === undefined || end >= bestEnd) {
      best = row;
      bestEnd = end;
    }
  }
  return best;
}

/** First non-null across the rows, so one mapped column is enough. */
function firstNonNull<T>(
  rows: readonly EmployeeSnapshotRow[],
  pick: (row: EmployeeSnapshotRow) => T | null,
): T | null {
  for (const row of rows) {
    const value = pick(row);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export interface BuildEmployeeSlotsOptions {
  /** R — the expected slot calendar for the range. */
  expected: readonly ExpectedSlot[];
  /** Ready periods in scope, **already de-duplicated** by `dedupePeriods`. */
  periods: readonly EmployeePeriodInput[];
  cadence: PeriodType;
  /** Every snapshot row for this employee. **Not** de-duplicated. */
  rows: readonly EmployeeSnapshotRow[];
  /** The three-step category resolution of spec 2.2. */
  resolve: (key: string) => Category;
  ambiguityOf?: (key: string) => { question: string } | undefined;
  /** `minorUnits(currency)`. */
  decimals: number;
}

export function buildEmployeeSlots(opts: BuildEmployeeSlotsOptions): EmployeeSlotRow[] {
  const { expected, periods, cadence, rows, resolve, ambiguityOf, decimals } = opts;
  const round = (v: number) => roundToMinorUnits(v, decimals);

  const bySlot = periodsBySlotIndex(periods, cadence, expected);

  const periodEndById = new Map<string, string>();
  for (const period of periods) periodEndById.set(period.id, period.periodEnd);

  const rowsByPeriod = new Map<string, EmployeeSnapshotRow[]>();
  for (const row of rows) {
    const list = rowsByPeriod.get(row.payrollPeriodId);
    if (list) list.push(row);
    else rowsByPeriod.set(row.payrollPeriodId, [row]);
  }

  const out: EmployeeSlotRow[] = [];

  for (const slot of expected) {
    const slotPeriods = bySlot.get(slot.index) ?? [];

    const runs: EmployeeSlotRun[] = slotPeriods.map((period) => {
      const periodRows = rowsByPeriod.get(period.id) ?? [];
      return {
        periodId: period.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        rowCount: periodRows.length,
        // Summed, not de-duplicated: the sum is what ties to the register and
        // to `payroll_periods.total_gross`, which accumulates every row.
        gross: round(periodRows.reduce((a, r) => a + r.gross, 0)),
        net: round(periodRows.reduce((a, r) => a + r.net, 0)),
      };
    });

    const slotRows = slotPeriods.flatMap((period) => rowsByPeriod.get(period.id) ?? []);
    const kind = kindFor(runs, slotPeriods.length > 0);
    const hasRows = slotRows.length > 0;

    const gross = hasRows ? round(slotRows.reduce((a, r) => a + r.gross, 0)) : null;
    const net = hasRows ? round(slotRows.reduce((a, r) => a + r.net, 0)) : null;

    // With no rows there are no components either, so every figure this
    // returns is 0 and no category is present. `gross` and `net` stay null
    // above, which is what keeps a gap off a chart and out of a denominator —
    // the zeros here are the absence of money, not a claim that nothing was
    // paid on a slot nobody uploaded.
    const money = buildSlotMoney({
      rows: slotRows,
      gross: gross ?? 0,
      net: net ?? 0,
      resolve,
      ambiguityOf,
      decimals,
    });

    const latest = latestRow(slotRows, periodEndById);

    out.push({
      slot,
      kind,
      rowCount: slotRows.length,
      gross,
      net,
      ...money,
      // This slot's own department. Money is attributed here rather than to the
      // latest one, or a transfer moves two departments' year totals after an
      // upload that contained no new money (spec 7.8).
      department: latest?.department ?? null,
      name: latest?.employeeName ?? null,
      fte: firstNonNull(slotRows, (r) => r.fte),
      hireDate: firstNonNull(slotRows, (r) => r.hireDate),
      terminationDate: firstNonNull(slotRows, (r) => r.terminationDate),
      dimensions: latest?.dimensions ?? {},
      mergedRunCount: slotPeriods.length,
      runs,
      rows: slotRows,
    });
  }

  return out;
}

/** P(e): the slots the employee was actually paid in. */
export function paidSlots(slots: readonly EmployeeSlotRow[]): EmployeeSlotRow[] {
  return slots.filter((s) => s.kind === "actual" || s.kind === "duplicate");
}

/** P(e) minus `duplicate`: the denominator for every rate and average. */
export function cleanPaidSlots(slots: readonly EmployeeSlotRow[]): EmployeeSlotRow[] {
  return slots.filter((s) => s.kind === "actual");
}

/** C: the slots with at least one upload, paid or not. */
export function coveredSlots(slots: readonly EmployeeSlotRow[]): EmployeeSlotRow[] {
  return slots.filter((s) => s.kind !== "missing");
}

/**
 * Whether a window between two slot indexes crosses a slot nobody uploaded.
 *
 * A `not_paid` slot in between is **not** a gap: it is a fact about this
 * employee, not a hole in the data. Conflating the two is what invents a leaver
 * out of a month somebody forgot to upload.
 */
export function gapLabelsBetween(
  slots: readonly EmployeeSlotRow[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const labels: string[] = [];
  for (const slot of slots) {
    if (slot.slot.index <= fromIndex || slot.slot.index >= toIndex) continue;
    if (slot.kind === "missing") labels.push(slot.slot.label);
  }
  return labels;
}
