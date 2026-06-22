"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface DistributionItem {
  label: string;
  count: number;
  color: string;
}

interface VarianceDistributionChartProps {
  distribution?: DistributionItem[];
}

const LABEL_MAP: Record<string, string> = {
  "decreased >10%": "Decreased >10%",
  "decreased 1-10%": "Decreased 1-10%",
  unchanged: "Unchanged",
  "increased 1-10%": "Increased 1-10%",
  "increased >10%": "Increased >10%",
};

export function VarianceDistributionChart({ distribution }: VarianceDistributionChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Variance Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {!distribution ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : distribution.every((d) => d.count === 0) ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
            No data available for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={distribution.map((d) => ({ ...d, displayLabel: LABEL_MAP[d.label] ?? d.label }))}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="displayLabel"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 13, borderRadius: 8 }}
                formatter={(value: number, _name: string, props: { payload: DistributionItem }) => [
                  `${value} employee${value !== 1 ? "s" : ""}`,
                  props.payload.label,
                ]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {distribution.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
