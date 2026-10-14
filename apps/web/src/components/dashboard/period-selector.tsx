"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, ArrowRight } from "lucide-react";
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
}

/**
 * Step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md: the options arrive as a prop and
 * are keyed by period id.
 *
 * This read `usePayrollStore` directly and keyed the selects by *label*, which
 * is not unique — two periods with the same label were de-duplicated out of
 * the list, and selecting one could resolve to the other.
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
}: PeriodSelectorProps) {
  const periodOptions = periods.map((p) => ({ value: p.id, label: p.label }));
  const canCompare =
    currentPeriodId !== "" && previousPeriodId !== "" && currentPeriodId !== previousPeriodId;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-end gap-3 sm:gap-4">
        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-sm font-medium text-foreground">Period Type</label>
          <Select value={periodType} onValueChange={onPeriodTypeChange}>
            <SelectTrigger className="w-full sm:w-44 lg:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-sm font-medium text-foreground">Previous Period</label>
          <Select value={previousPeriodId} onValueChange={onPreviousPeriodChange}>
            <SelectTrigger className="w-full sm:w-40 lg:w-44">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
              <SelectValue />
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

        <div className="flex items-center pb-2 w-full sm:w-auto justify-center sm:justify-start">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="space-y-1.5 w-full sm:w-auto">
          <label className="text-sm font-medium text-foreground">Current Period</label>
          <Select value={currentPeriodId} onValueChange={onCurrentPeriodChange}>
            <SelectTrigger className="w-full sm:w-40 lg:w-44">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
              <SelectValue />
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

        <Button onClick={onCompare} disabled={loading || !canCompare} className="w-full sm:w-auto">
          {loading ? "Comparing..." : "Compare"}
        </Button>
      </div>
    </div>
  );
}
