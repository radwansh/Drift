"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatPct } from "@/components/annual/annual-utils";

interface AnnualYoYProps {
  summary: AnnualSummary | null;
}

export function AnnualYoY({ summary }: AnnualYoYProps) {
  if (!summary) {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  if (!summary.yoy.available) return null;

  const yoy = summary.yoy;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Year-on-year</p>
        <p className="text-xs text-muted-foreground">Like-for-like, {yoy.comparablePeriods} periods</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Gross YTD vs LY</p>
        <p className="text-lg font-semibold tabular-nums">{formatPct(yoy.changePct.gross)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Net YTD vs LY</p>
        <p className="text-lg font-semibold tabular-nums">{formatPct(yoy.changePct.net)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Gross {summary.year} (to date) vs LY</p>
        <p className="text-sm tabular-nums">
          {formatCompact(yoy.currentGross, summary.currency)} vs {formatCompact(yoy.previousGross, summary.currency)}
        </p>
      </div>
      {yoy.forecastVsLastYearPct !== null && (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Forecast year vs last full year</p>
          <p className="text-lg font-semibold tabular-nums">{formatPct(yoy.forecastVsLastYearPct)}</p>
        </div>
      )}
    </div>
  );
}