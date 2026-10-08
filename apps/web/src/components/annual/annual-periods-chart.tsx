"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatAxisMoney, formatMoney, formatCompact, shortPeriodLabel } from "@/components/annual/annual-utils";

type Metric = "net" | "gross" | "employerCosts";

const METRIC_LABELS: Record<Metric, string> = {
  net: "Net",
  gross: "Gross",
  employerCosts: "Employer cost",
};

interface AnnualPeriodsChartProps {
  summary: AnnualSummary | null;
}

export function AnnualPeriodsChart({ summary }: AnnualPeriodsChartProps) {
  const [metric, setMetric] = useState<Metric>("net");

  const data = useMemo(() => {
    if (!summary) return [];
    return summary.periods.map((p) => ({
      label: shortPeriodLabel(p.label, summary.periodType),
      value: p[metric],
      kind: p.kind,
      full: `${p.label} (${p.kind})`,
    }));
  }, [summary, metric]);

  const currency = summary?.currency ?? "USD";
  const assumption = useMemo(() => {
    if (!summary || summary.forecastPerPeriod.length === 0) return null;
    const actualPeriods = summary.periods.filter((p) => p.kind === "actual");
    const last = actualPeriods.length > 0 ? actualPeriods[actualPeriods.length - 1] : null;
    const headcountPart = last
      ? `Forecast assumes headcount stays as in ${last.label} (${last.headcount ?? "—"}).`
      : "";
    return `${headcountPart} ${summary.assumptions.join(" ")}`.trim();
  }, [summary]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
        <CardTitle className="text-sm font-medium">Actual vs Forecast by Period</CardTitle>
        <div className="flex items-center gap-1">
          {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-label={`Show ${METRIC_LABELS[m]}`}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                metric === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <div className="space-y-3">
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No periods to chart
          </div>
        ) : (
          <div className="h-[300px] w-full min-w-0">
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
                  width={64}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v: number) => formatAxisMoney(v)}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ fontSize: 13, borderRadius: 8 }}
                  formatter={(value: number | string | Array<number | string>) => {
                    const v = Array.isArray(value) ? Number(value[0]) : Number(value);
                    return [formatMoney(v, currency), METRIC_LABELS[metric]];
                  }}
                  labelFormatter={(label: string, payload) => {
                    const entry = payload?.[0]?.payload as { full?: string } | undefined;
                    return entry?.full ?? label;
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {data.map((d, i) => (
                    <Cell key={i} className={d.kind === "forecast" ? "fill-primary/40" : "fill-primary"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
              Actual
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
              Forecast
            </span>
          </div>
          {assumption && summary && (
            <p className="text-muted-foreground">
              {assumption} Full-year {METRIC_LABELS[metric].toLowerCase()}{" "}
              {formatCompact(
                metric === "employerCosts" ? summary.bridge.fullYear.totalEmploymentCost : summary.bridge.fullYear[metric],
                currency,
              )}
              .
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}