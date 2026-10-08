"use client";

import { useMemo } from "react";
import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  Legend,
} from "recharts";
import { monthShort } from "@/components/annual/annual-utils";

interface AnnualHeadcountChartProps {
  summary: AnnualSummary | null;
}

export function AnnualHeadcountChart({ summary }: AnnualHeadcountChartProps) {
  const data = useMemo(() => {
    if (!summary) return [];
    return summary.headcount.perPeriod.map((p) => ({
      label: monthShort(p.periodEnd),
      headcount: p.headcount,
      joiners: p.joiners,
      leavers: p.leavers,
    }));
  }, [summary]);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Headcount, Joiners and Leavers</CardTitle>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No headcount data
          </div>
        ) : (
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
                  width={40}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{ fontSize: 13, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Bar dataKey="joiners" name="Joiners" className="fill-primary/35" maxBarSize={18} />
                <Bar dataKey="leavers" name="Leavers" className="fill-muted-foreground/50" maxBarSize={18} />
                <Line
                  type="monotone"
                  dataKey="headcount"
                  name="Headcount"
                  className="stroke-primary"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}