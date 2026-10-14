"use client";

import { useMemo } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  formatAxisMoney,
  formatMoney,
  formatPct,
  shortPeriodLabel,
} from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";

interface AnnualStatutoryProps {
  summary: AnnualSummary | null;
}

const SERIES = [
  { key: "incomeTax", label: "Income tax", fill: "hsl(var(--primary))" },
  { key: "employeeSS", label: "Employee social security", fill: "hsl(var(--primary) / 0.6)" },
  { key: "employerSS", label: "Employer social security", fill: "hsl(var(--primary) / 0.3)" },
] as const;

/**
 * Taxes and social security (step 35, KPI 6).
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
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Taxes and social security</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Taxes and social security</CardTitle>
        <CardDescription>
          Statutory liability to date: {formatMoney(statutoryTotal, currency)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={60}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatAxisMoney}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ fontSize: 13, borderRadius: 8 }}
                  formatter={(v: number, name) => {
                    const series = SERIES.find((s) => s.key === name);
                    return [formatMoney(Number(v), currency), series?.label ?? String(name)];
                  }}
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel ?? ""
                  }
                />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="statutory" fill={s.fill} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.fill }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>

        <div className="space-y-2 border-t pt-3 text-sm">
          {[
            { label: "Income tax", amount: incomeTax },
            { label: "Employee social security", amount: employeeSS },
            { label: "Employer social security", amount: employerSS },
            { label: "Other employer costs", amount: otherEmployerCost },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="truncate text-muted-foreground">{row.label}</span>
              <span className="whitespace-nowrap text-right tabular-nums">
                {formatMoney(row.amount, currency)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t pt-2 font-medium">
            <span className="truncate">Statutory total to date</span>
            <span className="whitespace-nowrap text-right tabular-nums">
              {formatMoney(statutoryTotal, currency)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Effective income tax rate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatPct(summary.statutory.effectiveTaxRate)}
            </p>
            <p className="text-xs text-muted-foreground">Income tax over gross.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Employer on-cost rate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatPct(summary.statutory.employerOnCostRate)}
            </p>
            <p className="text-xs text-muted-foreground">Employer social security over gross.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
