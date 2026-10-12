"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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

const STEP_FILL: Record<StepKind, string> = {
  // Decreases red, increases green, totals grey.
  decrease: "hsl(var(--destructive))",
  increase: "hsl(142 70% 42%)",
  total: "hsl(var(--muted-foreground))",
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
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Gross to net</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-[320px] w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const currency = summary.currency;
  const axisMax = Math.max(...waterfall.map((r) => r.base + r.span), 0);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Gross to net</CardTitle>
        <CardDescription>
          Where gross pay goes, to date. Totals start at zero; deductions step down from gross and
          employer costs step up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChartFrame
          label={`Gross-to-net waterfall for ${summary.year}. Gross ${formatMoney(
            summary.bridge.actual.gross,
            currency,
          )}, net ${formatMoney(summary.bridge.actual.net, currency)}, total employment cost ${formatMoney(
            summary.bridge.actual.totalEmploymentCost,
            currency,
          )}.`}
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
              margin={narrow ? { top: 4, right: 56, left: 8, bottom: 4 } : { top: 20, right: 8, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={narrow} horizontal={!narrow} />
              {narrow ? (
                <>
                  <XAxis
                    type="number"
                    domain={[0, axisMax]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatAxisMoney}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={132}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={72}
                  />
                  <YAxis
                    width={64}
                    domain={[0, axisMax]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
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
                  className="fill-foreground"
                  style={{ fontSize: 10 }}
                  formatter={(v: number) => formatAxisMoney(Math.abs(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background">Line</TableHead>
                <TableHead className="text-right">To date</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Full year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TABLE_ROWS.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium whitespace-nowrap">
                    {row.label}
                  </TableCell>
                  {/* Full values, as the spec asks — not compact ones (finding U9). */}
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatMoney(row.get(summary.bridge.actual), currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatMoney(row.get(summary.bridge.forecast), currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatMoney(row.get(summary.bridge.fullYear), currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Gross {formatCompact(summary.bridge.actual.gross, currency)} → net{" "}
          {formatCompact(summary.bridge.actual.net, currency)} → total employment cost{" "}
          {formatCompact(summary.bridge.actual.totalEmploymentCost, currency)}.
        </p>
      </CardContent>
    </Card>
  );
}
