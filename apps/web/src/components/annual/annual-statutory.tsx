"use client";

import { useMemo } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  formatAxisMoney,
  formatMoney,
  formatPct,
  shortPeriodLabel,
} from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";
import {
  axisProps,
  categoryAxisProps,
  gridProps,
  seriesColor,
  tooltipProps,
} from "@/lib/chart-palette";

interface AnnualStatutoryProps {
  summary: AnnualSummary | null;
}

/** Three categories, so `seriesColor(0..2)` in order — never one hue at three opacities. */
const SERIES = [
  { key: "incomeTax", label: "Income tax", fill: seriesColor(0) },
  { key: "employeeSS", label: "Employee social security", fill: seriesColor(1) },
  { key: "employerSS", label: "Employer social security", fill: seriesColor(2) },
] as const;

/**
 * Taxes and social security (step 35, KPI 6), on Ink & Signal.
 *
 * The spec asks for stacked bars by period; v1 showed a totals card only. The
 * total also lumped other employer costs in with employer social security, so
 * "employer contributions" overstated the statutory liability.
 */
export function AnnualStatutory({ summary }: AnnualStatutoryProps) {
  const data = useMemo(() => {
    if (!summary) return [];
    // Per-period employer on-costs are in the period series; income tax and
    // employee social security are only available as year totals, so they are
    // apportioned by each period's share of gross.
    const gross = summary.bridge.actual.gross;
    const cat = summary.categories.byCategory;
    const incomeTaxTotal = cat.income_tax ?? 0;
    const employeeSSTotal = cat.social_security_employee ?? 0;

    return summary.periods
      .filter((p) => p.kind === "actual")
      .map((p) => {
        const share = gross > 0 ? p.gross / gross : 0;
        return {
          label: shortPeriodLabel(p.label, summary.periodType),
          fullLabel: p.label,
          incomeTax: incomeTaxTotal * share,
          employeeSS: employeeSSTotal * share,
          employerSS: p.employerCosts,
        };
      });
  }, [summary]);

  if (!summary) {
    return (
      <Panel headingId="annual-statutory-h" title="Taxes and social security">
        <Skeleton className="h-64 w-full" />
      </Panel>
    );
  }

  const cat = summary.categories.byCategory;
  const incomeTax = cat.income_tax ?? 0;
  const employeeSS = cat.social_security_employee ?? 0;
  // Employer social security alone, not every employer cost (KPI 6).
  const employerSS = cat.social_security_employer ?? 0;
  const otherEmployerCost = cat.other_employer_cost ?? 0;
  const statutoryTotal = incomeTax + employeeSS + employerSS;
  const currency = summary.currency;

  return (
    <Panel
      headingId="annual-statutory-h"
      title="Taxes and social security"
      description={`Statutory liability to date: ${formatMoney(statutoryTotal, currency)}.`}
    >
      <div className="flex flex-col gap-5">
        {data.length > 0 && (
          <ChartFrame
            label={`Income tax, employee social security and employer social security by period for ${summary.year}.`}
            columns={SERIES.map((s) => s.label)}
            rows={data.map((d) => ({
              name: d.fullLabel,
              values: [
                formatMoney(d.incomeTax, currency),
                formatMoney(d.employeeSS, currency),
                formatMoney(d.employerSS, currency),
              ],
            }))}
            className="h-[220px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...categoryAxisProps}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis width={60} {...axisProps} tickMargin={8} tickFormatter={formatAxisMoney} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(v: number, name) => {
                    const series = SERIES.find((s) => s.key === name);
                    return [formatMoney(Number(v), currency), series?.label ?? String(name)];
                  }}
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel ?? ""
                  }
                />
                {SERIES.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="statutory"
                    fill={s.fill}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {/* The key is plain text with an SVG mark: Recharts drops classes on
            legend marks, so these colours are explicit too. */}
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-xs leading-4 text-cv-ink-muted">
          {SERIES.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 flex-none rounded-cv-xs"
                style={{ background: s.fill }}
              />
              {s.label}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t border-cv-line pt-3 text-sm leading-5">
          {[
            { label: "Income tax", amount: incomeTax },
            { label: "Employee social security", amount: employeeSS },
            { label: "Employer social security", amount: employerSS },
            { label: "Other employer costs", amount: otherEmployerCost },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="truncate text-cv-ink-muted">{row.label}</span>
              <span className="cv-num text-cv-ink">{formatMoney(row.amount, currency)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t border-cv-line pt-2 font-medium">
            <span className="truncate text-cv-ink">Statutory total to date</span>
            <span className="cv-num text-cv-ink">{formatMoney(statutoryTotal, currency)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-cv-lg border border-cv-line p-3">
            <p className="m-0 text-xs leading-4 text-cv-ink-subtle">Effective income tax rate</p>
            <p className="m-0 mt-1 text-lg font-semibold leading-6 tabular-nums text-cv-ink">
              {formatPct(summary.statutory.effectiveTaxRate)}
            </p>
            <p className="m-0 text-xs leading-4 text-cv-ink-subtle">Income tax over gross.</p>
          </div>
          <div className="rounded-cv-lg border border-cv-line p-3">
            <p className="m-0 text-xs leading-4 text-cv-ink-subtle">Employer on-cost rate</p>
            <p className="m-0 mt-1 text-lg font-semibold leading-6 tabular-nums text-cv-ink">
              {formatPct(summary.statutory.employerOnCostRate)}
            </p>
            <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
              Employer social security over gross.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
