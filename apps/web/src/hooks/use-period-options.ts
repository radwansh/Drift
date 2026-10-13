"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatPeriodLabel } from "@/lib/date";

export interface PeriodOption {
  id: string;
  label: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * The company's ready periods, oldest first, for the comparison pickers
 * (step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md).
 *
 * Both the dashboard and the detailed view used to read `usePayrollStore`,
 * which held whatever had been uploaded in the current tab and nothing else —
 * so a reload emptied them and a period loaded from the server could not be
 * compared at all. They now share this query.
 *
 * Only `ready` periods are offered: a period is marked ready after its
 * snapshots and aggregates are written, so anything else has nothing to
 * compare.
 */
export function usePeriodOptions(periodType?: string) {
  const query = trpc.payrollPeriods.list.useQuery({
    page: 1,
    pageSize: 100,
    status: "ready",
    periodType: periodType as never,
  });

  const periods = useMemo<PeriodOption[]>(() => {
    const rows = query.data?.data ?? [];
    return rows
      .map((row) => ({
        id: row.id,
        label: formatPeriodLabel(row.periodType, row.periodStart, row.periodEnd),
        periodType: row.periodType,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      }))
      // `list` orders by createdAt desc; chronological order is what the
      // "previous -> current" pickers need.
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  }, [query.data]);

  return { periods, isLoading: query.isLoading, error: query.error };
}
