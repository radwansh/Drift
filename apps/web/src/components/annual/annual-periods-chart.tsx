"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  formatAxisMoney,
  formatMoney,
  formatCompact,
  shortPeriodLabel,
} from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";

type Metric = "net" | "gross" | "totalEmploymentCost";

const METRIC_LABELS: Record<Metric, string> = {
  net: "Net",
  gross: "Gross",
  totalEmploymentCost: "Total employment cost",
};

const KIND_LABELS = {
  actual: "Actual",
  estimated: "Estimated",
  forecast: "Forecast",
  missing: "Not uploaded",
} as const;

interface AnnualPeriodsChartProps {
  summary: AnnualSummary | null;
}

/** Solid for actual, 40% for forecast, outlined for estimated, hatched for missing. */
function fillFor(kind: keyof typeof KIND_LABELS): { fill: string; stroke?: string; dash?: boolean } {
  switch (kind) {
    case "actual":
      return { fill: "hsl(var(--primary))" };
    case "forecast":
      return { fill: "hsl(var(--primary) / 0.4)" };
    case "estimated":
      return { fill: "hsl(var(--primary) / 0.12)", stroke: "hsl(var(--primary))" };
    case "missing":
      return { fill: "url(#hatch-missing)", stroke: "hsl(var(--muted-foreground) / 0.5)", dash: true };
  }
}

/**
 * Actual versus forecast by period (step 35, findings U4, U8, U11).
 *
 * Three fixes: every expected slot is drawn, so a month with no upload is a
 * hatched bar rather than simply absent from the chart; last year's figure is
 * drawn as a thin reference line; and the metric toggle offers total employment
 * cost rather than the on-costs-only series it used to call "Employer cost".
 */
export function AnnualPeriodsChart({ summary }: AnnualPeriodsChartProps) {
  const [metric, setMetric] = useState<Metric>("net");
  const [cumulative, setCumulative] = useState(false);

  const currency = summary?.currency ?? "USD";

  const data = useMemo(() => {
    if (!summary) return [];
    // Last year's gross per slot, for the reference line.
    const lastYearByLabel = new Map(
      summary.yoy.slotPairs
        .filter((p) => p.previousGross !== null)
        .map((p) => [p.label, p.previousGross as number]),
    );

    let running = 0;
    return summary.periods.map((p) => {
      const value = p[metric];
      running += value;
      return {
        label: shortPeriodLabel(p.label, summary.periodType),
        fullLabel: p.label,
        value: cumulative ? running : value,
        kind: p.kind,
        lastYear: metric === "gross" ? lastYearByLabel.get(p.label) ?? null : null,
      };
    });
  }, [summary, metric, cumulative]);

  /**
   * Step 12a: the held headcount comes from the engine now.
   *
   * This used to build its own sentence — "Forecast holds headcount at 141, as
   * in Mar 2025" — from the last actual row, while `buildForecast` said nothing
   * about the roster it had assumed. So the one place the assumption appeared
   * was prose assembled in a chart component: the Excel export's Assumptions
   * sheet, which maps `summary.assumptions`, did not carry it, and neither did
   * anything else reading them. The engine states it, and this renders what the
   * engine states.
   */
  const assumption = useMemo(() => {
    if (!summary || summary.forecastPerPeriod.length === 0) return null;
    return summary.assumptions.join(" ").trim() || null;
  }, [summary]);

  const kindsPresent = useMemo(
    () => [...new Set(data.map((d) => d.kind))] as (keyof typeof KIND_LABELS)[],
    [data],
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Actual and forecast by period</CardTitle>
            <CardDescription>
              {cumulative ? "Running total across the year." : "One bar per period in the year."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <button
                key={m}
                type="button"
                // aria-pressed, so a screen reader can tell which is active
                // (finding U10).
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  metric === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={cumulative}
              onClick={() => setCumulative((c) => !c)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cumulative
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              Cumulative
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No periods to chart
          </div>
        ) : (
          <ChartFrame
            label={`${METRIC_LABELS[metric]} by period for ${summary.year}${cumulative ? ", cumulative" : ""}.`}
            columns={[METRIC_LABELS[metric], "Status"]}
            rows={data.map((d) => ({
              name: d.fullLabel,
              values: [formatMoney(d.value, currency), KIND_LABELS[d.kind]],
            }))}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <defs>
                  {/* Hatching marks a slot with no upload, so it reads as absent
                      data rather than a zero. */}
                  <pattern id="hatch-missing" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                    <rect width="6" height="6" fill="hsl(var(--muted))" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--muted-foreground) / 0.45)" strokeWidth="2" />
                  </pattern>
                </defs>
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
                  tickFormatter={formatAxisMoney}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ fontSize: 13, borderRadius: 8 }}
                  formatter={(value: number | string | Array<number | string>, name) => {
                    const v = Array.isArray(value) ? Number(value[0]) : Number(value);
                    if (name === "lastYear") return [formatMoney(v, currency), "Last year"];
                    return [formatMoney(v, currency), METRIC_LABELS[metric]];
                  }}
                  labelFormatter={(_label, payload) => {
                    const entry = payload?.[0]?.payload as
                      | { fullLabel?: string; kind?: keyof typeof KIND_LABELS }
                      | undefined;
                    if (!entry?.fullLabel) return String(_label ?? "");
                    return `${entry.fullLabel} · ${KIND_LABELS[entry.kind ?? "actual"]}`;
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  {data.map((d, i) => {
                    const style = fillFor(d.kind);
                    return (
                      <Cell
                        key={i}
                        fill={style.fill}
                        stroke={style.stroke}
                        strokeWidth={style.stroke ? 1.5 : 0}
                        strokeDasharray={style.dash ? "3 2" : undefined}
                      />
                    );
                  })}
                </Bar>
                {metric === "gross" && (
                  <Line
                    type="monotone"
                    dataKey="lastYear"
                    name="lastYear"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {kindsPresent.map((kind) => {
              const style = fillFor(kind);
              return (
                <span key={kind} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm border"
                    style={{
                      background: style.fill,
                      borderColor: style.stroke ?? "transparent",
                    }}
                    aria-hidden="true"
                  />
                  {KIND_LABELS[kind]}
                </span>
              );
            })}
            {metric === "gross" && data.some((d) => d.lastYear !== null) && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />
                Last year
              </span>
            )}
          </div>
          {assumption && summary && (
            <p>
              {assumption} Full-year {METRIC_LABELS[metric].toLowerCase()}{" "}
              {formatCompact(
                metric === "totalEmploymentCost"
                  ? summary.bridge.fullYear.totalEmploymentCost
                  : summary.bridge.fullYear[metric],
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
