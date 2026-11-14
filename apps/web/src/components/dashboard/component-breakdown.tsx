"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartFrame } from "@/components/annual/chart-frame";
import { formatAxisMoney } from "@/components/annual/annual-utils";
import { formatComponentName, formatCurrency } from "@/lib/utils";
import {
  BAR_RADIUS_HORIZONTAL,
  CHART,
  axisProps,
  categoryAxisProps,
  deltaColor,
  tooltipProps,
} from "@/lib/chart-palette";

interface ComponentItem {
  component: string;
  totalChange: number;
  employeeCount: number;
}

interface ComponentBreakdownProps {
  components?: ComponentItem[];
  currency: string;
  /** "July 2026 vs June 2026", for the description. */
  comparisonLabel?: string;
}

const MINUS = "−";

function signed(amount: number, currency: string): string {
  if (amount === 0) return formatCurrency(0, currency);
  return `${amount > 0 ? "+" : MINUS}${formatCurrency(Math.abs(amount), currency)}`;
}

/**
 * The total change in each pay component (redesign canvas: Dashboard, "Variance by pay
 * component").
 *
 * A variance chart diverges from a zero baseline: increases rust, decreases cobalt, the
 * baseline in chart-axis. It replaces seven hard-coded hex colours keyed on component
 * names, which gave "deduction" red and "commission" green: a hue per component is the
 * categorical palette's job, and this chart is about direction.
 */
export function ComponentBreakdown({
  components,
  currency,
  comparisonLabel,
}: ComponentBreakdownProps) {
  const rows = (components ?? [])
    .map((c) => ({ ...c, name: formatComponentName(c.component) }))
    .sort((a, b) => b.totalChange - a.totalChange);

  return (
    <Panel
      headingId="comp-h"
      title="Variance by pay component"
      description={`Total change in each component${comparisonLabel ? `, ${comparisonLabel}` : ""}.`}
    >
      {!components ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 py-10 text-center text-sm leading-5 text-cv-ink-subtle">
          No component changed.
        </p>
      ) : (
        <>
          <ChartFrame
            label={`Variance by pay component: ${rows.map((r) => `${r.name} ${signed(r.totalChange, currency)}`).join(", ")}`}
            rowHeader="Component"
            columns={["Total change", "Employees"]}
            rows={rows.map((r) => ({
              name: r.name,
              values: [signed(r.totalChange, currency), String(r.employeeCount)],
            }))}
          >
            <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 40)}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} vertical />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatAxisMoney(v)}
                  {...axisProps}
                />
                <YAxis type="category" dataKey="name" width={150} {...categoryAxisProps} />
                <ReferenceLine x={0} stroke={CHART.axis} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value: number) => [signed(value, currency), "Total change"]}
                />
                <Bar
                  dataKey="totalChange"
                  radius={BAR_RADIUS_HORIZONTAL}
                  maxBarSize={22}
                  isAnimationActive={false}
                >
                  {rows.map((entry) => (
                    <Cell key={entry.component} fill={deltaColor(entry.totalChange)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
          <ul className="m-0 mt-4 flex list-none flex-wrap gap-4 p-0 text-xs leading-4 text-cv-ink-muted">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-cv-xs bg-cv-delta-down" />
              Decrease
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-cv-xs bg-cv-delta-up" />
              Increase
            </li>
          </ul>
        </>
      )}
    </Panel>
  );
}
