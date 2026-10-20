import { cn } from "@/lib/utils";
import { Variance, type VarianceProps } from "./variance";

/**
 * Stat — a KPI card: label, hero figure, and how it moved. Ported from
 * bundle.css (`.cv-stat`).
 *
 * The figure is tabular-nums so a column of these lines up, and the value is
 * passed pre-formatted: the design system deliberately keeps number formatting
 * out of this component so the page controls currency and locale in one place.
 */

export interface StatProps {
  label: React.ReactNode;
  /** Pre-formatted figure, e.g. '€1,284,906'. */
  value: React.ReactNode;
  variance?: VarianceProps;
  /** Context after the variance, e.g. 'vs March 2026'. */
  caption?: React.ReactNode;
  className?: string;
}

export function Stat({ label, value, variance, caption, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-cv-lg border border-cv-line bg-cv-surface p-5 font-cv-sans",
        className,
      )}
    >
      <div className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink-muted">
        {label}
      </div>
      <div className="text-4xl font-semibold leading-10 tracking-[-0.02em] text-cv-ink tabular-nums">
        {value}
      </div>
      {(variance || caption) && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[18px] text-cv-ink-subtle">
          {variance && <Variance {...variance} />}
          {caption}
        </div>
      )}
    </div>
  );
}
