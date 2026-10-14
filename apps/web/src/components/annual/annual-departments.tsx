"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary, DepartmentView } from "@saas/payroll-core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCount, formatMoney, formatPct } from "@/components/annual/annual-utils";
import { ScrollShadow } from "@/components/annual/scroll-shadow";
import { AnnualDrilldown } from "@/components/annual/annual-drilldown";

interface AnnualDepartmentsProps {
  summary: AnnualSummary | null;
}

type SortKey = "department" | "avgHeadcount" | "actual" | "forecast" | "shareOfTotal" | "costPerHead";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "department", label: "Department", numeric: false },
  { key: "avgHeadcount", label: "Avg headcount", numeric: true },
  { key: "actual", label: "To date", numeric: true },
  { key: "forecast", label: "Full year", numeric: true },
  { key: "shareOfTotal", label: "Share", numeric: true },
  { key: "costPerHead", label: "Cost per head", numeric: true },
];

/**
 * Cost by department (step 36, findings U9, C6).
 *
 * Full values rather than compact ones, a totals row so the table can be checked
 * against the company figure, sortable columns, and a sticky header and first
 * column so the department name stays visible while scrolling sideways.
 */
export function AnnualDepartments({ summary }: AnnualDepartmentsProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "actual", dir: "desc" });
  const [drilldown, setDrilldown] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list: DepartmentView[] = summary ? [...summary.departments] : [];
    const { key, dir } = sort;
    list.sort((a, b) => {
      if (key === "department") {
        return dir === "asc"
          ? a.department.localeCompare(b.department)
          : b.department.localeCompare(a.department);
      }
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      return dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [summary, sort]);

  const totals = useMemo(() => {
    if (!summary) return null;
    return summary.departments.reduce(
      (acc, d) => ({
        avgHeadcount: acc.avgHeadcount + d.avgHeadcount,
        actual: acc.actual + d.actual,
        forecast: acc.forecast + d.forecast,
      }),
      { avgHeadcount: 0, actual: 0, forecast: 0 },
    );
  }, [summary]);

  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cost by department</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (summary.departments.length === 0) return null;

  const currency = summary.currency;

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "department" ? "asc" : "desc" }));
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Cost by department</CardTitle>
        <CardDescription>
          Gross plus employer costs. Departments add up to total employment cost.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollShadow>
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col, i) => (
                  <TableHead
                    key={col.key}
                    aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "sticky top-0 z-20 bg-background",
                      i === 0 && "left-0 z-30",
                      col.numeric && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        col.numeric && "flex-row-reverse",
                      )}
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ))}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.department}>
                  <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background font-medium">
                    {/* Step 44: opens this department's detail. */}
                    <button
                      type="button"
                      onClick={() => setDrilldown(d.department)}
                      className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {d.department}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {d.avgHeadcount.toFixed(1)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(d.actual, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(d.forecast, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatPct(d.shareOfTotal)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {d.costPerHead !== 0 ? formatMoney(d.costPerHead, currency) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {totals && (
                <TableRow className="border-t-2 font-medium">
                  <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background">Total</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatCount(totals.avgHeadcount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(totals.actual, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(totals.forecast, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">100.0%</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">—</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollShadow>

        <AnnualDrilldown
          summary={summary}
          department={drilldown}
          onClose={() => setDrilldown(null)}
        />
      </CardContent>
    </Card>
  );
}
