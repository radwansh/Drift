"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatPct } from "@/components/annual/annual-utils";

interface AnnualYoYProps {
  summary: AnnualSummary | null;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-xs leading-4 text-cv-ink-subtle">{label}</p>
      <p className="m-0 mt-0.5 text-lg font-semibold leading-6 tabular-nums text-cv-ink">
        {children}
      </p>
    </div>
  );
}

export function AnnualYoY({ summary }: AnnualYoYProps) {
  if (!summary) {
    return <Skeleton className="h-16 w-full rounded-cv-lg" />;
  }

  if (!summary.yoy.available) return null;

  const yoy = summary.yoy;
  return (
    <section
      data-slot="card"
      aria-label="Year-on-year"
      className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-3 rounded-cv-lg border border-cv-line bg-cv-surface p-4"
    >
      <div className="min-w-0">
        <p className="m-0 text-base font-semibold leading-6 text-cv-ink">Year-on-year</p>
        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Like-for-like, {yoy.comparablePeriods} periods
        </p>
      </div>
      <Figure label="Gross YTD vs LY">{formatPct(yoy.changePct.gross)}</Figure>
      <Figure label="Net YTD vs LY">{formatPct(yoy.changePct.net)}</Figure>
      <div className="min-w-0">
        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Gross {summary.year} (to date) vs LY
        </p>
        <p className="m-0 mt-0.5 font-cv-mono text-sm leading-5 tabular-nums text-cv-ink">
          {formatCompact(yoy.currentGross, summary.currency)} vs{" "}
          {formatCompact(yoy.previousGross, summary.currency)}
        </p>
      </div>
      {yoy.forecastVsLastYearPct !== null && (
        <Figure label="Forecast year vs last full year">
          {formatPct(yoy.forecastVsLastYearPct)}
        </Figure>
      )}
    </section>
  );
}
