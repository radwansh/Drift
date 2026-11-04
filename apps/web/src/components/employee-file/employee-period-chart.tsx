"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame } from "@/components/annual/chart-frame";
import { formatAxisMoney, formatMoney } from "@/components/annual/annual-utils";
import { SLOT_KIND_LABELS } from "@/components/employee-file/employee-file-text";
import {
  buildChartData,
  presentStack,
  type PeriodRow,
} from "@/components/employee-file/employee-chart-data";

/**
 * The period chart (step E6, spec 4.4).
 *
 * A stacked column of the period table's **own numbers** by category — one
 * computation rendered twice, never two (R4). The same `PeriodRow[]` is passed
 * to the table and to this.
 *
 * **Missing slots break the series. They are never plotted as zero.** The
 * x-axis still carries the label, so a period nobody uploaded reads as a gap in
 * the chart rather than as absent from it, and `not_paid` reads the same way
 * for the same reason — the hidden data table names which of the two applies.
 *
 * Wrapped in `ChartFrame`, which supplies `role="img"`, a label and a visually
 * hidden data table carrying the same figures: Recharts emits an SVG with no
 * semantics of its own, so without the frame a screen reader sees an empty box.
 *
 * Colours are explicit `fill` props, **never** a Tailwind `className` —
 * Recharts does not apply classes to legend marks, so a classed chart renders
 * its legend black and loses it in dark mode.
 */
export function EmployeePeriodChart({
  rows,
  currency,
}: {
  rows: readonly PeriodRow[];
  currency: string;
}) {
  const data = useMemo(() => buildChartData(rows), [rows]);
  const stack = useMemo(() => presentStack(rows), [rows]);
  const gaps = rows.filter((row) => row.gross === null);

  if (rows.length === 0 || stack.length === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Gross by category, per period</CardTitle>
        <CardDescription>
          The same figures as the table above. A period with no bar was never uploaded or was
          not paid — it is not a zero.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartFrame
          label={`Gross pay by category for each period in range, in ${currency}. Periods with no figure are named in the table.`}
          columns={[...stack.map((series) => series.label), "Status"]}
          rows={rows.map((row) => ({
            name: row.fullLabel,
            values: [
              ...stack.map((series) => {
                if (row.byCategory === null) return "Not available";
                const value =
                  series.key === "earnBal" ? row.earnBal ?? 0 : row.byCategory[series.key] ?? 0;
                return formatMoney(value, currency);
              }),
              SLOT_KIND_LABELS[row.kind],
            ],
          }))}
          className="h-[320px]"
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
                  const series = stack.find((entry) => entry.key === name);
                  return [formatMoney(v, currency), series?.label ?? String(name)];
                }}
                labelFormatter={(label, payload) => {
                  const entry = payload?.[0]?.payload as
                    | { fullLabel?: string; kind?: keyof typeof SLOT_KIND_LABELS }
                    | undefined;
                  if (!entry?.fullLabel) return String(label ?? "");
                  return `${entry.fullLabel} · ${SLOT_KIND_LABELS[entry.kind ?? "actual"]}`;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) =>
                  stack.find((entry) => entry.key === value)?.label ?? String(value)
                }
              />
              {stack.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  stackId="gross"
                  fill={series.fill}
                  maxBarSize={48}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        {gaps.length > 0 && (
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            No bar for{" "}
            {gaps
              .map((row) => `${row.fullLabel} (${SLOT_KIND_LABELS[row.kind].toLowerCase()})`)
              .join(", ")}
            . Those periods are shown and labelled rather than plotted as zero.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
