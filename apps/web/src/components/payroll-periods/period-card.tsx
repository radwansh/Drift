"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, Upload, Link, MoreHorizontal, Trash2, ArrowLeftRight, Users, DollarSign } from "lucide-react";
import type { PayrollPeriod } from "@saas/types";
import { formatDate, formatDateRange, formatPeriodLabel } from "@/lib/date";
import { formatCurrency } from "@/lib/utils";

const PERIOD_TYPE_ICONS: Record<string, React.ReactNode> = {
  monthly: <CalendarDays className="h-5 w-5" />,
  weekly: <CalendarDays className="h-5 w-5" />,
  bi_monthly: <CalendarDays className="h-5 w-5" />,
  bi_weekly: <CalendarDays className="h-5 w-5" />,
};

const STATUS_CONFIG: Record<string, { label: string; variant: "info" | "success" | "destructive" }> = {
  processing: { label: "Processing", variant: "info" },
  ready: { label: "Ready", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

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

interface PeriodCardProps {
  period: PayrollPeriod;
  check?: PeriodCheck;
  onDelete: (id: string) => void;
  onCompare: (id: string) => void;
}

export function PeriodCard({ period, check, onDelete, onCompare }: PeriodCardProps) {
  const statusCfg = STATUS_CONFIG[period.status] ?? { label: period.status, variant: "info" as const };
  const typeIcon = PERIOD_TYPE_ICONS[period.periodType] ?? <CalendarDays className="h-5 w-5" />;

  const checkBadge =
    check === undefined || check.balanced === null
      ? null
      : check.balanced
        ? { label: "Reconciled", variant: "success" as const, title: "Both totals tie out." }
        : {
            label: "Does not reconcile",
            variant: "destructive" as const,
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

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            {period.source === "integration" ? (
              <Link className="h-5 w-5" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold leading-none">
              {formatPeriodLabel(period.periodType, period.dateRange.from, period.dateRange.to)}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateRange(period.dateRange.from, period.dateRange.to)}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCompare(period.id)}>
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Compare
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(period.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            {/*
              Step 4, display only: the gate is the wizard, and this says
              whether a period already in the database would pass it.
            */}
            {checkBadge && (
              <Badge variant={checkBadge.variant} title={checkBadge.title}>
                {checkBadge.label}
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" />
            {formatDate(period.createdAt)}
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Employees
            </span>
            <span className="font-medium tabular-nums">{period.totalEmployees}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Gross
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(period.totalGross, period.currencyCode)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-3 text-xs text-muted-foreground">
        {period.source === "integration" ? "Integrated via API" : `Uploaded: ${period.sourceFilename ?? "Unknown file"}`}
      </CardFooter>
    </Card>
  );
}

export function PeriodCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardHeader>
      <CardContent className="pb-3 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-3">
        <Skeleton className="h-3 w-36" />
      </CardFooter>
    </Card>
  );
}
