import type { Category } from "../annual/types";
import type { EmployeeRecord, ComparisonOutput } from "../types";
import {
  reconcileRegister,
  describeBreach,
  type ReconcileRow,
  type ReconciliationReport,
} from "../reconcile";
import { detectAnomalies, DEFAULT_TOLERANCES, type AnomalyTolerances } from "../anomaly-detector";
import { diffComponents } from "../differ";
import { calculateDelta } from "../delta-calculator";
import { paidSlots, gapLabelsBetween } from "./slots";
import type { EmployeeFlag, EmployeeSlotRow } from "./types";

/**
 * Reconciliation breaches and anomaly flags, by reuse (step C4).
 *
 * Two engines in this package already do this work. Neither is called the
 * obvious way here, and both reuses are worth stating precisely, because
 * re-implementing either produces a third answer to a question the product
 * should only have one answer to.
 */

/**
 * The slot's components as `reconcileRegister` wants them.
 *
 * Absent keys stay absent rather than becoming 0 — `reconcileRegister` skips
 * `null` and `undefined`, and a blank cell read as 0 is spec 7.14's trap.
 */
function componentsOf(slot: EmployeeSlotRow): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const component of slot.components) out[component.key] = component.total;
  return out;
}

/**
 * Reconcile one employee's range, with the **slots** as the rows.
 *
 * `reconcileRegister` takes `{rows, decimals, rowNumbers, answeredCategories}`
 * where each row is `{employeeId, gross, net, components}`. Passing one
 * pseudo-row per paid slot, with the slot label in place of the employee id,
 * buys three things that calling it per slot does not:
 *
 *   - `breaches` comes back per slot with `expected`, `actual` and
 *     `difference` — exactly spec 4.3's "the slot, the expected figure, the
 *     register's figure and the difference", for all four checks, on **every**
 *     slot in range rather than only the latest. That is spec 7.16.
 *   - `mixedSignColumns` is computed per column **across the range**, which is
 *     precisely spec 7.15's "when a key has both signs for this employee in
 *     range". It is not obtainable by calling the function per slot, because
 *     sign inference is a column-across-rows pass. **This is the reason for the
 *     pseudo-row shape — do not "simplify" it into a per-slot call, which
 *     silently loses all mixed-sign detection.**
 *   - a column it cannot read already suppresses that row's identity-2 verdict,
 *     which is spec 7.15's "suppress the deduction-rate KPIs for the affected
 *     slots" for free.
 *
 * Only paid slots are passed. A `not_paid` or `missing` slot has no rows, so
 * its pseudo-row would be all zeros: it can raise no breach (0 - 0 = 0 on both
 * identities) and carries no sign information, so including it changes nothing
 * and costs a row.
 *
 * Tolerance is the currency's minor unit, absolute, via `decimals`. Not a
 * percentage — 2% of a 20M payroll hides 400,000.
 */
export function reconcileEmployeeRange(opts: {
  slots: readonly EmployeeSlotRow[];
  decimals: number;
  savedCategories?: Readonly<Record<string, Category>>;
}): ReconciliationReport {
  const rows: ReconcileRow[] = paidSlots(opts.slots).map((slot) => ({
    employeeId: slot.slot.label,
    gross: slot.gross ?? 0,
    net: slot.net ?? 0,
    components: componentsOf(slot),
  }));

  return reconcileRegister({
    rows,
    decimals: opts.decimals,
    answeredCategories: opts.savedCategories,
  });
}

/** An `EmployeeRecord`, as the anomaly detector wants one, from a slot. */
function recordOf(slot: EmployeeSlotRow, externalId: string): EmployeeRecord {
  return {
    externalId,
    name: slot.name ?? externalId,
    department: slot.department,
    components: componentsOf(slot),
    grossSalary: slot.gross ?? 0,
    netSalary: slot.net ?? 0,
  };
}

/**
 * The `ComparisonOutput` a pair of slots implies.
 *
 * Built locally rather than by calling `runComparison`, which throws
 * `DuplicateEmployeeIdsError` — correct for a register-wide comparison, wrong
 * here, where the file sums duplicate rows and flags the slot instead. It also
 * matches whole registers against each other, which is not what is being
 * compared.
 */
function comparisonOf(
  current: EmployeeSlotRow,
  previous: EmployeeSlotRow,
  externalId: string,
  decimals: number,
): ComparisonOutput {
  const currentComponents = componentsOf(current);
  const previousComponents = componentsOf(previous);
  const gross = calculateDelta(current.gross, previous.gross, decimals);
  const net = calculateDelta(current.net, previous.net, decimals);

  return {
    employeeExternalId: externalId,
    employeeName: current.name ?? externalId,
    department: current.department,
    currentComponents,
    previousComponents,
    componentDeltas: diffComponents(currentComponents, previousComponents, decimals),
    currentGross: current.gross,
    previousGross: previous.gross,
    currentNet: current.net,
    previousNet: previous.net,
    grossDelta: gross.absolute,
    netDelta: net.absolute,
    // `detectAnomalies` never reads `status`; the classifier that produces it
    // compares whole registers, which is not what a slot pair is.
    status: "unchanged",
    anomalyFlags: null,
  };
}

/**
 * Anomaly types the reconciliation pass already owns.
 *
 * `detectAnomalies` checks these on the current period alone, so iterating
 * pairs would raise them once per pair and never for the first paid slot, which
 * has no pair. `reconcileEmployeeRange` checks the same two identities on
 * **every** paid slot, which is both complete and what spec 7.16 asks for, so
 * the pairwise copies are dropped.
 */
const RECONCILIATION_OWNED = new Set(["negative_net", "net_exceeds_gross"]);

export interface EmployeeFlagsResult {
  flags: EmployeeFlag[];
  reconciliation: ReconciliationReport;
  /** The tolerances the pairwise checks used. */
  tolerances: AnomalyTolerances;
  /** Whether they came from `companies.settings` or the defaults. */
  tolerancesSource: "company" | "default";
}

export interface BuildEmployeeFlagsOptions {
  externalId: string;
  slots: readonly EmployeeSlotRow[];
  decimals: number;
  savedCategories?: Readonly<Record<string, Category>>;
  /** From `companies.settings`. Absent falls back to `DEFAULT_TOLERANCES`. */
  tolerances?: Partial<AnomalyTolerances>;
}

export function buildEmployeeFlags(opts: BuildEmployeeFlagsOptions): EmployeeFlagsResult {
  const { externalId, slots, decimals, savedCategories } = opts;

  const reconciliation = reconcileEmployeeRange({ slots, decimals, savedCategories });

  const byLabel = new Map<string, EmployeeSlotRow>();
  for (const slot of slots) byLabel.set(slot.slot.label, slot);

  const flags: EmployeeFlag[] = [];

  for (const breach of reconciliation.breaches) {
    const slot = byLabel.get(breach.employeeId);
    flags.push({
      type: breach.code,
      // Both identities failing and either impossibility is `critical`: these
      // are arithmetic that cannot be right, whatever the payroll system
      // intended, and spec 7.16 requires them findable from the list.
      severity: "critical",
      description: describeBreach(breach, decimals),
      source: "reconciliation",
      slotLabel: breach.employeeId,
      slotIndex: slot?.slot.index ?? null,
      expected: breach.expected,
      actual: breach.actual,
      difference: breach.difference,
      spansGap: false,
    });
  }

  for (const column of reconciliation.mixedSignColumns) {
    flags.push({
      type: "mixed_sign_column",
      severity: "warning",
      description:
        `"${column.componentKey}" is written as a positive magnitude for some periods and a ` +
        "negative delta for others, so it cannot be read without guessing which rows reduce " +
        "net. The deduction identity is not stated for the affected slots.",
      source: "reconciliation",
      slotLabel: null,
      slotIndex: null,
      expected: null,
      actual: null,
      difference: null,
      spansGap: false,
    });
  }

  const tolerances: AnomalyTolerances = { ...DEFAULT_TOLERANCES, ...opts.tolerances };
  const tolerancesSource: "company" | "default" =
    opts.tolerances && Object.keys(opts.tolerances).length > 0 ? "company" : "default";

  // Pairwise checks run over consecutive members of P(e), so a pair spanning a
  // `missing` slot is computed between the two **covered** slots and marked
  // "spans a gap" rather than skipped — the movement is real, it is just
  // measured over a longer window than one slot.
  const paid = paidSlots(slots);
  for (let i = 1; i < paid.length; i++) {
    const previous = paid[i - 1];
    const current = paid[i];
    if (!previous || !current) continue;
    // Summing two rows looks like a doubling, so a duplicate slot on either
    // side would fire `net_change_beyond_tolerance` spuriously.
    if (previous.kind === "duplicate" || current.kind === "duplicate") continue;

    const gapLabels = gapLabelsBetween(slots, previous.slot.index, current.slot.index);
    const detected = detectAnomalies(
      recordOf(current, externalId),
      recordOf(previous, externalId),
      comparisonOf(current, previous, externalId, decimals),
      { tolerances, decimals },
    );

    for (const flag of detected) {
      if (RECONCILIATION_OWNED.has(flag.type)) continue;
      flags.push({
        type: flag.type,
        severity: flag.severity,
        description: flag.description,
        source: "anomaly",
        slotLabel: current.slot.label,
        slotIndex: current.slot.index,
        expected: null,
        actual: null,
        difference: null,
        spansGap: gapLabels.length > 0,
      });
    }
  }

  return { flags, reconciliation, tolerances, tolerancesSource };
}

/** The two flag types that must be findable from the list without opening a file. */
export const CRITICAL_LIST_FLAGS: readonly string[] = ["net_exceeds_gross", "negative_net"];
