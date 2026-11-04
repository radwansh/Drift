import type {
  ChangeLogKind,
  EmployeeCoverage,
  EmployeeSlotKind,
  EmployeeStatus,
  KpiSuppression,
} from "@saas/payroll-core";
import { formatMoney, formatRatio } from "@/components/annual/annual-utils";

/**
 * Every sentence the Employee File states rather than implies (steps E2-E6).
 *
 * In plain `.ts` so it is testable and so one wording has one home. Most of
 * these exist because the honest version is longer than the convenient one: a
 * coverage line instead of an "all clear" badge, a named suppression reason
 * instead of a zero, and the duplicate-row ambiguity written out instead of a
 * total presented as a fact.
 */

/** The four kinds as a visible badge. */
export const SLOT_KIND_LABELS: Record<EmployeeSlotKind, string> = {
  actual: "Actual",
  duplicate: "Duplicate rows",
  not_paid: "Not paid",
  missing: "Not uploaded",
};

/**
 * Why a slot has no figure — and the two reasons are different facts.
 *
 * `missing` is unknown: nobody uploaded the period. `not_paid` is known: the
 * period is here and this person is not in it. Rendering both as a blank with
 * one tooltip would collapse "we do not know" into "they got nothing", which is
 * the distinction the whole four-value `kind` exists to keep.
 */
export function slotKindReason(kind: EmployeeSlotKind, rowCount = 0): string | null {
  switch (kind) {
    case "missing":
      return "No payroll was uploaded for this period, so this figure is unknown — not zero.";
    case "not_paid":
      return "This period was uploaded and this employee has no row in it: they were not paid.";
    case "duplicate":
      return duplicateSlotNote(rowCount);
    case "actual":
      return null;
  }
}

/**
 * Spec 7.3's wording for the two-row case, plus when such a row can arrive.
 *
 * The ambiguity is stated rather than implied because both readings are
 * live: the sum is what ties to the register, and if the extra row is a
 * duplicated export then the register itself is overstated. Nothing in the
 * data can tell those apart, so the screen must not pick one.
 *
 * The last clause is the one an admin needs in order to act. A repeated
 * external id is an `error` in `upload/validate.ts` and
 * `payroll-periods.ts` throws on it before `processUpload` runs, so these rows
 * can only predate that gate — and without saying so the note reads as "this
 * will happen again on the next upload", which would send somebody to fix a
 * check that is already there.
 */
export function duplicateSlotNote(rowCount: number): string {
  const tail =
    rowCount > 2
      ? "If any of them is a duplicated export, both this figure and the period total are overstated."
      : "If the second row is a duplicated export, both this figure and the period total are overstated.";
  return `${rowCount} rows for this employee in this period. The total shown is the sum, which matches the register. ${tail} Rows like these predate the duplicate-id check: an upload with a repeated external id is refused today, so a new file cannot add more.`;
}

/**
 * Coverage, stated once at the top of the file (spec 5.2.5).
 *
 * This is the honest replacement for a "no anomalies — all clear" badge: on a
 * file where half the slots were never uploaded, "all clear" is false.
 */
export function coverageSentence(coverage: EmployeeCoverage): string {
  const parts = [
    `${coverage.covered} of ${coverage.expected} periods uploaded`,
    `${coverage.paid} paid`,
  ];
  if (coverage.notPaid > 0) parts.push(`${coverage.notPaid} not paid`);
  if (coverage.duplicate > 0) {
    parts.push(
      `${coverage.duplicate} with duplicate rows, excluded from every average`,
    );
  }
  if (coverage.notUploaded > 0) {
    const named =
      coverage.missingLabels.length > 0 ? ` (${coverage.missingLabels.join(", ")})` : "";
    parts.push(`${coverage.notUploaded} not uploaded${named}`);
  }
  if (coverage.supersededUploads > 0) {
    parts.push(
      `${coverage.supersededUploads} superseded ${
        coverage.supersededUploads === 1 ? "upload" : "uploads"
      } ignored`,
    );
  }
  return parts.join(" · ");
}

/**
 * Why a KPI is not shown.
 *
 * A closed `Record` over the union, so adding a reason to `KpiSuppression`
 * fails typecheck here rather than rendering an empty card. `fte_not_mapped`
 * and `peers_below_five` are reserved for the deferred K19 and K20 and nothing
 * produces them yet; they are present so the reason set does not grow later.
 */
export const KPI_SUPPRESSION_LABELS: Record<KpiSuppression, string> = {
  no_paid_slots: "Not paid in this range",
  insufficient_history: "Needs at least three paid periods",
  duplicate_slots_excluded: "Every paid period in range has duplicate rows",
  no_clean_slot: "No period here is free of a one-off, a part period or duplicate rows",
  employer_costs_not_mapped: "Employer costs not mapped",
  uncategorised_non_zero: "Uncategorised pay in range, so a rate would understate it",
  fte_not_mapped: "FTE not mapped — part-timers are not comparable",
  peers_below_five: "Fewer than five peers to compare against",
  spans_gap: "The window spans a period nobody uploaded",
  quantity_not_mapped: "No quantity column is mapped",
};

/**
 * What each change-log kind's numbers **are**, so one is never printed as the
 * other.
 *
 * The change log ran `formatMoney` over every numeric value, and `fte` entries
 * carry ratios (`employee/changelog.ts`), so a part-time conversion printed as
 * `USD 1.00 → USD 0.50 (USD -0.50, -50.0%)`.
 *
 * A closed `Record` over the union rather than a list of kinds to skip: adding
 * a kind to `ChangeLogKind` fails typecheck here instead of silently defaulting
 * to money. It lives in this file rather than in the component because
 * `apps/web/tsconfig.json` sets `jsx: "preserve"`, so a vitest module cannot
 * import anything from a `.tsx` — and a money-versus-ratio decision that no
 * test can reach is how this one shipped.
 */
export const CHANGE_LOG_VALUE_SHAPE: Record<ChangeLogKind, "money" | "ratio" | "text"> = {
  base_rate: "money",
  allowance: "money",
  component_added: "money",
  component_removed: "money",
  department: "text",
  dimension: "text",
  name: "text",
  fte: "ratio",
  currency: "text",
  cadence: "text",
  first_appearance: "text",
  last_appearance: "text",
};

/** One side of a change-log entry, formatted for what that kind holds. */
export function describeChangeLogValue(
  value: number | string | null,
  kind: ChangeLogKind,
  currency: string,
): string {
  if (value === null) return "not present";
  if (typeof value !== "number") return value;
  return CHANGE_LOG_VALUE_SHAPE[kind] === "ratio"
    ? formatRatio(value)
    : formatMoney(value, currency);
}

/**
 * The scope label a figure in this range carries.
 *
 * Every figure on the file gets one, because a figure without a scope is what
 * made "Total Employer Cost" read as an actual when it was a full-year
 * forecast. Nothing here is ever `full_year_forecast`: the Employee File
 * forecasts nothing, and a future slot is `missing` rather than an estimate.
 */
export function scopeForRange(
  range: "ytd" | "full_year" | "previous_year" | "slot",
): "to_date" | "full_year_actual" {
  return range === "full_year" || range === "previous_year" ? "full_year_actual" : "to_date";
}

/** The file's employment status, always naming the slot it came from. */
export function statusSentence(status: EmployeeStatus): string {
  const slot = status.slotLabel;
  switch (status.kind) {
    case "active":
      return slot ? `Active · paid ${slot}` : "Active";
    case "left":
      return slot ? `Left ${slot}` : "Left";
    case "joined":
      return slot ? `Joined ${slot}` : "Joined";
    case "rehired":
      return slot ? `Rehired · paid ${slot}` : "Rehired";
    case "not_paid_in_range":
      return "Not paid in this range";
  }
}

/**
 * What a scope filter dropped.
 *
 * "A filter that drops rows without saying how many is how a payroll total gets
 * signed off short", so the count is a sentence rather than an absence.
 */
export function excludedByScopeSentence(excluded: number, rangeLabel: string): string | null {
  if (excluded <= 0) return null;
  return `${excluded} ${excluded === 1 ? "person" : "people"} paid in ${rangeLabel} ${
    excluded === 1 ? "is" : "are"
  } not currently employed. Switch to Paid in range to see them.`;
}

/**
 * When "currently employed" cannot be answered from the selected range.
 *
 * The predicate reads the latest covered slot's roster, so a range that stops
 * before that slot — one period in the middle of the year, a previous year —
 * cannot tell a leaver from anybody else. Said plainly, because the alternative
 * is a list that silently reports the entire company as having left.
 */
export const CURRENTLY_EMPLOYED_UNKNOWN_NOTICE =
  "Whether these people are still employed cannot be told from this range: the latest uploaded period is outside it. Switch to Full year or Year to date to use that scope.";

/**
 * Said once under the list title.
 *
 * Clarivo stores no reporting line, so "manager" cannot mean "my team" — and
 * the role name implies a scoping that does not exist. One sentence is cheaper
 * than a support ticket, and the access log is what makes the access
 * defensible rather than the wording.
 */
export const COMPANY_WIDE_NOTICE =
  "A manager sees every employee in the company: Clarivo holds no reporting line, so this list is company-wide. Every read is logged.";

/** The department filter's rule, stated in the UI or transfers are hidden. */
export const DEPARTMENT_RULE_NOTICE =
  "Matches if the employee was in that department in any slot in range.";

/** Why the file's gross and the dashboard's can differ, on purpose (R6). */
export const AGGREGATE_GAP_NOTICE =
  "This file sums every row, which is what ties to the register. The annual dashboard keeps one row per employee per period, so where duplicate rows exist the two differ by the value of the dropped rows. This figure is the one to reconcile against the register.";

export function tieOutCauseLabel(cause: "duplicate_rows" | "merged_runs" | null): string | null {
  switch (cause) {
    case "duplicate_rows":
      return "Duplicate rows for this employee in this period";
    case "merged_runs":
      return "More than one payroll run merged onto this slot";
    case null:
      return null;
  }
}
