"use client";

import { trpc } from "@/lib/trpc";
import type { AnnualSummary } from "@saas/payroll-core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";
import { formatCount, formatMoney } from "@/components/annual/annual-utils";
import { ScrollShadow } from "@/components/annual/scroll-shadow";

interface AnnualDrilldownProps {
  summary: AnnualSummary;
  /** Department to drill into, or null to close. */
  department: string | null;
  onClose: () => void;
}

/**
 * Drill-down (step 44).
 *
 * A department opens its periods, which any member may see — they are the same
 * aggregates already on the page. Employee-level rows come from a separate
 * admin-only procedure, so a viewer (and a manager) simply never receives them:
 * the gate is server-side, not a hidden section.
 */
export function AnnualDrilldown({ summary, department, onClose }: AnnualDrilldownProps) {
  const open = department !== null;

  const employees = trpc.annual.drillDownEmployees.useQuery(
    {
      year: summary.year,
      periodType: summary.periodType,
      currency: summary.currency,
      department: department ?? undefined,
      limit: 200,
    },
    { enabled: open, retry: false },
  );

  const dept = summary.departments.find((d) => d.department === department);
  const forbidden = employees.error?.data?.code === "FORBIDDEN";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{department}</DialogTitle>
          <DialogDescription>
            {dept
              ? `${formatMoney(dept.actual, summary.currency)} to date across an average headcount of ${dept.avgHeadcount.toFixed(1)}.`
              : "Department detail."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {forbidden ? (
            <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Employee-level figures are visible to admins only. The department totals above are
                available to everyone with access to this dashboard.
              </p>
            </div>
          ) : employees.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : employees.isError ? (
            <p className="text-sm text-muted-foreground">
              Could not load employee figures for this department.
            </p>
          ) : (
            <ScrollShadow>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 top-0 z-30 bg-background">Employee</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background">Department</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background text-right">Periods</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background text-right">Gross</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-background text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employees.data?.employees ?? []).map((e) => (
                    <TableRow key={e.employeeExternalId}>
                      <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background font-medium">
                        {e.employeeName ?? e.employeeExternalId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{e.department}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCount(e.periodCount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(e.gross, summary.currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(e.net, summary.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollShadow>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
