"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button, SegmentedControl } from "@/components/cv";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";
import type { PeriodOption } from "@/hooks/use-period-options";

interface PeriodSelectorProps {
  periodType: string;
  onPeriodTypeChange: (value: string) => void;
  /** Supplied by the page from `usePeriodOptions`, not read from a store. */
  periods: PeriodOption[];
  currentPeriodId: string;
  previousPeriodId: string;
  onCurrentPeriodChange: (id: string) => void;
  onPreviousPeriodChange: (id: string) => void;
  onCompare: () => void;
  loading?: boolean;
  /** Extra actions at the end of the bar (Export on the Detailed View). */
  actions?: React.ReactNode;
}

/**
 * The comparison toolbar (redesign canvas: Dashboard, Detailed View).
 *
 *   [Monthly | Bi-monthly | Bi-weekly | Weekly]  Compare [July 2026 v] with [June 2026 v]   ...   [Compare periods]
 *
 * Same props as before, so the Dashboard and the Detailed View both keep working.
 * Step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md still holds: options arrive as a prop and are
 * keyed by period id, never by label (labels are not unique).
 *
 * "Compare periods" is the screen's one primary (Ink) action; while it runs it shows the
 * scanning drift strip.
 */
export function PeriodSelector({
  periodType,
  onPeriodTypeChange,
  periods,
  currentPeriodId,
  previousPeriodId,
  onCurrentPeriodChange,
  onPreviousPeriodChange,
  onCompare,
  loading,
  actions,
}: PeriodSelectorProps) {
  const periodOptions = periods.map((p) => ({ value: p.id, label: p.label }));
  const canCompare =
    currentPeriodId !== "" && previousPeriodId !== "" && currentPeriodId !== previousPeriodId;
  const cadences = Object.entries(PERIOD_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div
      role="group"
      aria-label="Comparison"
      className="flex flex-wrap items-center gap-3 rounded-cv-lg border border-cv-line bg-cv-surface px-4 py-3"
    >
      {/* Scrolls sideways rather than overflowing the toolbar on a 360px phone. */}
      <div className="-mx-1 max-w-full overflow-x-auto px-1">
        <SegmentedControl
          label="Payroll cadence"
          options={cadences}
          value={periodType}
          onChange={onPeriodTypeChange}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ml-2">
        <span className="text-[13px] font-medium text-cv-ink-muted">Compare</span>
        <Select value={currentPeriodId} onValueChange={onCurrentPeriodChange}>
          <SelectTrigger aria-label="Current period" className="w-40 lg:w-44">
            <SelectValue placeholder="Current period" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[13px] font-medium text-cv-ink-muted">with</span>
        <Select value={previousPeriodId} onValueChange={onPreviousPeriodChange}>
          <SelectTrigger aria-label="Previous period" className="w-40 lg:w-44">
            <SelectValue placeholder="Previous period" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <span className="hidden flex-1 sm:block" />

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {actions}
        <Button
          variant="primary"
          onClick={onCompare}
          disabled={loading || !canCompare}
          loading={loading}
        >
          {loading ? "Comparing" : "Compare periods"}
        </Button>
      </div>
    </div>
  );
}
