import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/**
 * Variance — a signed change between two payroll periods.
 *
 * - Increases are rust (`delta-up`), decreases cobalt (`delta-down`), no change grey.
 *   That looks inverted until you remember what the product is: on a payroll bill, up is
 *   the thing to look at. Never green/red.
 * - Direction always shows three ways: colour, an arrow, and a sign. A screen reader
 *   hears "Increase" or "Decrease" before the amount.
 * - The minus is U+2212, the true minus sign, not a hyphen.
 * - `flagged` adds the signal tint and the square mark, only for changes above the
 *   customer's threshold.
 *
 * Money in the app: pass `format` (usually `(n) => formatCurrency(n, currency)` from
 * lib/utils) so the amount goes through the app's one money formatter. `format`
 * receives the ABSOLUTE value; this component adds the sign. Without `format` it falls
 * back to Intl with `currency`/`locale`, which is what the marketing pages use.
 */

const MINUS = "−";

export interface VarianceProps {
  /** The signed change; its sign sets the direction unless `direction` overrides it. */
  value: number;
  /** Relative change in percent, e.g. 3.2 for +3.2%. Null or omitted hides it. */
  percent?: number | null;
  /** Formats the absolute amount, e.g. (n) => formatCurrency(n, "USD"). */
  format?: (absolute: number) => string;
  /** ISO 4217 code, used only when `format` is not given. */
  currency?: string;
  locale?: string;
  decimals?: number;
  direction?: "up" | "down" | "flat";
  /** Marks a change above the customer's threshold with the signal tint and square. */
  flagged?: boolean;
  size?: "md" | "lg";
  /** Hide the amount and show only the percentage (e.g. a narrow column). */
  percentOnly?: boolean;
  className?: string;
}

function intlFormat(
  n: number,
  locale: string,
  currency: string | undefined,
  decimals: number,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      ...(currency ? { style: "currency", currency, currencyDisplay: "symbol" } : {}),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    return n.toFixed(decimals);
  }
}

export function Variance({
  value,
  percent,
  format,
  currency,
  locale = "en-GB",
  decimals = 2,
  direction,
  flagged,
  size = "md",
  percentOnly,
  className,
}: VarianceProps) {
  const v = Number(value) || 0;
  const dir = direction ?? (v > 0 ? "up" : v < 0 ? "down" : "flat");
  const none = dir === "flat" && v === 0;

  const sign = v > 0 ? "+" : v < 0 ? MINUS : "";
  const abs = Math.abs(v);
  const amount = none
    ? "No change"
    : sign + (format ? format(abs) : intlFormat(abs, locale, currency, decimals));

  let pct: string | null = null;
  if (percent !== null && percent !== undefined && Number.isFinite(Number(percent)) && !none) {
    const p = Number(percent);
    pct = (p > 0 ? "+" : p < 0 ? MINUS : "") + intlFormat(Math.abs(p), locale, undefined, 1) + "%";
  }

  const icon = dir === "up" ? "arrow-up" : dir === "down" ? "arrow-down" : "minus";
  const spoken = dir === "up" ? "Increase " : dir === "down" ? "Decrease " : "";
  const tone =
    dir === "up"
      ? "text-cv-delta-up-ink"
      : dir === "down"
        ? "text-cv-delta-down-ink"
        : "text-cv-delta-flat-ink";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-cv-mono font-medium tabular-nums",
        size === "lg" ? "text-[15px] leading-[22px]" : "text-[13px] leading-5",
        tone,
        flagged && "rounded-cv-sm bg-cv-signal-soft py-px pl-1.5 pr-2",
        className,
      )}
    >
      {flagged && <span aria-hidden="true" className="mr-0.5 h-1.5 w-1.5 flex-none bg-cv-signal" />}
      <Icon name={icon} size={size === "lg" ? 16 : 14} strokeWidth={2} />
      {spoken && <span className="sr-only">{spoken}</span>}
      {percentOnly && pct ? <span>{pct}</span> : <span>{amount}</span>}
      {!percentOnly && pct && <span className="ml-1 font-normal">{pct}</span>}
      {flagged && <span className="sr-only">, flagged</span>}
    </span>
  );
}
