import { formatComponentName } from "@/lib/utils";
import type { PeriodType } from "@saas/payroll-core";

/**
 * One money formatter for the whole annual dashboard (step 34, finding U5).
 *
 * The page used to mix two conventions in the same card — a compact "USD 2.67M"
 * headline over a subtitle reading "$3,089,200.00" — because the headline used a
 * hand-rolled formatter and the subtitle used Intl's symbol style. Everything
 * here uses `currencyDisplay: "code"`, so it is always "USD 1,234.56" and never
 * "$1,234.56".
 */

const FULL_CACHE = new Map<string, Intl.NumberFormat>();

function fullFormatter(currency: string): Intl.NumberFormat {
  const cached = FULL_CACHE.get(currency);
  if (cached) return cached;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // An invalid or unknown code must not take the page down.
    fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  FULL_CACHE.set(currency, fmt);
  return fmt;
}

/** Full value, e.g. "USD 3,089,200.00". Use in tables and tooltips. */
export function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = fullFormatter(currency).format(amount);
  // The fallback formatter has no currency code, so prepend one.
  return formatted.includes(currency) ? formatted : `${currency} ${formatted}`;
}

/**
 * Compact value, e.g. "USD 2.67M". Includes a billions step, which the old
 * formatter lacked — an LBP company saw a clipped "600000.0M" (finding U11).
 */
export function formatCompact(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return formatMoney(amount, currency);
  }
}

/** Axis label, e.g. "2.7M" or "1.2B". No currency, to keep axes narrow. */
export function formatAxisMoney(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Plain integer count, e.g. "1,240". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

/**
 * Day counts, at most one decimal (finding U3).
 *
 * Absence days are summed from floats, so the raw value prints as
 * "44.540000000000006 days".
 */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(rounded);
  return `${text} ${rounded === 1 ? "day" : "days"}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** Signed percentage, for year-on-year and budget variance. */
export function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * What scope a figure covers (step 34, finding U5).
 *
 * "Total Employer Cost" was a full-year forecast displayed with no indication
 * that it was not an actual, next to cards that were year-to-date.
 */
export type Scope = "to_date" | "full_year_forecast" | "full_year_actual" | "annualised";

export const SCOPE_LABELS: Record<Scope, string> = {
  to_date: "To date",
  full_year_forecast: "Full-year forecast",
  full_year_actual: "Full year",
  annualised: "Annualised",
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthShort(dateStr: string): string {
  const m = Number(dateStr.slice(5, 7));
  return MONTH_SHORT[(m - 1) % 12] ?? dateStr;
}

/**
 * A human period name for an ISO end date, so cards say "Mar 2026" rather than
 * "up to 2026-03-31" (finding U5).
 */
export function periodNameFor(isoDate: string | null | undefined): string {
  if (!isoDate || isoDate.length < 7) return "—";
  const year = isoDate.slice(0, 4);
  return `${monthShort(isoDate)} ${year}`;
}

export function shortPeriodLabel(label: string, periodType: PeriodType | string): string {
  if (periodType === "monthly") return label.split(" ")[0] ?? label;
  if (periodType === "bi_monthly") {
    const parts = label.split(" ");
    return `${parts[0] ?? ""} ${parts[1] ?? ""}`.trim() || label;
  }
  // Weekly and bi-weekly labels are already short ("W1", "BW13").
  return label;
}

export { formatComponentName };
