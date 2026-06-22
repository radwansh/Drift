"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatCurrency } from "@/lib/utils";

interface ComponentItem {
  component: string;
  totalChange: number;
  employeeCount: number;
}

interface ComponentBreakdownProps {
  components?: ComponentItem[];
}

const COMPONENT_COLORS: Record<string, string> = {
  salary: "#3b82f6",
  bonus: "#8b5cf6",
  benefits: "#06b6d4",
  overtime: "#f59e0b",
  commission: "#10b981",
  deduction: "#ef4444",
  allowance: "#ec4899",
};

function getColor(component: string): string {
  const key = component.toLowerCase();
  for (const [k, v] of Object.entries(COMPONENT_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "#6b7280";
}

export function ComponentBreakdown({ components }: ComponentBreakdownProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Component Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {!components ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : components.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
            No component data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={components}
              layout="vertical"
              margin={{ top: 10, right: 40, left: 60, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <YAxis
                type="category"
                dataKey="component"
                tick={{ fontSize: 11, textAnchor: "end" }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{ fontSize: 13, borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), "Total Change"]}
                labelFormatter={(label: string) => `Component: ${label}`}
              />
              <Bar dataKey="totalChange" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {components.map((entry, index) => (
                  <Cell key={index} fill={getColor(entry.component)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
