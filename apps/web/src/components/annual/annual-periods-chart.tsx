"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Panel, SegmentedControl } from "@/components/cv";
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
import {
  formatAxisMoney,
  formatMoney,
  formatCompact,
  shortPeriodLabel,
} from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";
import {
  BAR_RADIUS_VERTICAL,
  CHART,
  axisProps,
  categoryAxisProps,
  gridProps,
  tooltipProps,
} from "@/lib/chart-palette";

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

type Kind = keyof typeof KIND_LABELS;

/** Hatch for a slot nobody uploaded. Stripes only: an absent figure has no ground. */
const MISSING_HATCH = "annual-periods-missing-hatch";

interface AnnualPeriodsChartProps {
  summary: AnnualSummary | null;
}

/**
 * How each of the four kinds is drawn (canvas board "Annual salaries").
 *
 * `actual` is ink, `estimated` is the grey "previous" tone, `forecast` is
 * outlined in ink with **no fill** — the future is not a figure anyone has
 * — and `missing` is hatched in the axis colour. The four are never the same
 * mark: `kind` here is the annual engine's four-valued one (actual, estimated,
 * forecast, missing), which is deliberately not the Employee File's four, and a
 * reader has to be able to tell a projection from a payment at a glance.
 */
function fillFor(kind: Kind): { fill: string; stroke?: string; dash?: boolean } {
  switch (kind) {
    case "actual":
      return { fill: CHART.current };
    case "estimated":
      return { fill: CHART.previous };
    case "forecast":
      return { fill: "none", stroke: CHART.current };
    case "missing":
      return { fill: `url(#${MISSING_HATCH})`, stroke: CHART.axis, dash: true };
  }
}

/**
 * The hatched outline standing in for a slot nobody uploaded.
 *
 * A `missing` row carries gross 0 / net 0 from the engine, so on the per-period
 * view its bar is zero pixels tall and the hatched fill has nothing to paint —
 * the month that was supposed to be impossible to miss was invisible. This is
 * drawn through Recharts' per-bar `background`, which spans the plot's full
 * height: it marks the slot without standing for a value, which a bar of any
 * height would. Every other kind returns null, so it never sits behind a real
 * bar.
 */
function MissingOutline({
  kinds = [],
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
}: {
  kinds?: readonly Kind[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
}) {
  if (kinds[index] !== "missing") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={`url(#${MISSING_HATCH})`}
      stroke={CHART.axis}
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  );
}

/**
 * A 10px legend mark, drawn as SVG.
 *
 * It was a `<span>` whose background was set to the bar's fill — which for the
 * missing kind is `url(#…)`, not a CSS colour, so the one mark a reader most
 * needs to recognise rendered as an empty square. An SVG swatch can carry the
 * hatch and the outline, so the key matches the chart.
 */
function KindSwatch({ kind }: { kind: Kind }) {
  const style = fillFor(kind);
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="flex-none">
      {kind === "missing" ? (
        <>
          <path d="M0 7 L7 0 M3 10 L10 3" stroke={CHART.axis} strokeWidth={1.5} fill="none" />
          <rect
            x={0.5}
            y={0.5}
            width={9}
            height={9}
            fill="none"
            stroke={CHART.axis}
            strokeDasharray="2 1.5"
          />
        </>
      ) : (
        <rect
          x={0.5}
          y={0.5}
          width={9}
          height={9}
          rx={1}
          fill={style.fill === "none" ? "none" : style.fill}
          stroke={style.stroke ?? "none"}
          strokeWidth={style.stroke ? 1.5 : 0}
        />
      )}
    </svg>
  );
}

/**
 * Actual versus forecast by period (step 35, findings U4, U8, U11), on Ink &
 * Signal (canvas board "Annual salaries").
 *
 * Three fixes kept from the review: every expected slot is drawn, so a month
 * with no upload is marked rather than simply absent from the chart; last year's
 * figure is drawn as a thin reference line; and the metric toggle offers total
 * employment cost rather than the on-costs-only series it used to call
 * "Employer cost".
 *
 * Colours are explicit `fill` / `stroke` props from `lib/chart-palette.ts`,
 * never a Tailwind `className`: Recharts does not apply classes to legend marks,
 * so a classed chart renders them black and loses them in dark mode.
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
        lastYear: metric === "gross" ? (lastYearByLabel.get(p.label) ?? null) : null,
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

  const kindsPresent = useMemo(() => [...new Set(data.map((d) => d.kind))] as Kind[], [data]);
  const kinds = useMemo(() => data.map((d) => d.kind as Kind), [data]);

  return (
    <Panel
      headingId="annual-periods-h"
      title="Actual and forecast by period"
      description={
        cumulative ? "Running total across the year." : "One bar per period in the year."
      }
      actions={
        <>
          <SegmentedControl
            size="sm"
            label="Metric"
            options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({
              value: m,
              label: METRIC_LABELS[m],
            }))}
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          <SegmentedControl
            size="sm"
            label="How to total"
            options={[
              { value: "period", label: "By period" },
              { value: "cumulative", label: "Cumulative" },
            ]}
            value={cumulative ? "cumulative" : "period"}
            onChange={(v) => setCumulative(v === "cumulative")}
          />
        </>
      }
    >
      {!summary ? (
        <Skeleton className="h-[300px] w-full" />
      ) : data.length === 0 ? (
        <p className="m-0 flex h-[300px] items-center justify-center text-sm leading-5 text-cv-ink-subtle">
          No periods to chart
        </p>
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
                    data rather than a zero. Stripes only, in the axis colour. */}
                <pattern
                  id={MISSING_HATCH}
                  width={6}
                  height={6}
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1={0} y1={0} x2={0} y2={6} stroke={CHART.axis} strokeWidth={2} />
                </pattern>
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
                  if (name === "lastYear") return [formatMoney(v, currency), "Last year"];
                  return [formatMoney(v, currency), METRIC_LABELS[metric]];
                }}
                labelFormatter={(_label, payload) => {
                  const entry = payload?.[0]?.payload as
                    | { fullLabel?: string; kind?: Kind }
                    | undefined;
                  if (!entry?.fullLabel) return String(_label ?? "");
                  // "Not uploaded" rides in the tooltip label, so hovering a
                  // slot with no bar says which kind of nothing it is.
                  return `${entry.fullLabel} · ${KIND_LABELS[entry.kind ?? "actual"]}`;
                }}
              />
              <Bar
                dataKey="value"
                radius={BAR_RADIUS_VERTICAL}
                maxBarSize={48}
                isAnimationActive={false}
                background={<MissingOutline kinds={kinds} />}
              >
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
                  stroke={CHART.previous}
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

      <div className="mt-4 flex flex-col gap-2 border-t border-cv-line pt-3 text-xs leading-4 text-cv-ink-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {kindsPresent.map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <KindSwatch kind={kind} />
              {KIND_LABELS[kind]}
            </span>
          ))}
          {metric === "gross" && data.some((d) => d.lastYear !== null) && (
            <span className="inline-flex items-center gap-1.5">
              <svg
                width={12}
                height={10}
                viewBox="0 0 12 10"
                aria-hidden="true"
                className="flex-none"
              >
                <line
                  x1={0}
                  y1={5}
                  x2={12}
                  y2={5}
                  stroke={CHART.previous}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              </svg>
              Last year
            </span>
          )}
        </div>
        {assumption && summary && (
          <p className="m-0">
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
    </Panel>
  );
}
