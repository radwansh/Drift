"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/cv";
import { ChartFrame } from "@/components/annual/chart-frame";
import { formatAxisMoney, formatMoney } from "@/components/annual/annual-utils";
import {
  BAR_RADIUS_VERTICAL,
  CHART,
  axisProps,
  categoryAxisProps,
  gridProps,
  legendProps,
  seriesColor,
  tooltipProps,
} from "@/lib/chart-palette";
import { SLOT_KIND_LABELS } from "@/components/employee-file/employee-file-text";
import {
  buildChartData,
  presentStack,
  type PeriodRow,
} from "@/components/employee-file/employee-chart-data";

/**
 * The period chart (step E6, spec 4.4), on Ink & Signal (canvas board
 * "Employee File: one person").
 *
 * A stacked column of the period table's **own numbers** by category — one
 * computation rendered twice, never two (R4). The same `PeriodRow[]` is passed
 * to the table and to this.
 *
 * **Missing slots break the series. They are never plotted as zero.** A slot
 * with no figure contributes `null` for every series, so Recharts draws no bar
 * at all; the x-axis still carries the label, and in the bar's place sits a
 * hatched outline in `CHART.axis` that marks the slot without asserting a
 * height. `not_paid` reads the same way for the same reason — the hover, the
 * hidden data table and the line under the chart each name which of the two
 * applies, because "nobody uploaded it" and "they were not paid" are different
 * facts.
 *
 * A **duplicate** slot keeps its figures (the sum is what ties to the register)
 * and takes a hatched fill, so a bar that may be two rows added together is
 * never read as one person's pay.
 *
 * Wrapped in `ChartFrame`, which supplies `role="img"`, a label and a visually
 * hidden data table carrying the same figures: Recharts emits an SVG with no
 * semantics of its own, so without the frame a screen reader sees an empty box.
 *
 * Colours are explicit `fill` props from `lib/chart-palette.ts`, **never** a
 * Tailwind `className` — Recharts does not apply classes to legend marks, so a
 * classed chart renders its legend black and loses it in dark mode. Categories
 * take `seriesColor(i)` in order rather than `GROSS_STACK`'s own hues, the same
 * way the Dashboard's distribution chart ignores the engine's colours: the
 * palette is a design-system decision, not a domain one.
 */

const GAP_HATCH = "employee-period-gap-hatch";
const DUP_HATCH = "employee-period-duplicate-hatch";

/** 45° hatch. `ground` is the category's own colour; the stripes are the mark. */
function Hatch({ id, ground }: { id: string; ground?: string }) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      {ground && <rect width={6} height={6} fill={ground} />}
      <line x1={0} y1={0} x2={0} y2={6} stroke={CHART.axis} strokeWidth={2} />
    </pattern>
  );
}

/**
 * The hatched outline where a slot with no figure would have had a bar.
 *
 * Rendered through Recharts' per-bar `background`, which spans the plot's full
 * height: it marks the slot without standing for a value, which a bar of any
 * height would. A slot with a figure returns null, so this never sits behind a
 * real bar.
 */
function GapOutline({
  rows = [],
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
}: {
  rows?: readonly PeriodRow[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
}) {
  const row = rows[index];
  if (!row || row.gross !== null) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={`url(#${GAP_HATCH})`}
      stroke={CHART.axis}
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  );
}

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
    <Panel
      headingId="employee-gross-chart-h"
      title="Gross by category, per period"
      description="The same figures as the table above. A period with no bar was never uploaded or was not paid — it is not a zero."
    >
      <ChartFrame
        label={`Gross pay by category for each period in range, in ${currency}. Periods with no figure are named in the table.`}
        columns={[...stack.map((series) => series.label), "Status"]}
        rows={rows.map((row) => ({
          name: row.fullLabel,
          values: [
            ...stack.map((series) => {
              // No register to read: the kind is the answer, not a figure.
              if (row.byCategory === null) return SLOT_KIND_LABELS[row.kind];
              const value =
                series.key === "earnBal" ? (row.earnBal ?? 0) : (row.byCategory[series.key] ?? 0);
              return formatMoney(value, currency);
            }),
            SLOT_KIND_LABELS[row.kind],
          ],
        }))}
        className="h-[320px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <defs>
              <Hatch id={GAP_HATCH} />
              {stack.map((series, index) => (
                <Hatch key={series.key} id={`${DUP_HATCH}-${index}`} ground={seriesColor(index)} />
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="label"
              {...categoryAxisProps}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis width={64} {...axisProps} tickMargin={8} tickFormatter={formatAxisMoney} />
            <Tooltip
              {...tooltipProps}
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
              {...legendProps}
              formatter={(value) =>
                stack.find((entry) => entry.key === value)?.label ?? String(value)
              }
            />
            {stack.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                stackId="gross"
                /* On the Bar for the legend mark, on each Cell for the slot. */
                fill={seriesColor(index)}
                maxBarSize={48}
                isAnimationActive={false}
                radius={index === stack.length - 1 ? BAR_RADIUS_VERTICAL : undefined}
                background={index === 0 ? <GapOutline rows={rows} /> : undefined}
              >
                {rows.map((row) => (
                  <Cell
                    key={row.index}
                    fill={
                      row.kind === "duplicate" ? `url(#${DUP_HATCH}-${index})` : seriesColor(index)
                    }
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      {gaps.length > 0 && (
        <p className="m-0 mt-4 border-t border-cv-line pt-3 text-xs leading-4 text-cv-ink-subtle">
          No bar for{" "}
          {gaps
            .map((row) => `${row.fullLabel} (${SLOT_KIND_LABELS[row.kind].toLowerCase()})`)
            .join(", ")}
          . Those periods are marked with a hatched outline rather than plotted as zero.
        </p>
      )}
    </Panel>
  );
}
