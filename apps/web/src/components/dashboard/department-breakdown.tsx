"use client";

import { Button, Panel, Variance } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface DepartmentRow {
  department: string;
  headcountCurrent: number;
  headcountPrevious: number;
  totalCurrent: number;
  totalPrevious: number;
  absoluteChange: number;
  percentageChange: number | null;
}

interface DepartmentBreakdownProps {
  departments?: DepartmentRow[];
  currency: string;
  previousLabel?: string;
  currentLabel?: string;
}

/**
 * Gross pay by department (redesign canvas: Dashboard, "Gross pay by department").
 *
 * Gross, not "payroll": these are what each department costs in pay. The change is a
 * Variance (rust up, cobalt down, arrow and sign), not a green/red badge: a rise in pay
 * is not a "success". Previous-period figures are ink-muted, current in ink, all in
 * Geist Mono, right-aligned.
 */
export function DepartmentBreakdown({
  departments,
  currency,
  previousLabel,
  currentLabel,
}: DepartmentBreakdownProps) {
  const money = (n: number) => formatCurrency(n, currency);
  const totals = (departments ?? []).reduce(
    (acc, d) => ({
      headcount: acc.headcount + d.headcountCurrent,
      previous: acc.previous + d.totalPrevious,
      current: acc.current + d.totalCurrent,
    }),
    { headcount: 0, previous: 0, current: 0 },
  );
  const totalChange = totals.current - totals.previous;
  const totalPct = totals.previous !== 0 ? (totalChange / totals.previous) * 100 : null;

  return (
    <Panel
      headingId="dept-h"
      title="Gross pay by department"
      description="Which teams drive the change in salary cost."
      actions={
        <Button variant="ghost" size="sm" iconRight="arrow-right" href="/detailed">
          Open Detailed View
        </Button>
      }
    >
      {!departments ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : departments.length === 0 ? (
        <p className="m-0 py-8 text-center text-sm leading-5 text-cv-ink-subtle">
          No departments in this comparison.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-cv-lg border border-cv-line">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">{previousLabel ?? "Previous"}</TableHead>
                <TableHead className="text-right">{currentLabel ?? "Current"}</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.department}>
                  <TableCell className="font-medium">{dept.department}</TableCell>
                  <TableCell className="cv-num">
                    {dept.headcountCurrent}
                    {dept.headcountPrevious !== dept.headcountCurrent && (
                      <span className="text-cv-ink-subtle"> from {dept.headcountPrevious}</span>
                    )}
                  </TableCell>
                  <TableCell className="cv-num text-cv-ink-muted">
                    {money(dept.totalPrevious)}
                  </TableCell>
                  <TableCell className="cv-num">{money(dept.totalCurrent)}</TableCell>
                  <TableCell className="text-right">
                    <Variance
                      value={dept.absoluteChange}
                      percent={dept.percentageChange}
                      format={money}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell>Total</TableCell>
                <TableCell className="cv-num">{totals.headcount}</TableCell>
                <TableCell className="cv-num">{money(totals.previous)}</TableCell>
                <TableCell className="cv-num">{money(totals.current)}</TableCell>
                <TableCell className="text-right">
                  <Variance value={totalChange} percent={totalPct} format={money} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Panel>
  );
}
