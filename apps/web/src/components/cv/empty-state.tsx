import { cn } from "@/lib/utils";
import { DriftStrip } from "./drift-strip";

/**
 * EmptyState — what a panel or page shows when there is nothing to show yet.
 *
 * The drift strip is the picture: a calm baseline. A screen with nothing changed should
 * look calm, so there is no illustration, no big icon in a circle and no exclamation.
 *
 * Copy: say what is missing and the one thing to do next.
 *   "No payroll data yet" / "Upload your first payroll period to compare it with the next."
 *   "No changes above your thresholds" / "Checked 20 employees and 6 pay components."
 *
 * `bare` drops the card frame for use inside a Panel.
 */

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The next step: usually one <Button>. */
  action?: React.ReactNode;
  /** Replace the drift strip (e.g. a Lucide icon at 20px), or `null` for none. */
  visual?: React.ReactNode | null;
  bare?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  visual,
  bare,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 pb-6 pt-8 text-center",
        !bare && "rounded-cv-lg border border-cv-line bg-cv-surface py-12",
        className,
      )}
    >
      {visual === undefined ? <DriftStrip size="lg" count={24} /> : visual}
      <p className="m-0 text-[15px] font-semibold leading-[22px] text-cv-ink">{title}</p>
      {description && (
        <p className="m-0 max-w-[44ch] text-sm leading-5 text-cv-ink-subtle">{description}</p>
      )}
      {action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
