import { cn } from "@/lib/utils";
import { Variance, type VarianceProps } from "./variance";

/**
 * Stat — a KPI card: label, hero figure, and how it moved.
 *
 * The figure uses `kpi` type (36/40, 600, tabular). The value is passed pre-formatted:
 * number formatting stays in the page (lib/utils `formatCurrency`), so currency and
 * locale are decided in one place.
 *
 * Cards are outlined in `line` with no shadow, padded space-5 — borders first.
 * `muted` sets the value in ink-subtle, for "None" or "—" so an absent figure never
 * looks like a real one.
 */

export interface StatProps {
  label: React.ReactNode;
  /** Pre-formatted figure, e.g. "USD 1,284,906.00". */
  value?: React.ReactNode;
  variance?: VarianceProps;
  /** Context after the variance, e.g. "vs March 2026". */
  caption?: React.ReactNode;
  /** Renders the card's skeleton instead of the figure. */
  loading?: boolean;
  /** The value is an absence ("None", "—"): set it quietly. */
  muted?: boolean;
  /** An optional trailing slot in the label row (a Badge, an icon button). */
  aside?: React.ReactNode;
  className?: string;
}

export function Stat({
  label,
  value,
  variance,
  caption,
  loading,
  muted,
  aside,
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-cv-lg border border-cv-line bg-cv-surface p-5 font-cv-sans",
        className,
      )}
      aria-busy={loading ? true : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink-muted">
          {label}
        </div>
        {aside}
      </div>
      {loading ? (
        <>
          <div className="h-10 w-2/3 animate-pulse rounded-cv-sm bg-cv-surface-sunken" />
          <div className="h-[18px] w-1/2 animate-pulse rounded-cv-sm bg-cv-surface-sunken" />
        </>
      ) : (
        <>
          <div
            className={cn(
              "break-words text-4xl font-semibold leading-10 tracking-[-0.02em] tabular-nums",
              muted ? "text-cv-ink-subtle" : "text-cv-ink",
            )}
          >
            {value}
          </div>
          {(variance || caption) && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[18px] text-cv-ink-subtle">
              {variance && <Variance {...variance} />}
              {caption}
            </div>
          )}
        </>
      )}
    </div>
  );
}
