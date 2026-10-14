"use client";

import { useMemo } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCount, formatPct, shortPeriodLabel } from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";

interface AnnualHeadcountChartProps {
  summary: AnnualSummary | null;
}

const JOINER_FILL = "hsl(142 70% 42%)";
const LEAVER_FILL = "hsl(var(--destructive))";
const HEADCOUNT_STROKE = "hsl(var(--primary))";

/**
 * Headcount with joiners and leavers (step 35, finding U4).
 *
 * Three fixes. The flows were plotted on the headcount axis, so four joiners
 * against a 0–140 scale were a sliver one pixel tall; they now sit in their own
 * panel on their own scale, joiners above a zero line and leavers below it. The
 * legend swatches were set with a Tailwind `className`, which Recharts does not
 * apply to its legend marks, so both rendered black and vanished in dark mode —
 * fills are now explicit and the legend is plain text. And the x axis used the
 * month of the period end date, so a weekly payroll read "Jan Jan Jan Jan"; it
 * uses the engine's slot labels (W1…W52).
 */
export function AnnualHeadcountChart({ summary }: AnnualHeadcountChartProps) {
  const data = useMemo(() => {
    if (!summary) return [];
    const actualRows = summary.periods.filter((p) => p.kind === "actual");
    return summary.headcount.perPeriod.map((p, i) => {
      const row = actualRows[i];
      return {
        label: row ? shortPeriodLabel(row.label, summary.periodType) : p.periodEnd,
        fullLabel: row?.label ?? p.periodEnd,
        headcount: p.headcount,
        joiners: p.joiners,
        // Leavers are drawn downward from zero.
        leaversNegative: p.leavers === null ? null : -p.leavers,
        leavers: p.leavers,
        spansGap: p.spansGap,
      };
    });
  }, [summary]);

  const flowMax = useMemo(() => {
    const values = data.flatMap((d) => [d.joiners ?? 0, d.leavers ?? 0]);
    return Math.max(1, ...values);
  }, [data]);

  const turnover = summary?.headcount.turnoverRate ?? null;
  const annualised = summary?.headcount.annualisedTurnoverRate ?? null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Headcount, joiners and leavers</CardTitle>
        <CardDescription>
          {/* Turnover in the title, per KPI 9 — it was computed but never shown. */}
          Turnover {formatPct(turnover)}
          {annualised !== null ? ` · ${formatPct(annualised)} annualised` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <Skeleton className="h-[320px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No headcount data
          </div>
        ) : (
          <div className="space-y-2">
            <ChartFrame
              label={`Headcount by period for ${summary.year}, with joiners and leavers.`}
              columns={["Headcount", "Joiners", "Leavers"]}
              rows={data.map((d) => ({
                name: d.fullLabel,
                values: [
                  formatCount(d.headcount),
                  d.joiners === null ? "not known" : formatCount(d.joiners),
                  d.leavers === null ? "not known" : formatCount(d.leavers),
                ],
              }))}
              className="h-[200px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={0} />
                  <YAxis
                    width={44}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 13, borderRadius: 8 }}
                    formatter={(v: number) => [formatCount(Number(v)), "Headcount"]}
                    labelFormatter={(_l, payload) =>
                      (payload?.[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel ?? ""
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="headcount"
                    stroke={HEADCOUNT_STROKE}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartFrame>

            {/* Flows in their own panel, on their own scale. */}
            <div className="h-[120px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 0, right: 8, left: 8, bottom: 8 }} stackOffset="sign">
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
                    width={44}
                    domain={[-flowMax, flowMax]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    allowDecimals={false}
                    tickFormatter={(v: number) => formatCount(Math.abs(v))}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Tooltip
                    contentStyle={{ fontSize: 13, borderRadius: 8 }}
                    formatter={(v: number, name) => [
                      formatCount(Math.abs(Number(v))),
                      name === "leaversNegative" ? "Leavers" : "Joiners",
                    ]}
                    labelFormatter={(_l, payload) =>
                      (payload?.[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel ?? ""
                    }
                  />
                  <Bar dataKey="joiners" fill={JOINER_FILL} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey="leaversNegative" fill={LEAVER_FILL} maxBarSize={18} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* A text legend, rather than relying on swatch colour alone. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-3 border-t-2" style={{ borderColor: HEADCOUNT_STROKE }} aria-hidden="true" />
                Headcount
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: JOINER_FILL }} aria-hidden="true" />
                Joiners (above the line)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEAVER_FILL }} aria-hidden="true" />
                Leavers (below the line)
              </span>
              {data.some((d) => d.joiners === null) && (
                <span>First period has no prior roster, so its flows are unknown.</span>
              )}
              {data.some((d) => d.spansGap) && <span>Some flows span a period that was not uploaded.</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
