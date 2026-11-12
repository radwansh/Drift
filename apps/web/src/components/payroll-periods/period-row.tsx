"use client";

import { ArrowLeftRight, Link as LinkIcon, MoreHorizontal, Trash2, Upload } from "lucide-react";
import type { PayrollPeriod } from "@saas/types";
import { Badge, Button } from "@/components/cv";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatDateRange, formatPeriodLabel } from "@/lib/date";
import { formatCurrency } from "@/lib/utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

/**
 * One payroll period, as a table row (canvas board "Payroll periods").
 *
 * This was `PeriodCard`: a card in a three-column grid. The board lists the
 * periods in a table — Period · Dates · Cadence · Status · Employees · Gross
 * pay · Uploaded · File · Actions — so each card's content moved into a cell
 * and nothing was dropped on the way:
 *
 * - the card's source icon tile (upload vs integration) is the icon in the
 *   File cell, beside the filename it already carried;
 * - the status and reconciliation badges keep their words, their icons and the
 *   reconciliation tooltip verbatim;
 * - the overflow menu keeps Compare and Delete.
 *
 * The one thing the card said that a row cannot is "Does not reconcile" in
 * crimson: the token map reads that badge by meaning, and a register that does
 * not tie out is a warning to look at, not a system error. It is a warning
 * tone with the alert icon and the same sentence on hover.
 */

/**
 * Step 4: whether this period's two balancing lines are zero.
 *
 * `balanced: null` is "not checked", not "passed" — a period with no
 * `period_component_totals` rows has nothing to judge from, and a green tick on
 * it would be a claim nobody verified. Periods written after step 4 all
 * reconcile, because the gate would not have let them in; this exists for the
 * history that predates it.
 */
export interface PeriodCheck {
  balanced: boolean | null;
  earningsBalance: number;
  balance: number;
}

interface PeriodRowProps {
  period: PayrollPeriod;
  check?: PeriodCheck;
  onDelete: (id: string) => void;
  onCompare: (id: string) => void;
}

/** The columns this row fills, so the skeleton and the empty row stay in step. */
export const PERIOD_COLUMN_COUNT = 9;

export function PeriodRow({ period, check, onDelete, onCompare }: PeriodRowProps) {
  const reconciliation =
    check === undefined || check.balanced === null
      ? null
      : check.balanced
        ? {
            label: "Reconciled",
            tone: "success" as const,
            icon: "check" as const,
            title: "Both totals tie out.",
          }
        : {
            label: "Does not reconcile",
            tone: "warning" as const,
            icon: "alert" as const,
            title: [
              check.earningsBalance !== 0
                ? `Earnings are ${formatCurrency(Math.abs(check.earningsBalance), period.currencyCode)} off gross.`
                : null,
              check.balance !== 0
                ? `${formatCurrency(Math.abs(check.balance), period.currencyCode)} of the gap between gross and net is unexplained.`
                : null,
            ]
              .filter(Boolean)
              .join(" "),
          };

  const periodLabel = formatPeriodLabel(
    period.periodType,
    period.dateRange.from,
    period.dateRange.to,
  );

  return (
    <TableRow>
      <TableCell className="font-semibold text-cv-ink">{periodLabel}</TableCell>
      <TableCell className="whitespace-nowrap text-cv-ink-muted">
        {formatDateRange(period.dateRange.from, period.dateRange.to)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-cv-ink-muted">
        {PERIOD_TYPE_LABELS[period.periodType] ?? period.periodType}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={period.status} />
          {/*
            Step 4, display only: the gate is the wizard, and this says
            whether a period already in the database would pass it.
          */}
          {reconciliation && (
            <Badge
              tone={reconciliation.tone}
              icon={reconciliation.icon}
              title={reconciliation.title}
            >
              {reconciliation.label}
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="cv-num text-right">{period.totalEmployees}</TableCell>
      <TableCell className="cv-num text-right">
        {formatCurrency(period.totalGross, period.currencyCode)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-cv-ink-muted">
        {formatDate(period.createdAt)}
      </TableCell>
      <TableCell className="max-w-[16rem] text-cv-ink-muted">
        <span className="flex items-center gap-1.5">
          {period.source === "integration" ? (
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-cv-ink-subtle" aria-hidden="true" />
          ) : (
            <Upload className="h-3.5 w-3.5 shrink-0 text-cv-ink-subtle" aria-hidden="true" />
          )}
          <span className="truncate font-cv-mono text-xs">
            {period.source === "integration"
              ? "Integrated via API"
              : (period.sourceFilename ?? "Unknown file")}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" iconOnly icon={<MoreHorizontal />}>
              {`Actions for ${periodLabel}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCompare(period.id)}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Compare
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(period.id)}
              className="text-cv-danger-ink focus:text-cv-danger-ink"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function PeriodRowSkeleton() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell>
        <Skeleton className="h-4 w-28" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-[22px] w-24 rounded-cv-sm" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-10" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-8 w-8 rounded-cv-md" />
      </TableCell>
    </TableRow>
  );
}
