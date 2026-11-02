import type { Category, ExpectedSlot, PeriodType } from "../annual/types";
import { classifyComponent, ambiguityFor } from "../annual/classify";
import type { AnomalyTolerances } from "../anomaly-detector";
import { minorUnits } from "../money";
import { buildChangeLog } from "./changelog";
import { buildEmployeeFlags } from "./flags";
import { buildEmployeeKpis } from "./kpis";
import { buildPresence } from "./presence";
import { buildEmployeeSlots, paidSlots } from "./slots";
import type {
  EmployeeFileResult,
  EmployeePeriodInput,
  EmployeeSlotRow,
  EmployeeSnapshotRow,
  EmployeeTieOuts,
} from "./types";

/**
 * The whole file, assembled from snapshot rows and a slot calendar.
 *
 * `buildEmployeeSlots` -> totals -> flags -> presence -> KPIs -> change log, in
 * that order, because each stage reads the one before it. The router calls this
 * and returns the result; nothing arithmetical lives in `apps/web`.
 */

/**
 * The three-step category resolution of spec 2.2: the company's saved
 * `component_categories.category`, else `classifyComponent(key)`, else
 * `uncategorised`.
 *
 * Identical to `resolveFor` in `annual/summary.ts`, and deliberately so. One
 * classifier, one answer — otherwise the Employee File and the annual dashboard
 * put the same column on different sides of the same bridge.
 */
export function resolveEmployeeCategory(
  saved?: Readonly<Record<string, Category>>,
): (key: string) => Category {
  return (key: string) => saved?.[key] ?? classifyComponent(key);
}

/**
 * The question a column raises, or undefined when it can be placed.
 *
 * A column the company has already decided is never asked about again, which is
 * why the saved map short-circuits it rather than being consulted afterwards.
 */
export function ambiguityOfFor(
  saved?: Readonly<Record<string, Category>>,
): (key: string) => { question: string } | undefined {
  return (key: string) => (saved?.[key] ? undefined : ambiguityFor(key));
}

/**
 * R3, R5 and R6, reported rather than reconciled away.
 *
 * Where the sum of employee grosses differs from `payroll_periods.total_gross`,
 * the file says which cause applies: duplicate rows, or several runs merged
 * onto one slot. And R6 — `period_component_totals` applies
 * `DISTINCT ON (employee_external_id)` while this feature sums every row, so
 * with duplicates present the two **differ by the dropped rows**. The Employee
 * File is authoritative for the register tie-out, and the gap is displayed
 * rather than hidden, because the next person to see the discrepancy must find
 * the decision instead of "fixing" one side.
 */
function buildTieOuts(
  slots: readonly EmployeeSlotRow[],
  periods: readonly EmployeePeriodInput[],
): EmployeeTieOuts {
  const totalGrossById = new Map<string, number | null>();
  const controlById = new Map<string, EmployeePeriodInput>();
  for (const period of periods) {
    totalGrossById.set(period.id, period.totalGross ?? null);
    controlById.set(period.id, period);
  }

  const perSlot: EmployeeTieOuts["perSlot"] = [];
  const controlTotals: EmployeeTieOuts["controlTotals"] = [];
  let anyDuplicate = false;

  for (const slot of paidSlots(slots)) {
    let periodTotalGross: number | null = null;
    for (const run of slot.runs) {
      const total = totalGrossById.get(run.periodId) ?? null;
      if (total === null) continue;
      periodTotalGross = (periodTotalGross ?? 0) + total;
    }

    if (slot.kind === "duplicate") anyDuplicate = true;

    perSlot.push({
      slotLabel: slot.slot.label,
      slotIndex: slot.slot.index,
      employeeGross: slot.gross ?? 0,
      periodTotalGross,
      cause:
        slot.kind === "duplicate"
          ? "duplicate_rows"
          : slot.mergedRunCount > 1
            ? "merged_runs"
            : null,
    });

    // R5: a line the admin left blank is **not** a pass. Clarivo's own totals
    // can only ever agree with themselves, so an unsupplied control total means
    // the register was never checked against anything outside Clarivo.
    for (const run of slot.runs) {
      const period = controlById.get(run.periodId);
      if (!period) continue;
      controlTotals.push({
        slotLabel: slot.slot.label,
        grossSupplied: period.controlTotalGross !== null && period.controlTotalGross !== undefined,
        netSupplied: period.controlTotalNet !== null && period.controlTotalNet !== undefined,
      });
    }
  }

  return {
    perSlot,
    controlTotals,
    aggregateGapCause: anyDuplicate ? "duplicate_rows" : null,
  };
}

export interface BuildEmployeeFileOptions {
  externalId: string;
  /** R — the expected slot calendar for the selected range. */
  expected: readonly ExpectedSlot[];
  /** Ready periods in scope, **already de-duplicated** by `dedupePeriods`. */
  periods: readonly EmployeePeriodInput[];
  cadence: PeriodType;
  currency: string;
  /** Every snapshot row for this employee in scope. **Not** de-duplicated. */
  rows: readonly EmployeeSnapshotRow[];
  /** The company's saved `component_categories`. */
  savedCategories?: Readonly<Record<string, Category>>;
  /** From `companies.settings`, with `DEFAULT_TOLERANCES` as the fallback. */
  tolerances?: Partial<AnomalyTolerances>;
  /** How many re-uploads `dedupePeriods` superseded. */
  supersededUploads: number;
  /** A full year's slot count for this cadence. See `BuildEmployeeKpisOptions`. */
  slotsPerYear: number;
}

export function buildEmployeeFile(opts: BuildEmployeeFileOptions): EmployeeFileResult {
  const {
    externalId,
    expected,
    periods,
    cadence,
    currency,
    rows,
    savedCategories,
    tolerances,
    supersededUploads,
    slotsPerYear,
  } = opts;

  // Per block, so a KWD block keeps three decimals and a JPY block none. Every
  // "is this zero" and "did this change" test downstream uses q, never 0.01.
  const decimals = minorUnits(currency);

  // Rows outside the selected scope are **named, not merged**. There is no
  // combined figure anywhere — no FX, no "equivalent" — and `assignSlot` run
  // with the wrong cadence collapses two semi-monthly slots into one month, so
  // merging cadences would misplace every period rather than merely mislabel
  // the total.
  const inScope = rows.filter((row) => row.currency === currency);
  const otherCurrencies = [
    ...new Set(rows.filter((row) => row.currency !== currency).map((row) => row.currency)),
  ].sort();
  const otherCadences = [
    ...new Set(periods.filter((p) => p.periodType !== cadence).map((p) => p.periodType)),
  ].sort();

  const scopedPeriods = periods.filter(
    (period) => period.periodType === cadence && period.currency === currency,
  );

  const slots = buildEmployeeSlots({
    expected,
    periods: scopedPeriods,
    cadence,
    rows: inScope,
    resolve: resolveEmployeeCategory(savedCategories),
    ambiguityOf: ambiguityOfFor(savedCategories),
    decimals,
  });

  const presence = buildPresence({ slots, decimals });

  const { flags, tolerancesSource } = buildEmployeeFlags({
    externalId,
    slots,
    decimals,
    savedCategories,
    tolerances,
  });

  const changeLog = buildChangeLog({ slots, decimals });

  const kpis = buildEmployeeKpis({
    slots,
    expected,
    presence,
    flags,
    changeLog,
    decimals,
    supersededUploads,
    slotsPerYear,
  });

  const paid = paidSlots(slots);
  const latest = paid[paid.length - 1];

  return {
    externalId,
    latestName: presence.names[0] ?? null,
    priorNames: presence.names.slice(1),
    latestDepartment: latest?.department ?? null,
    cadence,
    currency,
    decimals,
    slots,
    presence,
    kpis,
    flags,
    changeLog,
    tieOuts: buildTieOuts(slots, scopedPeriods),
    tolerancesSource,
    otherCurrencies,
    otherCadences,
  };
}
