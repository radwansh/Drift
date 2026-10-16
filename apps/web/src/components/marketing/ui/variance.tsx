import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/**
 * Variance — a signed change between two payroll periods. Ported from
 * bundle.js and bundle.css (`.cv-var`).
 *
 * Two details carried over deliberately from the reference implementation:
 *
 * - The minus is U+2212, the real minus sign, not a hyphen. At tabular figures
 *   a hyphen sits too high and too short against the digits.
 * - Direction is spoken, not just coloured: a screen reader hears "Increase"
 *   or "Decrease" before the amount, so the arrow and the tint are never the
 *   only carriers of the sign.
 *
 * `down` is cobalt and `up` is rust, which looks inverted until you remember
 * what the product is: on a payroll bill, up is the thing to look at.
 */

const MINUS = "−";

export interface VarianceProps {
  /** The absolute change; its sign sets the direction unless overridden. */
  value: number;
  /** Relative change in percent, e.g. 3.2 for +3.2%. */
  percent?: number;
  /** ISO 4217 code, e.g. 'EUR'. Omit for plain numbers. */
  currency?: string;
  locale?: string;
  decimals?: number;
  direction?: "up" | "down" | "flat";
  /** Marks an unexpected change with the signal tint and square. */
  flagged?: boolean;
  size?: "md" | "lg";
  className?: string;
}

function format(n: number, locale: string, currency: string | undefined, decimals: number): string {
  return new Intl.NumberFormat(locale, {
    ...(currency ? { style: "currency", currency, currencyDisplay: "symbol" } : {}),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function Variance({
  value,
  percent,
  currency,
  locale = "en-GB",
  decimals = 2,
  direction,
  flagged,
  size = "md",
  className,
}: VarianceProps) {
  const v = Number(value) || 0;
  const dir = direction ?? (v > 0 ? "up" : v < 0 ? "down" : "flat");
  const none = dir === "flat" && v === 0;

  const sign = v > 0 ? "+" : v < 0 ? MINUS : "";
  const amount = none ? "No change" : sign + format(Math.abs(v), locale, currency, decimals);

  let pct: string | null = null;
  if (percent != null && !none) {
    const p = Number(percent);
    pct = (p > 0 ? "+" : p < 0 ? MINUS : "") + format(Math.abs(p), locale, undefined, 1) + "%";
  }

  const icon = dir === "up" ? "arrow-up" : dir === "down" ? "arrow-down" : "minus";
  const spoken = dir === "up" ? "Increase " : dir === "down" ? "Decrease " : "";
  const tone =
    dir === "up" ? "text-cv-delta-up-ink" : dir === "down" ? "text-cv-delta-down-ink" : "text-cv-delta-flat-ink";

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
      <span>{amount}</span>
      {pct && <span className="ml-1 font-normal">{pct}</span>}
      {flagged && <span className="sr-only">, flagged</span>}
    </span>
  );
}
