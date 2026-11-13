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
import { Notice } from "@/components/cv";
import { formatCount, formatMoney } from "@/components/annual/annual-utils";
import { ScrollShadow } from "@/components/annual/scroll-shadow";

interface AnnualDrilldownProps {
  summary: AnnualSummary;
  /** Department to drill into, or null to close. */
  department: string | null;
  onClose: () => void;
}

/**
 * Drill-down (step 44), on Ink & Signal.
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

        <div className="flex flex-col gap-4">
          {forbidden ? (
            <Notice tone="info" title="Employee-level figures are visible to admins only">
              The department totals above are available to everyone with access to this dashboard.
            </Notice>
          ) : employees.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : employees.isError ? (
            <p className="m-0 text-sm leading-5 text-cv-ink-muted">
              Could not load employee figures for this department.
            </p>
          ) : (
            <ScrollShadow className="rounded-cv-lg border border-cv-line">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 top-0 z-30 bg-cv-surface-sunken">
                      Employee
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken">
                      Department
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                      Periods
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                      Gross
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                      Net
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employees.data?.employees ?? []).map((e) => (
                    <TableRow key={e.employeeExternalId}>
                      <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-cv-surface font-medium text-cv-ink">
                        {e.employeeName ?? e.employeeExternalId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{e.department}</TableCell>
                      <TableCell className="cv-num">{formatCount(e.periodCount)}</TableCell>
                      <TableCell className="cv-num">
                        {formatMoney(e.gross, summary.currency)}
                      </TableCell>
                      <TableCell className="cv-num">
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
