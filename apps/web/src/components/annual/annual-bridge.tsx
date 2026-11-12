"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatAxisMoney, formatMoney, formatCompact } from "@/components/annual/annual-utils";
import { ChartFrame } from "@/components/annual/chart-frame";
import { CHART, axisProps, categoryAxisProps, gridProps } from "@/lib/chart-palette";

interface AnnualBridgeProps {
  summary: AnnualSummary | null;
}

export type StepKind = "total" | "decrease" | "increase";

export interface WaterfallRow {
  label: string;
  kind: StepKind;
  /** Invisible pedestal the visible bar sits on. */
  base: number;
  /** Height of the visible bar. */
  span: number;
  /** The signed amount this row represents, for labels and the data table. */
  value: number;
}

/**
 * A true waterfall (step 32, finding U1).
 *
 * v1 ran a single running total across every row, including the totals, so Net
 * was drawn *on top of* the accumulated deductions — from 2.67M up to 5.3M — and
 * Employer cost floated above that, pushing the axis to 8M for a 3.09M gross.
 * The one chart whose job is to explain where gross goes was the most wrong
 * thing on the page.
 *
 * The rule: a total starts at zero; only steps accumulate. Two runs are drawn —
 * gross down to net, then gross up to total employment cost — because they share
 * a starting point but move in opposite directions.
 */
export function buildWaterfall(summary: AnnualSummary): WaterfallRow[] {
  const cat = summary.categories.byCategory;
  const line = summary.bridge.actual;

  const rows: WaterfallRow[] = [];
  const total = (label: string, value: number): WaterfallRow => ({
    label,
    kind: "total",
    base: 0,
    span: value,
    value,
  });

  // ---- run 1: gross -> net ----
  rows.push(total("Gross", line.gross));

  let running = line.gross;
  const down = (label: string, amount: number) => {
    if (amount === 0) return;
    running -= amount;
    rows.push({ label, kind: "decrease", base: running, span: amount, value: -amount });
  };

  down("Income tax", cat.income_tax ?? 0);
  down("Employee SS", cat.social_security_employee ?? 0);
  down("Other deductions", cat.other_deduction ?? 0);
  down("Absences", cat.absence_deduction ?? 0);
  down("Unreconciled", line.balance);

  rows.push(total("Net", line.net));

  // ---- run 2: gross -> total employment cost ----
  running = line.gross;
  const up = (label: string, amount: number) => {
    if (amount === 0) return;
    rows.push({ label, kind: "increase", base: running, span: amount, value: amount });
    running += amount;
  };

  up("Employer SS", cat.social_security_employer ?? 0);
  up("Other employer costs", cat.other_employer_cost ?? 0);

  rows.push(total("Total employment cost", line.totalEmploymentCost));

  return rows;
}

/**
 * Subtotals in ink, amounts that reduce in cobalt, amounts that add in rust —
 * and never a third hue. The two balancing lines ("Unreconciled" here,
 * "Earnings balance" in the table below) are steps like any other: they exist
 * because real uploads have unmapped columns, and folding them into "other"
 * would put the gap back where nobody can see it.
 */
const STEP_FILL: Record<StepKind, string> = {
  decrease: CHART.down,
  increase: CHART.up,
  total: CHART.current,
};

const TABLE_ROWS: { label: string; get: (line: AnnualSummary["bridge"]["actual"]) => number }[] = [
  { label: "Gross", get: (l) => l.gross },
  { label: "Earnings balance", get: (l) => l.earningsBalance },
  { label: "Employee deductions", get: (l) => l.employeeDeductions },
  { label: "Unreconciled balance", get: (l) => l.balance },
  { label: "Net", get: (l) => l.net },
  { label: "Employer costs", get: (l) => l.employerCosts },
  { label: "Total employment cost", get: (l) => l.totalEmploymentCost },
];

/** Below 640px the chart turns horizontal, where the labels have room. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function AnnualBridge({ summary }: AnnualBridgeProps) {
  const waterfall = useMemo(() => (summary ? buildWaterfall(summary) : []), [summary]);
  const narrow = useIsNarrow();

  if (!summary) {
    return (
      <Panel headingId="annual-bridge-h" title="Gross to net">
        <div className="space-y-3">
          <Skeleton className="h-[320px] w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Panel>
    );
  }

  const currency = summary.currency;
  const axisMax = Math.max(...waterfall.map((r) => r.base + r.span), 0);

  return (
    <Panel
      headingId="annual-bridge-h"
      title="Gross to net"
      description="Where gross pay goes, to date. Totals start at zero; deductions step down from gross and employer costs step up."
    >
      <div className="flex flex-col gap-6">
        <ChartFrame
          label={`Gross-to-net waterfall for ${summary.year}. Gross ${formatMoney(
            summary.bridge.actual.gross,
            currency,
          )}, net ${formatMoney(summary.bridge.actual.net, currency)}, total employment cost ${formatMoney(
            summary.bridge.actual.totalEmploymentCost,
            currency,
          )}.`}
          rowHeader="Line"
          rows={waterfall.map((r) => ({
            name: r.label,
            values: [formatMoney(r.value, currency)],
          }))}
          columns={["Amount"]}
          className="h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={waterfall}
              layout={narrow ? "vertical" : "horizontal"}
              margin={
                narrow
                  ? { top: 4, right: 56, left: 8, bottom: 4 }
                  : { top: 20, right: 8, left: 8, bottom: 8 }
              }
            >
              <CartesianGrid {...gridProps} vertical={narrow} horizontal={!narrow} />
              {narrow ? (
                <>
                  <XAxis
                    type="number"
                    domain={[0, axisMax]}
                    {...axisProps}
                    tickFormatter={formatAxisMoney}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={132}
                    {...categoryAxisProps}
                    interval={0}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey="label"
                    {...categoryAxisProps}
                    tickMargin={8}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={72}
                  />
                  <YAxis
                    width={64}
                    domain={[0, axisMax]}
                    {...axisProps}
                    tickMargin={8}
                    tickFormatter={formatAxisMoney}
                  />
                </>
              )}
              {/* The pedestal is invisible; only `span` is drawn. */}
              <Bar dataKey="base" stackId="bridge" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="span" stackId="bridge" isAnimationActive={false} radius={2}>
                {waterfall.map((row) => (
                  <Cell key={row.label} fill={STEP_FILL[row.kind]} />
                ))}
                {/* Values on the bars, so the chart is readable without an axis. */}
                <LabelList
                  dataKey="value"
                  position={narrow ? "right" : "top"}
                  className="fill-cv-ink"
                  style={{ fontSize: 11, fontFamily: "var(--cv-font-mono)" }}
                  formatter={(v: number) => formatAxisMoney(Math.abs(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="overflow-x-auto rounded-cv-lg border border-cv-line">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* Sticky, so the line name survives a sideways scroll on a phone. */}
                <TableHead className="sticky left-0 z-10 bg-cv-surface-sunken">Line</TableHead>
                <TableHead className="text-right">To date</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Full year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TABLE_ROWS.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-cv-surface font-medium text-cv-ink">
                    {row.label}
                  </TableCell>
                  {/* Full values, as the spec asks — not compact ones (finding U9). */}
                  <TableCell className="cv-num">
                    {formatMoney(row.get(summary.bridge.actual), currency)}
                  </TableCell>
                  <TableCell className="cv-num">
                    {formatMoney(row.get(summary.bridge.forecast), currency)}
                  </TableCell>
                  <TableCell className="cv-num">
                    {formatMoney(row.get(summary.bridge.fullYear), currency)}
                  </TableCell>
                </TableRow>
              ))}
              {/*
                Step 6. The forecast projects a recurring floor and holds
                one-offs back, so the bridge names what was held back rather
                than leaving a reader to wonder why the forecast column is below
                the to-date column. It is a memo line: the amount is already
                inside "To date" above, which is why the other two cells are
                dashes and why it sits below the totals rather than among them.
              */}
              {summary.oneOffsExcluded.total !== 0 && (
                <TableRow className="text-cv-ink-muted">
                  <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-cv-surface font-medium">
                    One-offs excluded from forecast
                  </TableCell>
                  <TableCell className="cv-num">
                    {formatMoney(summary.oneOffsExcluded.total, currency)}
                  </TableCell>
                  <TableCell className="cv-num">—</TableCell>
                  <TableCell className="cv-num">—</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Gross {formatCompact(summary.bridge.actual.gross, currency)} → net{" "}
          {formatCompact(summary.bridge.actual.net, currency)} → total employment cost{" "}
          {formatCompact(summary.bridge.actual.totalEmploymentCost, currency)}.
        </p>
      </div>
    </Panel>
  );
}
