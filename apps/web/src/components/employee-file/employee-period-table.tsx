"use client";

import type { Category, EmployeeFlag, EmployeeSlotKind } from "@saas/payroll-core";
import { CATEGORY_LABELS, EMPLOYEE_DEDUCTION_CATEGORIES } from "@saas/payroll-core";
import { Badge, Panel, PanelFoot, Variance } from "@/components/cv";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDays, formatMoney } from "@/components/annual/annual-utils";
import { SLOT_KIND_LABELS, slotKindReason } from "@/components/employee-file/employee-file-text";
import type { PeriodRow } from "@/components/employee-file/employee-chart-data";

/**
 * The period table (step E5, spec 4.4) — the core artefact of the file, on Ink
 * & Signal (canvas board "Employee File: one person").
 *
 * One row per slot in R, in calendar order, **never only the slots with
 * data**. Gross and net carry the *word* for `missing` and `not_paid` — "Not
 * uploaded" and "Not paid" — rather than a figure, with the reason on hover,
 * because the two are different facts: one is unknown, the other is a recorded
 * absence of payment. Neither is ever 0, and `row.gross === null` is what the
 * cell branches on, so no `?? 0` can reintroduce a zero bar's table twin.
 *
 * The rows come from `buildPeriodRows`, the same array the chart is handed, so
 * the table and the chart cannot disagree about a figure.
 */

function flagsFor(flags: readonly EmployeeFlag[], index: number): EmployeeFlag[] {
  return flags.filter((flag) => flag.slotIndex === index);
}

/** The four kinds as the board draws them. A duplicate is a warning, not an error. */
const KIND_BADGE: Record<EmployeeSlotKind, { tone: "neutral" | "warning"; icon?: "alert" }> = {
  actual: { tone: "neutral" },
  duplicate: { tone: "warning", icon: "alert" },
  not_paid: { tone: "neutral" },
  missing: { tone: "neutral" },
};

/**
 * The deduction cell's tooltip, through the money formatter like the cell above
 * it (CLAUDE.md's formatter rule).
 *
 * It used to build `${label}: ${value.toFixed(2)}` by hand, so the cell read
 * `USD 1,220.00` and its own tooltip read `Income tax: 1000.00`. Two decimals
 * is also simply wrong off USD: on KWD it drops the fils and the breakdown stops
 * re-adding to the cell, and on JPY it invents two decimals the currency does
 * not have.
 */
function deductionBreakdown(
  byCategory: Partial<Record<Category, number>> | null,
  currency: string,
): string | undefined {
  if (!byCategory) return undefined;
  const parts = EMPLOYEE_DEDUCTION_CATEGORIES.map((category) => {
    const value = byCategory[category];
    if (value === undefined || value === 0) return null;
    return `${CATEGORY_LABELS[category]}: ${formatMoney(value, currency)}`;
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
  const money = (value: number) => formatMoney(value, currency);
  const duplicates = rows.filter((row) => row.kind === "duplicate");

  return (
    <Panel
      flush
      headingId="employee-periods-h"
      title="Every period in range"
      description="One row per period the range expects, in calendar order. A period nobody uploaded is shown and labelled rather than skipped."
    >
      <div className="overflow-x-auto border-t border-cv-line">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
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
              // The one branch that matters on this screen: a slot with no
              // figure says which kind of nothing it is, and never prints 0.
              const blank = row.gross === null;
              const kindBadge = KIND_BADGE[row.kind];
              const rowFlags = flagsFor(flags, row.index);
              const critical = rowFlags.filter((flag) => flag.severity === "critical").length;
              const warnings = rowFlags.filter((flag) => flag.severity === "warning").length;

              return (
                <TableRow
                  key={row.index}
                  className={cn(
                    row.kind === "duplicate" && "bg-cv-warning-soft hover:bg-cv-warning-soft",
                  )}
                >
                  <TableCell className="whitespace-nowrap font-medium text-cv-ink">
                    {row.fullLabel}
                    {row.mergedRunCount > 1 && (
                      <span
                        className="block text-xs font-normal leading-4 text-cv-ink-subtle"
                        title="Two payroll runs ended in this period — an off-cycle or correction run. The figures are the sum, and this is not a thirteenth period."
                      >
                        {row.mergedRunCount} runs merged
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={kindBadge.tone} icon={kindBadge.icon} title={reason ?? undefined}>
                      {SLOT_KIND_LABELS[row.kind]}
                    </Badge>
                  </TableCell>
                  {/* The word, with the reason on hover — never 0, never blank. */}
                  <TableCell
                    className={cn("text-right", blank ? "text-cv-ink-subtle" : "cv-num")}
                    title={reason ?? undefined}
                  >
                    {row.gross === null ? SLOT_KIND_LABELS[row.kind] : money(row.gross)}
                  </TableCell>
                  <TableCell
                    className={cn("text-right", row.net === null ? "text-cv-ink-subtle" : "cv-num")}
                    title={reason ?? undefined}
                  >
                    {row.net === null ? SLOT_KIND_LABELS[row.kind] : money(row.net)}
                  </TableCell>
                  {/* The derived lines follow gross: on an unpaid slot they are
                      unknown together, so they take a dash with the same reason
                      rather than repeating the word five more times. */}
                  <TableCell
                    className={cn(
                      "text-right",
                      row.recurring === null ? "text-cv-ink-subtle" : "cv-num",
                    )}
                    title={row.recurring === null ? (reason ?? undefined) : undefined}
                  >
                    {row.recurring === null ? "—" : money(row.recurring)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.variable === null ? "text-cv-ink-subtle" : "cv-num",
                    )}
                    title={row.variable === null ? (reason ?? undefined) : undefined}
                  >
                    {row.variable === null ? "—" : money(row.variable)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      row.deductions === null ? "text-cv-ink-subtle" : "cv-num",
                    )}
                    title={
                      row.deductions === null
                        ? (reason ?? undefined)
                        : deductionBreakdown(row.byCategory, currency)
                    }
                  >
                    {row.deductions === null ? "—" : money(row.deductions)}
                  </TableCell>
                  {anyAbsenceDays && (
                    <TableCell
                      className={cn(
                        "text-right",
                        row.absenceDays === null ? "text-cv-ink-subtle" : "cv-num",
                      )}
                    >
                      {row.absenceDays === null ? "—" : formatDays(row.absenceDays)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {row.deltaGross === null ? (
                      <span
                        className="text-cv-ink-subtle"
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
                          <span className="ml-1 text-xs leading-4">spans a gap</span>
                        )}
                      </span>
                    ) : (
                      /* A signed movement: arrow, sign and colour, with the
                         amount through the money formatter. Rust is up because
                         on a payroll bill up is the thing to look at. */
                      <Variance
                        value={row.deltaGross}
                        percent={row.deltaPct}
                        format={money}
                        className="justify-end"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {rowFlags.length === 0 ? (
                      <span className="text-cv-ink-subtle">—</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={rowFlags.map((flag) => flag.description).join(" · ")}
                      >
                        {critical > 0 && (
                          <Badge tone="danger" icon="alert">
                            {critical} critical
                          </Badge>
                        )}
                        {warnings > 0 && <Badge tone="signal">{warnings} warning</Badge>}
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
      {duplicates.length > 0 && (
        <PanelFoot className="flex-col items-start gap-1 text-sm leading-5">
          {duplicates.map((row) => (
            <p key={row.index} className="m-0 text-cv-ink-muted">
              <span className="font-medium text-cv-ink">{row.fullLabel}:</span>{" "}
              {slotKindReason("duplicate", row.rowCount)}
            </p>
          ))}
        </PanelFoot>
      )}
    </Panel>
  );
}
