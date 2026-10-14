import type { ExpectedSlot } from "./types";

/**
 * Structured warnings (step 19, finding U2).
 *
 * Warnings used to be prefixed strings ("MISSING_PERIODS: Jun 2026") that the UI
 * re-split on ": " to render. That lost the code on screen — users saw a bare
 * "Jun 2026" with no title — and made every warning a `role="alert"`, so screen
 * readers interrupted once per line. Carrying the parts separately means the UI
 * never parses a warning string again.
 */

export type WarningCode =
  | "NO_DATA"
  | "MISSING_PERIODS"
  | "LOW_HISTORY"
  | "DUPLICATES_IGNORED"
  | "MIXED_CADENCE"
  | "MIXED_CURRENCY"
  | "RECONCILIATION_GAP"
  | "MIXED_SIGN"
  | "UNCATEGORISED";

export type WarningSeverity = "info" | "warning" | "critical";

/** What the UI should offer to do about it. */
export type WarningAction =
  | { type: "none" }
  | { type: "upload_period"; labels: string[] }
  | { type: "open_categoriser"; keys: string[] };

export interface AnnualWarning {
  code: WarningCode;
  severity: WarningSeverity;
  /** Short headline, already human-readable. */
  title: string;
  /** One sentence of explanation. */
  detail: string;
  /** The specific things involved — period labels, component keys. */
  items: string[];
  action: WarningAction;
}

export function noData(): AnnualWarning {
  return {
    code: "NO_DATA",
    severity: "info",
    title: "No payroll uploaded",
    detail: "No ready payroll periods were found for this year and cadence.",
    items: [],
    action: { type: "none" },
  };
}

export function missingPeriods(slots: readonly ExpectedSlot[]): AnnualWarning {
  const labels = slots.map((s) => s.label);
  return {
    code: "MISSING_PERIODS",
    severity: "warning",
    title: labels.length === 1 ? "1 period not uploaded" : `${labels.length} periods not uploaded`,
    detail:
      "These periods fall before the latest upload, so the year has gaps. Totals below estimate them.",
    items: labels,
    action: { type: "upload_period", labels },
  };
}

export function lowHistory(count: number): AnnualWarning {
  return {
    code: "LOW_HISTORY",
    severity: "info",
    title: "Not much history yet",
    detail: `The forecast is based on ${count} ${count === 1 ? "period" : "periods"}, so it will move a lot as more payroll is uploaded.`,
    items: [],
    action: { type: "none" },
  };
}

export function duplicatesIgnored(count: number): AnnualWarning {
  return {
    code: "DUPLICATES_IGNORED",
    severity: "info",
    title: count === 1 ? "1 superseded upload ignored" : `${count} superseded uploads ignored`,
    detail: "A period was uploaded more than once; only the most recent upload is counted.",
    items: [],
    action: { type: "none" },
  };
}

export function mixedCadence(cadences: readonly string[]): AnnualWarning {
  return {
    code: "MIXED_CADENCE",
    severity: "warning",
    title: "More than one pay cadence",
    detail: "This year contains more than one pay cadence. Only the selected one is shown.",
    items: [...cadences],
    action: { type: "none" },
  };
}

export function mixedCurrency(currencies: readonly string[]): AnnualWarning {
  return {
    code: "MIXED_CURRENCY",
    severity: "warning",
    title: "More than one currency",
    detail: "This year contains more than one currency. Only the selected one is shown; totals are not converted.",
    items: [...currencies],
    action: { type: "none" },
  };
}

/** Raised for either balancing line: unreconciled deductions, or an earnings gap. */
export function reconciliationGap(
  line: "unreconciled_deductions" | "other_earnings_balance",
  amount: number,
  pctOfGross: number | null,
): AnnualWarning {
  const isEarnings = line === "other_earnings_balance";
  return {
    code: "RECONCILIATION_GAP",
    severity: "warning",
    title: isEarnings ? "Earnings do not add up to gross" : "Deductions do not add up to net",
    detail: isEarnings
      ? "Mapped earnings components are less than gross pay, so the difference is carried as an earnings balance."
      : "Gross minus net is larger than the mapped employee deductions, so the difference is carried as an unreconciled balance.",
    items: [
      pctOfGross !== null
        ? `${amount.toFixed(2)} (${pctOfGross.toFixed(1)}% of gross)`
        : amount.toFixed(2),
    ],
    action: { type: "open_categoriser", keys: [] },
  };
}

export function mixedSign(keys: readonly string[]): AnnualWarning {
  return {
    code: "MIXED_SIGN",
    severity: "warning",
    title: keys.length === 1 ? "1 component has mixed signs" : `${keys.length} components have mixed signs`,
    detail:
      "These deduction or employer-cost components appear both positive and negative in the same year, so their totals may be wrong.",
    items: [...keys],
    action: { type: "open_categoriser", keys: [...keys] },
  };
}

export function uncategorised(keys: readonly string[]): AnnualWarning {
  return {
    code: "UNCATEGORISED",
    severity: "warning",
    title: keys.length === 1 ? "1 component not categorised" : `${keys.length} components not categorised`,
    detail: "These components are not in any category, so they are missing from the breakdowns below.",
    items: [...keys],
    action: { type: "open_categoriser", keys: [...keys] },
  };
}
