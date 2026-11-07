import type {
  Category,
  ComponentAggregate,
  ExpectedSlot,
  PeriodType,
} from "../annual/types";

/**
 * The Employee File's domain types (step C1 of docs/EMPLOYEE_FILE_PLAN.md).
 *
 * Everything here is a function of its inputs. No DB, no network, no framework,
 * and `noUncheckedIndexedAccess` applies — so every lookup table in this folder
 * is a closed key union rather than `Record<string, T>`, and `rows[i]` is
 * hoisted before it is narrowed.
 */

/**
 * Per-employee-slot kind — four values, and deliberately **not** the annual
 * engine's `PeriodKind` (`actual | estimated | forecast | missing`).
 *
 * The two sets look alike and mean different things. There is no `estimated`
 * here because estimating one person's missing month is inventing a payment to
 * an individual, which section 10 of the spec forbids outright; and no
 * `forecast` because the file forecasts nothing. A shared type would invite
 * exactly that substitution.
 *
 *   actual     the slot is covered and the employee has exactly one row in
 *              every period on it — the value
 *   duplicate  some period on this slot has more than one row for them — the
 *              sum, flagged, excluded from every rate and average
 *   not_paid   the slot is covered and they have no row — an explicit fact
 *   missing    the slot is in R but nothing was uploaded for it — unknown.
 *              Never 0, never dropped from the slot list
 */
export type EmployeeSlotKind = "actual" | "duplicate" | "not_paid" | "missing";

/** The paid kinds: the slots that make up P(e). */
export const PAID_SLOT_KINDS: readonly EmployeeSlotKind[] = ["actual", "duplicate"];

/** One `employee_snapshots` row, with money already converted at the boundary. */
export interface EmployeeSnapshotRow {
  /** The snapshot's own id, so two rows in one period stay distinguishable. */
  id: string;
  payrollPeriodId: string;
  employeeExternalId: string;
  employeeName: string;
  department: string | null;
  /** The register's own Gross column. Never recomputed from components (R1). */
  gross: number;
  /** The register's own Net column. */
  net: number;
  currency: string;
  /**
   * Register column name -> value. A blank cell is **absent or null**, never 0:
   * `processUpload` writes `Number(val) || 0` for a present cell and `null` for
   * an absent one, so coalescing null to 0 would read a blank cell as a removed
   * component and make "received overtime" true for everyone (spec 7.14).
   */
  components: Readonly<Record<string, number | null>>;
  /** YYYY-MM-DD, kept verbatim. Null unless the company mapped a column. */
  hireDate: string | null;
  terminationDate: string | null;
  /** May legitimately exceed 1: some registers express overtime as FTE. */
  fte: number | null;
  dimensions: Readonly<Record<string, string>>;
}

/** A ready, in-scope `payroll_periods` row, as the engine needs it. */
export interface EmployeePeriodInput {
  id: string;
  periodType: PeriodType;
  currency: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  /** `payroll_periods.total_gross` / `total_net`, for the R3 tie-out. */
  totalGross?: number | null;
  totalNet?: number | null;
  /** What the admin asserted the register printed, for R5. */
  controlTotalGross?: number | null;
  controlTotalNet?: number | null;
}

/** One upload merged onto a slot, so the UI can say "2 runs merged". */
export interface EmployeeSlotRun {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  /** Rows this employee has in **this** period. More than one is a duplicate. */
  rowCount: number;
  gross: number;
  net: number;
}

/**
 * One row per slot in R, in calendar order. Never only the slots with data.
 */
export interface EmployeeSlotRow {
  slot: ExpectedSlot;
  kind: EmployeeSlotKind;
  /** Snapshot rows across every period on this slot. */
  rowCount: number;
  /**
   * `null` for `missing` and `not_paid` — the two render blank, with different
   * reasons on hover. Making them nullable rather than 0 is what stops a gap
   * being plotted or averaged as a zero; `kind` says which reason applies.
   */
  gross: number | null;
  net: number | null;
  byCategory: Partial<Record<Category, number>>;
  quantities: Partial<Record<"absence_days" | "other_quantity", number>>;
  byKey: Record<string, { category: Category; total: number }>;
  /** Per-key totals as the register names them, for the component matrix. */
  components: ComponentAggregate[];
  /** Mapped earnings, E(e,p). */
  earnings: number;
  /** Mapped employee deductions, D(e,p), as a magnitude. */
  deductions: number;
  /** Mapped employer costs, W(e,p), as a magnitude. */
  employerCosts: number;
  /** gross - E. The per-employee twin of `other_earnings_balance`. */
  earnBal: number;
  /** gross - net - D. The per-employee twin of `balance`. */
  netBal: number;
  /** base_salary + allowance. */
  recurring: number;
  /** bonus_commission + overtime + other_earning. */
  variable: number;
  mixedSignKeys: string[];
  uncategorisedKeys: string[];
  /** This slot's own department. Money is attributed here, not to the latest. */
  department: string | null;
  name: string | null;
  fte: number | null;
  hireDate: string | null;
  terminationDate: string | null;
  dimensions: Readonly<Record<string, string>>;
  /** How many uploaded periods merged onto this slot (1 = just the one). */
  mergedRunCount: number;
  runs: EmployeeSlotRun[];
  /** Every raw row, so a duplicate slot can list them separately. */
  rows: EmployeeSnapshotRow[];
}

/** K3. Computed first; every other figure derives its denominator from it. */
export interface EmployeeCoverage {
  /** |P(e)| — slots where the employee has at least one row. */
  paid: number;
  /** |C| — slots with at least one upload. */
  covered: number;
  /** |R| — slots a full range should contain. */
  expected: number;
  /** |C| - |P(e)|. The absence is evidence, so these count in `covered`. */
  notPaid: number;
  /** |R| - |C|. Unknown, not zero. */
  notUploaded: number;
  /** Paid slots excluded from every rate and average. */
  duplicate: number;
  missingLabels: string[];
  notPaidLabels: string[];
  duplicateLabels: string[];
  /** Re-uploads superseded by `dedupePeriods`, for "1 superseded upload ignored". */
  supersededUploads: number;
}

/** A run of paid slots. Two or more spans means a rehire. */
export interface PresenceSpan {
  fromIndex: number;
  toIndex: number;
  fromLabel: string;
  toLabel: string;
  /** Paid slots in the span. */
  paidSlots: number;
}

export type EmployeeStatusKind =
  | "active"
  | "left"
  | "joined"
  | "rehired"
  | "not_paid_in_range";

export interface EmployeeStatus {
  kind: EmployeeStatusKind;
  /** The slot the status is derived from. Always named, never implied. */
  slotLabel: string | null;
  slotIndex: number | null;
  /**
   * Spec 7.12: the same id carrying a materially different name after a gap.
   * Detected and reported, never resolved — a recycled staff number is a
   * different person, and merging their year is worse than splitting it.
   */
  idMayBeReused: boolean;
  /**
   * Spec 7.4. Needs the company's roster, not one employee's rows, so this is
   * set by a caller that has run `detectIdChangeCandidates`. Never inferred
   * from one employee's data.
   */
  idMayHaveChanged: boolean;
}

export interface PresenceResult {
  spans: PresenceSpan[];
  status: EmployeeStatus;
  /** Spec 7.6. Excluded from K5-K8 and from any "largest increase" ranking. */
  finalSettlementIndex: number | null;
  /** The one-off components on that slot, itemised rather than summarised. */
  finalSettlementKeys: string[];
  /**
   * Spec 7.7. "possibly prorated", never "prorated": proration cannot be
   * proven without a working-day calendar, which Clarivo does not have.
   */
  possiblyProratedIndex: number | null;
  /** Months of service. Null whenever it cannot be stated honestly. */
  tenureMonths: number | null;
  tenureSuppressed: "not_mapped" | "spans_gap" | null;
  /** Every distinct hire date seen, so two spells show both rather than one. */
  hireDates: string[];
  /** Every name the id has carried in range, newest first. */
  names: string[];
}

export type ChangeLogKind =
  | "base_rate"
  | "allowance"
  | "component_added"
  | "component_removed"
  | "department"
  | "dimension"
  | "name"
  | "fte"
  | "currency"
  | "cadence"
  | "first_appearance"
  | "last_appearance";

/**
 * Derived, never stored. Every entry states **what moved**, never why: Clarivo
 * holds no reason codes, so "promotion", "merit review" and "cost-of-living
 * adjustment" are not in this vocabulary at all.
 */
export interface ChangeLogEntry {
  kind: ChangeLogKind;
  fromSlot: string | null;
  toSlot: string;
  fromIndex: number | null;
  toIndex: number;
  /** The component or dimension key the entry is about, when it is about one. */
  key: string | null;
  previous: number | string | null;
  current: number | string | null;
  absolute: number | null;
  percentage: number | null;
  /** True when a `missing` slot lies between the two covered slots. */
  spansGap: boolean;
  /** The skipped slot labels, for "between Mar and May (Apr not uploaded)". */
  gapLabels: string[];
}

export type EmployeeFlagSeverity = "info" | "warning" | "critical";
export type EmployeeFlagSource = "reconciliation" | "anomaly";

export interface EmployeeFlag {
  type: string;
  severity: EmployeeFlagSeverity;
  description: string;
  source: EmployeeFlagSource;
  slotLabel: string | null;
  slotIndex: number | null;
  /** What the components imply. Reconciliation breaches only. */
  expected: number | null;
  /** What the register's own column says. */
  actual: number | null;
  /** `actual - expected`, at the currency's minor unit. */
  difference: number | null;
  /** A pairwise flag computed across a `missing` slot. */
  spansGap: boolean;
}

/**
 * Why a KPI is not shown.
 *
 * Suppression is part of the return type, not a UI convention. Section 6.3 of
 * the spec lists nine KPIs that mislead and the presentation each requires; if
 * `averageGrossPerPaidPeriod` returned `number`, a component could print it
 * with no window label and nothing would fail.
 *
 * `fte_not_mapped` and `peers_below_five` are reserved for K19 and K20, which
 * are deferred: they are in the union now so the UI has one renderable reason
 * set rather than one that grows.
 */
export type KpiSuppression =
  | "no_paid_slots"
  | "insufficient_history"
  | "duplicate_slots_excluded"
  | "no_clean_slot"
  | "employer_costs_not_mapped"
  | "uncategorised_non_zero"
  | "fte_not_mapped"
  | "peers_below_five"
  | "spans_gap"
  | "quantity_not_mapped";

export type Kpi<T> = { ok: true; value: T } | { ok: false; reason: KpiSuppression };

export function kpi<T>(value: T): Kpi<T> {
  return { ok: true, value };
}

export function suppressed<T>(reason: KpiSuppression): Kpi<T> {
  return { ok: false, reason };
}

/**
 * Why a paid slot is not comparable with its neighbours (spec 7.3, 7.6, 7.7).
 *
 * The one set K5-K8 exclude. It is a named type rather than three booleans so
 * the mean's denominator and the labels printed beside it are derived from the
 * same thing — they were computed separately once, and disagreed.
 */
export type SlotExclusionReason = "duplicate" | "final_settlement" | "possibly_prorated";

/** K5: the mean, and the slots it had to leave out. */
export interface AverageGross {
  mean: number;
  /**
   * The denominator actually used: |P(e)| minus every slot in `excludedLabels`
   * — duplicates **and** the final settlement and possibly prorated slots.
   */
  periods: number;
  excludedLabels: string[];
}

/** K6: a value that is only meaningful with the slot it came from. */
export interface AtSlot {
  value: number;
  slotLabel: string;
  slotIndex: number;
}

/** K7: the base rate per slot, and the movements in it. */
export interface BaseRateHistory {
  perSlot: {
    slotLabel: string;
    slotIndex: number;
    total: number;
    /**
     * Null when the slot is comparable. Otherwise why it is not: the slot stays
     * in the history, because the history's job is "what was the base before
     * July" and dropping the final month answers that question wrongly, but
     * nothing may read a run rate or an "largest increase" ranking off a marked
     * entry (§7.6, §7.7).
     */
    excluded: SlotExclusionReason | null;
  }[];
  changes: ChangeLogEntry[];
}

/** K8: annualised, never paid. */
export interface AnnualisedRecurring {
  value: number;
  slotsPerYear: number;
  fromSlotLabel: string;
}

/** K9 and any other ratio that is meaningless over too short a window. */
export interface Ratio {
  value: number;
  /** Always printed, e.g. "over 9 paid periods". */
  paidPeriods: number;
}

/** K11: counts under their own register names, inferring nothing. */
export interface AbsenceKpi {
  money: number;
  shareOfGross: number;
  /** Quantity components as the register names them. Never read as days. */
  quantities: { key: string; category: Category; total: number }[];
}

export interface EmployerCostKpi {
  total: number;
  /** How many components in range classify to an employer category. */
  componentCount: number;
}

export interface ExceptionCounts {
  critical: number;
  warning: number;
  info: number;
}

export interface GrossToNetBridge {
  gross: number;
  net: number;
  deductions: number;
  netBal: number;
  earnings: number;
  earnBal: number;
  /** Both identities hold to the currency's minor unit. */
  balanced: boolean;
}

export interface EmployeeKpis {
  /** K3. Never suppressed: it is the figure that says whether the rest can be
   * trusted, so there is no state in which withholding it is more honest. */
  coverage: EmployeeCoverage;
  /** K1 */
  grossInRange: Kpi<number>;
  /** K2 */
  netInRange: Kpi<number>;
  /** K4 */
  bridge: Kpi<GrossToNetBridge>;
  /** K5 */
  averageGrossPerPaidPeriod: Kpi<AverageGross>;
  /** K6 */
  recurringLatest: Kpi<AtSlot>;
  /** K7 */
  baseRate: Kpi<BaseRateHistory>;
  /** K8 */
  annualisedRecurring: Kpi<AnnualisedRecurring>;
  /** K9 */
  variableShare: Kpi<Ratio>;
  /** K10 */
  overtime: Kpi<{ amount: number; intensity: number | null }>;
  /** K11 */
  absence: Kpi<AbsenceKpi>;
  /** K12 — observed, this employee, this range. Never a statutory rate. */
  deductionRate: Kpi<Ratio>;
  incomeTaxRatio: Kpi<Ratio>;
  /** K13 */
  totalEmploymentCost: Kpi<EmployerCostKpi>;
  /** K14 */
  employerOnCostRate: Kpi<Ratio>;
  /** K15 */
  exceptions: Kpi<ExceptionCounts>;
  /** K16 */
  lastPaidSlot: Kpi<AtSlot>;
  status: EmployeeStatus;
}

/** The R3/R5/R6 tie-outs, reported rather than reconciled away. */
export interface EmployeeTieOuts {
  /**
   * R3, per paid slot: Σ over employees of gross should equal
   * `payroll_periods.total_gross`. This employee's own share cannot prove it,
   * so what is carried is the period total beside the employee's figure and the
   * cause when the two cannot agree.
   */
  perSlot: {
    slotLabel: string;
    slotIndex: number;
    employeeGross: number;
    periodTotalGross: number | null;
    /** Spec 7.3 / 7.1. Null when nothing makes them disagree. */
    cause: "duplicate_rows" | "merged_runs" | null;
  }[];
  /** R5: `not supplied` is a third answer, never "agreed". */
  controlTotals: {
    slotLabel: string;
    grossSupplied: boolean;
    netSupplied: boolean;
  }[];
  /**
   * R6: `period_component_totals` applies `DISTINCT ON (employee_external_id)`
   * while this feature sums every row, so with duplicates present the two
   * differ by the dropped rows. The Employee File is authoritative for the
   * register tie-out; the gap is displayed, not reconciled away.
   */
  aggregateGapCause: "duplicate_rows" | null;
}

/** The whole assembled file, for one `(cadence, currency)` scope. */
export interface EmployeeFileResult {
  externalId: string;
  /** Latest in range, by period end then created_at. Null when never paid. */
  latestName: string | null;
  /** Every earlier name the id carried in range. Searchable, and in the log. */
  priorNames: string[];
  latestDepartment: string | null;
  cadence: PeriodType;
  currency: string;
  decimals: number;
  slots: EmployeeSlotRow[];
  presence: PresenceResult;
  kpis: EmployeeKpis;
  flags: EmployeeFlag[];
  changeLog: ChangeLogEntry[];
  tieOuts: EmployeeTieOuts;
  /** The tolerances the anomaly flags used, and whether they were the company's. */
  tolerancesSource: "company" | "default";
  /**
   * Other scopes this employee has rows in, outside the selected one.
   *
   * Named rather than merged. There is no combined figure anywhere — no FX, no
   * "equivalent" — because `assignSlot` run with the wrong cadence collapses
   * two semi-monthly slots into one month, and adding two currencies is wrong
   * however it is labelled. The UI offers them as separate scopes.
   */
  otherCurrencies: string[];
  otherCadences: PeriodType[];
}
