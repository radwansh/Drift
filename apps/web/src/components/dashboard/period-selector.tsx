"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, ArrowRight } from "lucide-react";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

import { usePayrollStore } from "@/lib/payroll-store";

interface PeriodSelectorProps {
  periodType: string;
  onPeriodTypeChange: (value: string) => void;
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  onCurrentPeriodChange: (label: string) => void;
  onPreviousPeriodChange: (label: string) => void;
  onCompare: () => void;
  loading?: boolean;
}

export function PeriodSelector({
  periodType,
  onPeriodTypeChange,
  currentPeriodLabel,
  previousPeriodLabel,
  onCurrentPeriodChange,
  onPreviousPeriodChange,
  onCompare,
  loading,
}: PeriodSelectorProps) {
  const { periods } = usePayrollStore();
  const seen = new Set<string>();
  const periodOptions = periods
    .map((p) => ({ value: p.label, label: p.label }))
    .filter((opt) => {
      if (seen.has(opt.value)) return false;
      seen.add(opt.value);
      return true;
    });

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
          <Select value={previousPeriodLabel} onValueChange={onPreviousPeriodChange}>
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
          <Select value={currentPeriodLabel} onValueChange={onCurrentPeriodChange}>
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

        <Button onClick={onCompare} disabled={loading} className="w-full sm:w-auto">
          {loading ? "Comparing..." : "Compare"}
        </Button>
      </div>
    </div>
  );
}
