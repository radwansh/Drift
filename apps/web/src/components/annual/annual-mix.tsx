"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualMixProps {
  summary: AnnualSummary | null;
}

export function AnnualMix({ summary }: AnnualMixProps) {
  if (!summary) {
    return (
      <Panel compact headingId="annual-mix-h" title="Fixed vs variable pay">
        <Skeleton className="h-28 w-full" />
      </Panel>
    );
  }

  const mix = summary.mix;
  const gross = summary.bridge.actual.gross;
  const fixedShare = gross !== 0 ? (mix.fixed / gross) * 100 : null;

  return (
    <Panel compact headingId="annual-mix-h" title="Fixed vs variable pay">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 text-sm leading-5">
            <span className="truncate text-cv-ink-muted">
              Fixed (base + allowance + other earnings)
            </span>
            {/* Was `{[formatPct(fixedShare)]}` — an array, which React rendered
                without the surrounding text it needed (finding U15). */}
            <span className="cv-num text-cv-ink">{formatPct(fixedShare)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm leading-5">
            <span className="truncate text-cv-ink-muted">
              Variable (bonus + commission + overtime)
            </span>
            <span className="cv-num text-cv-ink">{formatPct(mix.variablePayShare)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm leading-5">
            <span className="truncate text-cv-ink-muted">Overtime as % of base salary</span>
            <span className="cv-num text-cv-ink">{formatPct(mix.overtimePctOfBase)}</span>
          </div>
        </div>
        {/* Two categories, so the first two series colours in order. */}
        <div className="flex h-2.5 w-full min-w-0 overflow-hidden rounded-cv-full bg-cv-surface-sunken">
          {gross !== 0 && mix.fixed !== 0 && (
            <div
              className="h-full bg-cv-chart-1"
              style={{ width: `${Math.max((mix.fixed / gross) * 100, 1)}%` }}
            />
          )}
          {gross !== 0 && mix.variable !== 0 && (
            <div
              className="h-full bg-cv-chart-2"
              style={{ width: `${Math.max((mix.variable / gross) * 100, 1)}%` }}
            />
          )}
        </div>
        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Fixed {formatMoney(mix.fixed, summary.currency)} · Variable{" "}
          {formatMoney(mix.variable, summary.currency)} · Gross to date{" "}
          {formatMoney(gross, summary.currency)}
          {/* Say why the two shares do not reach 100% rather than leaving a
              silent gap (KPI 12). The earnings balance is a real line, not a
              rounding remainder, so it is named. */}
          {summary.bridge.actual.earningsBalance !== 0 && (
            <>
              {" · "}
              {formatMoney(summary.bridge.actual.earningsBalance, summary.currency)} of gross is not
              categorised, so fixed and variable do not add to 100%.
            </>
          )}
        </p>
      </div>
    </Panel>
  );
}
