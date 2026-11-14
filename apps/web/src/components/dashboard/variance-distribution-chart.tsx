"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartFrame } from "@/components/annual/chart-frame";
import {
  BAR_RADIUS_HORIZONTAL,
  CHART,
  axisProps,
  categoryAxisProps,
  tooltipProps,
} from "@/lib/chart-palette";

interface DistributionItem {
  label: string;
  count: number;
  /** Ignored: colour comes from the design system by meaning, not from the engine. */
  color: string;
}

interface VarianceDistributionChartProps {
  distribution?: DistributionItem[];
}

const LABEL_MAP: Record<string, string> = {
  "decreased >10%": "Decreased by over 10%",
  "decreased 1-10%": "Decreased 1–10%",
  unchanged: "Unchanged",
  "increased 1-10%": "Increased 1–10%",
  "increased >10%": "Increased by over 10%",
};

/** Diverging by meaning: decreases cobalt, no change grey, increases rust. */
function bucketColor(label: string): string {
  if (label.startsWith("decreased")) return CHART.down;
  if (label.startsWith("increased")) return CHART.up;
  return CHART.flat;
}

/**
 * Employees by how much their net pay changed (redesign canvas: Dashboard,
 * "Variance distribution").
 *
 * Horizontal bars so the five buckets read top to bottom from the largest decrease to
 * the largest increase, with counts on the right in Geist Mono. Inside ChartFrame, which
 * gives it role="img", a label, and a hidden table with the same numbers.
 */
export function VarianceDistributionChart({ distribution }: VarianceDistributionChartProps) {
  const rows = (distribution ?? []).map((d) => ({
    ...d,
    displayLabel: LABEL_MAP[d.label] ?? d.label,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Panel
      headingId="dist-h"
      title="Variance distribution"
      description="Employees by how much their net pay changed."
    >
      {!distribution ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <p className="m-0 py-10 text-center text-sm leading-5 text-cv-ink-subtle">
          No employees in this comparison yet.
        </p>
      ) : (
        <>
          <ChartFrame
            label={`Variance distribution: ${rows.map((r) => `${r.displayLabel} ${r.count}`).join(", ")}`}
            rowHeader="Change in net pay"
            columns={["Employees"]}
            rows={rows.map((r) => ({ name: r.displayLabel, values: [String(r.count)] }))}
          >
            <ResponsiveContainer width="100%" height={232}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke={CHART.grid} horizontal={false} vertical />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="displayLabel" width={150} {...categoryAxisProps} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value: number) => [
                    `${value} employee${value === 1 ? "" : "s"}`,
                    "Employees",
                  ]}
                />
                <Bar
                  dataKey="count"
                  radius={BAR_RADIUS_HORIZONTAL}
                  maxBarSize={22}
                  isAnimationActive={false}
                >
                  {rows.map((entry) => (
                    <Cell key={entry.label} fill={bucketColor(entry.label)} />
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
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-cv-xs bg-cv-delta-flat" />
              No change
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
