import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONEY_CACHE = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currencyCode: string): Intl.NumberFormat {
  const cached = MONEY_CACHE.get(currencyCode);
  if (cached) return cached;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // An invalid or unknown code must not take the page down.
    fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  MONEY_CACHE.set(currencyCode, fmt);
  return fmt;
}

/**
 * The one money formatter for the app (step 8b of
 * docs/PAYROLL_AUDIT_FIX_PLAN.md). Always "USD 1,234.56", never "$1,234.56",
 * as CLAUDE.md requires.
 *
 * Two defects, both on the comparison side. It used `style: "currency"` with
 * Intl's default symbol display, and `currencyCode` defaulted to `"USD"` — and
 * 24 call sites across `components/dashboard` and `components/detailed-view`
 * took that default, so a Lebanese company's payroll was labelled in dollars on
 * every card, table and chart axis. The default is gone rather than corrected:
 * a required argument is what makes the compiler find the next call site that
 * forgets, which is how the first 24 went unnoticed.
 *
 * `formatMoney` in `components/annual/annual-utils.ts` is this function under
 * the annual feature's name; the annual side was already correct and is
 * unchanged.
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = moneyFormatter(currencyCode).format(amount);
  // The fallback formatter carries no currency code, so prepend one.
  return formatted.includes(currencyCode) ? formatted : `${currencyCode} ${formatted}`;
}

export function formatComponentName(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatPercentage(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatChange(value: number | null): { text: string; className: string } {
  if (value === null || value === undefined) return { text: "—", className: "unchanged-text" };
  if (Math.abs(value) < 0.01) return { text: "0.00", className: "unchanged-text" };
  const sign = value > 0 ? "+" : "";
  const className = value > 0 ? "increase-text" : value < 0 ? "decrease-text" : "unchanged-text";
  return { text: `${sign}${value.toFixed(2)}`, className };
}

export function getSeverityBg(severity: string): string {
  switch (severity) {
    case "critical": return "anomaly-critical";
    case "warning": return "anomaly-warning";
    default: return "anomaly-info";
  }
}
