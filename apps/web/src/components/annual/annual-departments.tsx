"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCompact, formatPct } from "@/components/annual/annual-utils";

interface AnnualDepartmentsProps {
  summary: AnnualSummary | null;
}

export function AnnualDepartments({ summary }: AnnualDepartmentsProps) {
  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Departments</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (summary.departments.length === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Cost by Department</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Department</TableHead>
                <TableHead className="text-right">Avg headcount</TableHead>
                <TableHead className="text-right">To date</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Cost per head</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.departments.map((d) => (
                <TableRow key={d.department}>
                  <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                    {d.department}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {d.avgHeadcount.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatCompact(d.actual, summary.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatCompact(d.forecast, summary.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatPct(d.shareOfTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {d.costPerHead !== 0 ? formatCompact(d.costPerHead, summary.currency) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}