"use client";

import type { Category, EmployeeFlag } from "@saas/payroll-core";
import {
  CATEGORY_LABELS,
  EMPLOYEE_DEDUCTION_CATEGORIES,
} from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDays, formatMoney, formatSignedPct } from "@/components/annual/annual-utils";
import {
  SLOT_KIND_LABELS,
  slotKindReason,
} from "@/components/employee-file/employee-file-text";
import type { PeriodRow } from "@/components/employee-file/employee-chart-data";

/**
 * The period table (step E5, spec 4.4) — the core artefact of the file.
 *
 * One row per slot in R, in calendar order, **never only the slots with
 * data**. Gross and net are blank for `missing` and `not_paid`, with the reason
 * on hover, because the two are different facts: one is unknown, the other is a
 * recorded absence of payment.
 *
 * The rows come from `buildPeriodRows`, the same array the chart is handed, so
 * the table and the chart cannot disagree about a figure.
 */

function flagsFor(flags: readonly EmployeeFlag[], index: number): EmployeeFlag[] {
  return flags.filter((flag) => flag.slotIndex === index);
}

function deductionBreakdown(
  byCategory: Partial<Record<Category, number>> | null,
): string | undefined {
  if (!byCategory) return undefined;
  const parts = EMPLOYEE_DEDUCTION_CATEGORIES.map((category) => {
    const value = byCategory[category];
    if (value === undefined || value === 0) return null;
    return `${CATEGORY_LABELS[category]}: ${value.toFixed(2)}`;
  }).filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function EmployeePeriodTable({
  rows,
  flags,
  currency,
}: {
  rows: readonly PeriodRow[];
  flags: readonly EmployeeFlag[];
  currency: string;
}) {
  // The absence column renders only when a register in scope actually maps a
  // days column: an always-blank column is worse than no column, and a days
  // figure inferred from a category is worse than both.
  const anyAbsenceDays = rows.some((row) => row.absenceDays !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Every period in range</CardTitle>
        <CardDescription>
          One row per period the range expects, in calendar order. A period nobody uploaded is
          shown and labelled rather than skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Recurring</TableHead>
                <TableHead className="text-right">Variable</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                {anyAbsenceDays && <TableHead className="text-right">Absence</TableHead>}
                <TableHead className="text-right">Δ gross</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const reason = slotKindReason(row.kind, row.rowCount);
                const blank = row.gross === null;
                const rowFlags = flagsFor(flags, row.index);
                const critical = rowFlags.filter((flag) => flag.severity === "critical").length;
                const warnings = rowFlags.filter((flag) => flag.severity === "warning").length;

                return (
                  <TableRow key={row.index} className={cn(blank && "text-muted-foreground")}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {row.fullLabel}
                      {row.mergedRunCount > 1 && (
                        <span
                          className="block text-xs font-normal text-muted-foreground"
                          title="Two payroll runs ended in this period — an off-cycle or correction run. The figures are the sum, and this is not a thirteenth period."
                        >
                          {row.mergedRunCount} runs merged
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.kind === "actual"
                            ? "secondary"
                            : row.kind === "duplicate"
                              ? "destructive"
                              : "outline"
                        }
                        className="font-normal"
                        title={reason ?? undefined}
                      >
                        {SLOT_KIND_LABELS[row.kind]}
                      </Badge>
                    </TableCell>
                    {/* Blank, with the reason on hover — never 0. */}
                    <TableCell className="text-right tabular-nums" title={reason ?? undefined}>
                      {row.gross === null ? "" : formatMoney(row.gross, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" title={reason ?? undefined}>
                      {row.net === null ? "" : formatMoney(row.net, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.recurring === null ? "" : formatMoney(row.recurring, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.variable === null ? "" : formatMoney(row.variable, currency)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={deductionBreakdown(row.byCategory)}
                    >
                      {row.deductions === null ? "" : formatMoney(row.deductions, currency)}
                    </TableCell>
                    {anyAbsenceDays && (
                      <TableCell className="text-right tabular-nums">
                        {row.absenceDays === null ? "" : formatDays(row.absenceDays)}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {row.deltaGross === null ? (
                        <span
                          title={
                            row.spansGap
                              ? `Spans a gap: ${row.gapLabels.join(", ")} ${
                                  row.gapLabels.length === 1 ? "was" : "were"
                                } never uploaded, so this is not one period's movement.`
                              : row.kind === "duplicate"
                                ? "Excluded: a period with duplicate rows is left out of every delta."
                                : undefined
                          }
                        >
                          —
                          {row.spansGap && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide">
                              spans a gap
                            </span>
                          )}
                        </span>
                      ) : (
                        <>
                          {formatMoney(row.deltaGross, currency)}
                          <span className="block text-xs text-muted-foreground">
                            {formatSignedPct(row.deltaPct)}
                          </span>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {rowFlags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs"
                          title={rowFlags.map((flag) => flag.description).join(" · ")}
                        >
                          {critical > 0 && (
                            <Badge variant="destructive" className="font-normal">
                              {critical} critical
                            </Badge>
                          )}
                          {warnings > 0 && (
                            <Badge variant="outline" className="font-normal">
                              {warnings} warning
                            </Badge>
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* The duplicate wording in full, once, below the table: it is an
            ambiguity that has to be stated rather than implied. */}
        {rows.some((row) => row.kind === "duplicate") && (
          <div className="border-t p-4 text-sm">
            {rows
              .filter((row) => row.kind === "duplicate")
              .map((row) => (
                <p key={row.index} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{row.fullLabel}:</span>{" "}
                  {slotKindReason("duplicate", row.rowCount)}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
