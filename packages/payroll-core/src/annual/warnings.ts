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
  | "UNCATEGORISED"
  | "AMBIGUOUS_COMPONENT"
  | "FORECAST_HOLDS_HEADCOUNT";

export type WarningSeverity = "info" | "warning" | "critical";

/** What the UI should offer to do about it. */
export type WarningAction =
  | { type: "none" }
  | { type: "upload_period"; labels: string[] }
  | { type: "open_categoriser"; keys: string[] }
  /** Step 12a: the scenario view already prices a hiring plan. */
  | { type: "open_scenario" };

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

/**
 * A column the vocabulary declined to place, asked as a question (step 11).
 *
 * Separate from `uncategorised`, and a higher severity than it, because the
 * two mean different things to the person reading them. Uncategorised is
 * "nothing matched, tell us what this is". This is "we can see two readings
 * and they land in different reports, so we will not pick one for you" — and
 * unlike an unmatched column, the money here looks perfectly reconciled while
 * being absent from the report it belongs in.
 */
export function ambiguousComponents(
  entries: readonly { key: string; question: string }[],
): AnnualWarning {
  const keys = entries.map((e) => e.key);
  return {
    code: "AMBIGUOUS_COMPONENT",
    severity: "warning",
    title:
      entries.length === 1
        ? "1 component needs your decision"
        : `${entries.length} components need your decision`,
    detail:
      "These column names mean different things on different payroll systems, so Clarivo " +
      "will not choose for you. Until you do, their amounts are left out of the breakdowns " +
      "and show in the unreconciled balance.",
    // The question, per column, so the choice can be made from the warning
    // itself rather than guessed at in the categoriser.
    items: entries.map((e) => `${e.key} — ${e.question}`),
    action: { type: "open_categoriser", keys },
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

/**
 * Step 12a: the forecast holds the latest roster, and the roster has been
 * moving.
 *
 * The error itself is not fixable here, and that was measured rather than
 * assumed: holding the latest headcount is an algebraic identity with the level
 * the engine already carries (max difference 0.00 across 4 recurring categories
 * × 11 cuts), and extrapolating the roster instead swaps the error's sign —
 * base at the March cut of `samples/2025` goes from −6.66% to +4.60% and mean
 * absolute error gets worse on three of the four recurring categories. 70.9% of
 * that March error is head-months not yet hired, which no run rate can see and
 * no rule can guess without a hiring plan Clarivo does not have.
 *
 * So this warning does not fix a figure and must not move one. It says what the
 * projection assumed, with the roster movement that makes the assumption worth
 * knowing about, and points at the scenario view — which exists to price
 * exactly the hiring plan the forecast cannot invent.
 *
 * The figures carried are facts about the uploaded periods, not an estimate of
 * the forecast's error: at the March cut the roster moved 132 → 141 over three
 * periods, and the year in fact closed at 151, so any single number presented
 * as "how wrong this is" would be one Clarivo cannot know.
 */
export function forecastHoldsHeadcount(movement: {
  first: number;
  last: number;
  periods: number;
  remainingSlots: number;
}): AnnualWarning {
  const net = movement.last - movement.first;
  const pct = movement.first > 0 ? (net / movement.first) * 100 : 0;
  const direction = net > 0 ? "grown" : "shrunk";
  const sign = net > 0 ? "+" : "";

  return {
    code: "FORECAST_HOLDS_HEADCOUNT",
    severity: "warning",
    title: `Forecast holds ${movement.last} employees for the rest of the year`,
    detail:
      `Your headcount has ${direction} over the periods uploaded, and the forecast ` +
      `projects the latest period's level unchanged across the ` +
      `${movement.remainingSlots} remaining ${movement.remainingSlots === 1 ? "period" : "periods"} — ` +
      `it assumes no joiners and no leavers. Price your own hiring plan in the scenario view.`,
    items: [
      `${movement.first} → ${movement.last} over ${movement.periods} ` +
        `${movement.periods === 1 ? "period" : "periods"} (${sign}${net}, ${sign}${pct.toFixed(1)}%)`,
    ],
    action: { type: "open_scenario" },
  };
}
