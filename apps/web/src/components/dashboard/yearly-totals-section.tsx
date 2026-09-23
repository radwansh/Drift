"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { CalendarRange, Wallet, Users, Layers } from "lucide-react";
import { usePayrollStore } from "@/lib/payroll-store";

interface YearTotalsRow {
  year: number;
  periodCount: number;
  headcount: number;
  netTotal: number;
}

export function YearlyTotalsSection() {
  const { periods } = usePayrollStore();

  const rows = useMemo<YearTotalsRow[]>(() => {
    const byYear = new Map<number, YearTotalsRow>();

    for (const period of periods) {
      const year = new Date(period.dateFrom).getFullYear();
      let row = byYear.get(year);
      if (!row) {
        row = { year, periodCount: 0, headcount: 0, netTotal: 0 };
        byYear.set(year, row);
      }
      row.periodCount += 1;
      row.headcount += period.employees.length;
      row.netTotal += period.employees.reduce<number>((sum, emp) => sum + (emp.netSalary ?? 0), 0);
    }

    return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
  }, [periods]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium inline-flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          Yearly Totals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {periods.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rows.map((row) => (
              <div
                key={row.year}
                className="rounded-xl border bg-muted/40 p-4 space-y-2 min-w-0"
              >
                <p className="text-sm font-semibold text-foreground">{row.year}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm min-w-0">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums font-medium text-foreground truncate" title={formatCurrency(row.netTotal)}>
                      {formatCurrency(row.netTotal)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums">{row.headcount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums">{row.periodCount} period{row.periodCount !== 1 ? "s" : ""}</span>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
