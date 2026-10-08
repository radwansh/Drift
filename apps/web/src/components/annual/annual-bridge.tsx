"use client";

import { useMemo } from "react";
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

interface AnnualBridgeProps {
  summary: AnnualSummary | null;
}

function buildWaterfall(summary: AnnualSummary) {
  const cat = summary.categories.byCategory;
  const rows = [
    { label: "Gross", value: summary.bridge.actual.gross },
    { label: "Income tax", value: -(cat.income_tax ?? 0) },
    { label: "Employee SS", value: -(cat.social_security_employee ?? 0) },
    { label: "Other deductions", value: -(cat.other_deduction ?? 0) },
    { label: "Absences", value: -(cat.absence_deduction ?? 0) },
    { label: "Balance", value: -summary.bridge.actual.balance },
    { label: "Net", value: summary.bridge.actual.net },
    { label: "Employer cost", value: summary.bridge.actual.totalEmploymentCost - summary.bridge.actual.net },
  ];

  let running = 0;
  return rows.map((r) => {
    const start = running;
    running += r.value;
    return {
      label: r.label,
      base: start,
      up: Math.max(r.value, 0),
      down: Math.min(r.value, 0),
      value: r.value,
    };
  });
}

const TABLE_ROWS: { label: string; get: (line: AnnualSummary["bridge"]["actual"]) => number }[] = [
  { label: "Gross", get: (l) => l.gross },
  { label: "Employer costs", get: (l) => l.employerCosts },
  { label: "Total employment cost", get: (l) => l.totalEmploymentCost },
  { label: "Employee deductions", get: (l) => l.employeeDeductions },
  { label: "Balance (unreconciled)", get: (l) => l.balance },
  { label: "Net", get: (l) => l.net },
];

export function AnnualBridge({ summary }: AnnualBridgeProps) {
  const waterfall = useMemo(() => (summary ? buildWaterfall(summary) : []), [summary]);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Gross-to-Net Bridge (to date)</CardTitle>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <div className="space-y-3">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfall} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={64}
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
                    formatter={(value: number, name: string, entry) => {
                      const row = entry?.payload as { value: number } | undefined;
                      const v = typeof value === "number" ? value : Number(value);
                      if (name === "base") return null;
                      return [formatMoney(row?.value ?? v, summary.currency), "Amount"];
                    }}
                  />
                  <Bar dataKey="base" stackId="bridge" fill="transparent" />
                  <Bar dataKey="up" stackId="bridge" className="fill-primary" />
                  <Bar dataKey="down" stackId="bridge" className="fill-muted-foreground/40" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Line</TableHead>
                    <TableHead className="text-right">To date</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-right">Full year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TABLE_ROWS.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                        {row.label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatCompact(row.get(summary.bridge.actual), summary.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatCompact(row.get(summary.bridge.forecast), summary.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatCompact(row.get(summary.bridge.fullYear), summary.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Full values: gross {formatMoney(summary.bridge.actual.gross, summary.currency)} → net{" "}
              {formatMoney(summary.bridge.actual.net, summary.currency)} → total employment cost{" "}
              {formatMoney(summary.bridge.actual.totalEmploymentCost, summary.currency)}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}