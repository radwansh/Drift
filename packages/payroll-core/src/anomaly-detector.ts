import type { EmployeeRecord, ComparisonOutput } from "./types";
import { smallestUnit, DEFAULT_MINOR_UNITS } from "./money";
import { classifyComponent } from "./annual/classify";

/**
 * Per-employee exceptions a payroll manager would act on.
 *
 * Step 5 of docs/PAYROLL_AUDIT_FIX_PLAN.md replaced what was here. The old set
 * was three rules, and measured across the twelve `samples/2025` registers it
 * produced **3,166 flags, none critical, 100% of them the same rule**: any
 * component equal to zero, raised twice per employee. On a 150-person month
 * where nobody worked overtime that is 300 flags saying nothing.
 *
 * Meanwhile a 40% base-salary rise — the single most important per-employee
 * event on a pay run — fired nothing at all, and the "large net change" rule
 * divided by the sum of components rather than by net and required that *no*
 * component had changed, so any real driver disqualified it.
 *
 * What replaced it is an exception list: things that are either arithmetically
 * impossible or worth a human looking at, with severity that discriminates.
 * Nothing was ever `critical` before.
 *
 * The vocabulary from `annual/classify.ts` is reused rather than duplicated —
 * one synonym table for both halves of the product, so a register whose base
 * salary column is `Rateb Asasi` gets the same treatment here as it does in
 * the annual engine.
 */

export interface AnomalyFlag {
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

export interface AnomalyResult {
  employeeId: string;
  employeeName: string;
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

/**
 * Per-company thresholds. Payroll varies too much between companies for one
 * set of numbers to be right: a 10% base movement is routine where pay is
 * largely variable and remarkable where it is not.
 *
 * These live in `companies.settings`, which is jsonb, so no migration.
 */
export interface AnomalyTolerances {
  /** Net movement, as a percentage of the employee's own previous net. */
  netChangePct: number;
  /** Base-salary movement, as a percentage of their own previous base. */
  baseChangePct: number;
  /**
   * A movement below this absolute amount never flags, whatever the
   * percentage. Zero by default — a floor is useful but its right value is
   * currency- and company-specific, so it is opted into rather than guessed.
   */
  minAbsolute: number;
}

export const DEFAULT_TOLERANCES: AnomalyTolerances = {
  // 20% keeps the threshold the old net rule intended, now measured against
  // net rather than against the sum of components.
  netChangePct: 20,
  baseChangePct: 10,
  minAbsolute: 0,
};

export interface AnomalyOptions {
  tolerances?: Partial<AnomalyTolerances>;
  /** Currency minor units, for "is this a real movement at all" (step 8a). */
  decimals?: number;
}

export function detectAnomalies(
  current: EmployeeRecord | null,
  previous: EmployeeRecord | null,
  comparisonOutput: ComparisonOutput,
  opts: AnomalyOptions = {},
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const tol = { ...DEFAULT_TOLERANCES, ...opts.tolerances };
  const decimals = opts.decimals ?? DEFAULT_MINOR_UNITS;
  const quantum = smallestUnit(decimals);

  // Impossible values are checked on the current period alone, so they are
  // caught for a joiner too — a new employee with net above gross is the same
  // defect as a continuing one, and the old guard returned early for both.
  checkImpossibleValues(flags, comparisonOutput, quantum);

  if (!current || !previous) {
    return flags;
  }

  checkNetChange(flags, comparisonOutput, tol, quantum);
  checkBaseRateChange(flags, comparisonOutput, tol, quantum);
  checkNewComponentWithValue(flags, comparisonOutput, quantum);
  checkEmployerContributionMissing(flags, comparisonOutput, quantum);

  return flags;
}

export function collectAnomalies(results: ComparisonOutput[]): AnomalyResult[] {
  const all: AnomalyResult[] = [];
  for (const r of results) {
    if (r.anomalyFlags) {
      for (const flag of r.anomalyFlags) {
        all.push({
          employeeId: r.employeeExternalId,
          employeeName: r.employeeName,
          ...flag,
        });
      }
    }
  }
  return all;
}

/**
 * Arithmetic that cannot be right, whatever the payroll system intended.
 *
 * Both were undetected. The audit found a fixture where net was 7,000 on a
 * gross of 5,000 and another where net was negative, and the only flags raised
 * said "Net changed by 45.5% but no individual component changed" — true about
 * the data, and a completely wrong diagnosis.
 */
function checkImpossibleValues(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
  quantum: number,
): void {
  const { currentNet, currentGross } = comp;

  if (currentNet !== null && currentNet < -quantum) {
    flags.push({
      type: "negative_net",
      severity: "critical",
      description: `Net pay is negative (${currentNet}). An employee cannot be paid less than nothing.`,
    });
  }

  if (currentNet !== null && currentGross !== null && currentNet - currentGross > quantum) {
    flags.push({
      type: "net_exceeds_gross",
      severity: "critical",
      description:
        `Net pay (${currentNet}) is above gross (${currentGross}). ` +
        "Deductions cannot be negative in total, so either a column is mapped to the wrong " +
        "side or the register is wrong.",
    });
  }
}

/**
 * Net moved beyond tolerance, **naming the driver**.
 *
 * The rule this replaces only fired when no component had changed, which is
 * the one case where there is nothing to name. Measured, it meant a real
 * +24.0% net movement with a visible cause stayed silent, and the flag that
 * did fire was the least useful version of itself.
 */
function checkNetChange(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
  tol: AnomalyTolerances,
  quantum: number,
): void {
  const { netDelta, previousNet } = comp;
  if (netDelta === null || previousNet === null || previousNet === 0) return;
  if (Math.abs(netDelta) < Math.max(quantum, tol.minAbsolute)) return;

  const pct = (Math.abs(netDelta) / Math.abs(previousNet)) * 100;
  if (pct < tol.netChangePct) return;

  const driver = largestDriver(comp);
  const direction = netDelta > 0 ? "rose" : "fell";

  flags.push({
    type: "net_change_beyond_tolerance",
    severity: "warning",
    description: driver
      ? `Net ${direction} ${pct.toFixed(1)}%, mostly from "${driver.component}" (${driver.absoluteDiff! > 0 ? "+" : ""}${driver.absoluteDiff}).`
      : `Net ${direction} ${pct.toFixed(1)}% with no component movement to explain it. ` +
        "Gross or net disagrees with the mapped columns.",
  });
}

/**
 * A change to what someone is paid per period, which is the control a payroll
 * manager actually runs. There was no rule for it: a 40% base rise with
 * nothing else changed produced no flag of any kind.
 */
function checkBaseRateChange(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
  tol: AnomalyTolerances,
  quantum: number,
): void {
  const previousBase = sumBase(comp.previousComponents);
  const currentBase = sumBase(comp.currentComponents);
  if (previousBase === 0) return;

  const delta = currentBase - previousBase;
  if (Math.abs(delta) < Math.max(quantum, tol.minAbsolute)) return;

  const pct = (Math.abs(delta) / Math.abs(previousBase)) * 100;
  if (pct < tol.baseChangePct) return;

  flags.push({
    type: "base_rate_change",
    severity: "warning",
    description:
      `Base pay ${delta > 0 ? "rose" : "fell"} ${pct.toFixed(1)}%, ` +
      `from ${previousBase} to ${currentBase}.`,
  });
}

/**
 * A component appearing for the first time *with a value*.
 *
 * The old rule flagged a new key whatever it held, and separately flagged
 * every zero-valued component, so a register that simply listed a column it
 * had not used before produced two flags and a register where nobody worked
 * overtime produced one per employee. A new key holding nothing is not an
 * event.
 */
function checkNewComponentWithValue(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
  quantum: number,
): void {
  const previousKeys = new Set(Object.keys(comp.previousComponents));
  const currentKeys = new Set(Object.keys(comp.currentComponents));

  for (const [key, value] of Object.entries(comp.currentComponents)) {
    if (previousKeys.has(key)) continue;
    if (value === null || Math.abs(value) < quantum) continue;
    flags.push({
      type: "new_component_with_value",
      severity: "info",
      description: `"${key}" appears for the first time, at ${value}.`,
    });
  }

  // Kept, and symmetric. The plan's rule list does not mention removal, but a
  // paid component disappearing is the same class of event as one appearing —
  // an allowance that stopped is worth a line. The noise this step removed
  // came from the zero-value rule, not from add and remove, so dropping this
  // would have been a silent loss of signal rather than a reduction in it.
  for (const [key, value] of Object.entries(comp.previousComponents)) {
    if (currentKeys.has(key)) continue;
    if (value === null || Math.abs(value) < quantum) continue;
    flags.push({
      type: "component_removed_with_value",
      severity: "info",
      description: `"${key}" is no longer present; it was ${value}.`,
    });
  }
}

/**
 * An employee contribution with no employer counterpart.
 *
 * Statutory schemes are almost always paid by both sides, so an employee
 * deduction with nothing beside it usually means the employer column was not
 * mapped — which understates employer cost and the on-cost rate without
 * touching gross or net, so nothing else notices.
 */
function checkEmployerContributionMissing(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
  quantum: number,
): void {
  let employeeContribution = 0;
  let employerSeen = false;

  for (const [key, value] of Object.entries(comp.currentComponents)) {
    const category = classifyComponent(key);
    if (category === "social_security_employee" && value !== null) {
      employeeContribution += Math.abs(value);
    }
    if (category === "social_security_employer") employerSeen = true;
  }

  if (employeeContribution > quantum && !employerSeen) {
    flags.push({
      type: "employer_contribution_missing",
      severity: "warning",
      description:
        `Social security is deducted from the employee (${employeeContribution}) with no ` +
        "employer contribution beside it. The employer column may not be mapped.",
    });
  }
}

/** The component that moved most, for naming the cause of a net movement. */
function largestDriver(comp: ComparisonOutput) {
  let best: ComparisonOutput["componentDeltas"][number] | null = null;
  for (const d of comp.componentDeltas) {
    if (d.absoluteDiff === null) continue;
    if (!best || Math.abs(d.absoluteDiff) > Math.abs(best.absoluteDiff!)) best = d;
  }
  return best && best.absoluteDiff !== null && best.absoluteDiff !== 0 ? best : null;
}

/** Total of every component the vocabulary reads as base salary. */
function sumBase(components: Record<string, number | null>): number {
  let total = 0;
  for (const [key, value] of Object.entries(components)) {
    if (value === null) continue;
    if (classifyComponent(key) === "base_salary") total += value;
  }
  return total;
}
