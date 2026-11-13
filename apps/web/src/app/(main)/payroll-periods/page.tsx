"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import type { PayrollPeriod, PeriodType, PeriodStatus, CurrencyCode } from "@saas/types";
import { trpc } from "@/lib/trpc";
import {
  PeriodRow,
  PeriodRowSkeleton,
  PERIOD_COLUMN_COUNT,
} from "@/components/payroll-periods/period-row";
import { UploadModal } from "@/components/payroll-periods/upload-modal";
import {
  Button,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  Panel,
  PanelBar,
  PanelFoot,
} from "@/components/cv";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatPeriodLabel } from "@/lib/date";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

const PAGE_SIZE = 20;

/**
 * Step 4 of docs/ANNUAL_PAGE_FIX_PLAN.md.
 *
 * This page used to map the in-memory `usePayrollStore` and invent the fields
 * it could not know — `companyId: "c1"`, `status: "ready"`, `currencyCode:
 * "USD"` — so nothing survived a reload and the status badge was always a
 * fiction. It now reads `payrollPeriods.list`, which is scoped by company and
 * paginated server-side, and the filters and search run in SQL rather than
 * over whatever happened to be in memory.
 *
 * The Ink & Signal rebuild (canvas board "Payroll periods") is presentation
 * only: `PageHeader`, one bordered toolbar row, and the periods in a
 * `Panel flush` — a table where there were cards — with the count in its
 * `PanelBar` and pagination in its `PanelFoot`. Same query, same filters, same
 * mutations, same confirmations.
 *
 * Two labels changed, deliberately. **"Clear All" became two separate
 * controls**: the board puts a ghost "Clear all" in the toolbar, which on
 * every other screen in this app resets the filters — and this screen's old
 * "Clear All" deleted every payroll period the company had. Two controls one
 * word apart, one of them irreversible, is how a register gets deleted by
 * somebody who meant to clear a search box. The toolbar's "Clear all" resets
 * the three filters; the destructive one is in the header, says "Delete all
 * periods", and keeps its confirmation. And the search box says "Search by
 * file name", because `payrollPeriods.list` searches `source_filename` and
 * nothing else — "Search periods…" promised a match on "July 2026" that the
 * query cannot make.
 */
export default function PayrollPeriodsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [periodTypeFilter, setPeriodTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = trpc.payrollPeriods.list.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: searchQuery.trim() || undefined,
      periodType: periodTypeFilter === "all" ? undefined : (periodTypeFilter as PeriodType),
      status: statusFilter === "all" ? undefined : (statusFilter as PeriodStatus),
    },
    { placeholderData: keepPreviousData },
  );

  const loading = listQuery.isLoading;
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = async () => {
    await utils.payrollPeriods.list.invalidate();
  };

  const deleteMutation = trpc.payrollPeriods.delete.useMutation({
    onSuccess: refresh,
    onError: (error) => setActionError(error.message),
  });

  const deleteAllMutation = trpc.payrollPeriods.deleteAll.useMutation({
    onSuccess: async () => {
      setPage(1);
      await refresh();
    },
    onError: (error) => setActionError(error.message),
  });

  /** The server returns period_start/period_end; the row wants a dateRange. */
  const filteredPeriods = useMemo<PayrollPeriod[]>(() => {
    const rows = listQuery.data?.data ?? [];
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      periodType: row.periodType as PeriodType,
      dateRange: { from: row.periodStart, to: row.periodEnd },
      source: row.source as "upload" | "integration",
      sourceFilename: row.sourceFilename,
      currencyCode: row.currencyCode as CurrencyCode,
      status: row.status as PeriodStatus,
      totalEmployees: row.totalEmployees ?? 0,
      totalGross: Number(row.totalGross ?? 0),
      totalNet: Number(row.totalNet ?? 0),
      rawFileKey: row.rawFileKey,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }, [listQuery.data]);

  const hasAnyPeriods = total > 0;

  /**
   * Whether the three filters are narrowing the set.
   *
   * `total` is the *filtered* count, so it cannot tell "no periods at all"
   * from "none match these filters" — which is why the old empty state's
   * "No periods match your current filters" branch was unreachable and
   * everyone with a filter on was told to upload their first file. The filter
   * state knows, so it is what the message branches on.
   */
  const filtersActive =
    searchQuery.trim() !== "" || periodTypeFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setPeriodTypeFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setActionError(null);
    deleteMutation.mutate({ id: deleteId });
    setDeleteId(null);
  };

  const handleClearAll = () => {
    setActionError(null);
    deleteAllMutation.mutate();
    setClearConfirmOpen(false);
  };

  const handleCompare = (id: string) => {
    router.push(`/dashboard?periodId=${encodeURIComponent(id)}`);
  };

  /** The confirmation names the period, rather than "this payroll period". */
  const periodBeingDeleted = filteredPeriods.find((period) => period.id === deleteId);
  const deleteTitle = periodBeingDeleted
    ? `Delete ${formatPeriodLabel(
        periodBeingDeleted.periodType,
        periodBeingDeleted.dateRange.from,
        periodBeingDeleted.dateRange.to,
      )}?`
    : "Delete this payroll period?";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Payroll periods"
        title="Every period on record"
        lede="One payroll file per period, with what it totalled and whether its two balancing lines tie out."
        actions={
          hasAnyPeriods ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft="trash"
              onClick={() => setClearConfirmOpen(true)}
              disabled={deleteAllMutation.isPending}
            >
              Delete all periods
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-cv-lg border border-cv-line bg-cv-surface px-4 py-3">
        <div className="relative min-w-[16rem] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cv-ink-subtle"
          />
          <Input
            placeholder="Search by file name"
            aria-label="Search by file name"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={periodTypeFilter}
          onValueChange={(v) => {
            setPeriodTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Cadence" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cadences</SelectItem>
            {Object.entries(PERIOD_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Status" className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}

        <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      </div>

      {listQuery.error && (
        <Notice tone="danger" title="Could not load your payroll periods">
          {listQuery.error.message}
        </Notice>
      )}

      {actionError && (
        <Notice tone="danger" title="That did not work">
          {actionError}
        </Notice>
      )}

      <Panel flush>
        <PanelBar className="justify-between">
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">
            {loading
              ? "Listing your payroll periods…"
              : `${total} period${total === 1 ? "" : "s"}${filtersActive ? " matching these filters" : ""}`}
          </p>
        </PanelBar>

        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Period</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Cadence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross pay</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <PeriodRowSkeleton key={i} />)
              ) : filteredPeriods.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={PERIOD_COLUMN_COUNT} className="p-0">
                    {filtersActive ? (
                      <EmptyState
                        bare
                        title="No periods match these filters"
                        description="Clear them to see every period on record."
                        action={
                          <Button variant="secondary" onClick={clearFilters}>
                            Clear all
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        bare
                        title="No payroll periods yet"
                        description="Upload your first payroll file to compare it with the next one."
                        action={
                          <Button iconLeft="upload" onClick={() => setUploadOpen(true)}>
                            Upload period
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPeriods.map((period) => (
                  <PeriodRow
                    key={period.id}
                    period={period}
                    check={listQuery.data?.checks[period.id]}
                    onDelete={(id) => setDeleteId(id)}
                    onCompare={handleCompare}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pageCount > 1 && (
          <PanelFoot>
            <p className="m-0">
              Page {page} of {pageCount} · {total} period{total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || listQuery.isFetching}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount || listQuery.isFetching}
              >
                Next
              </Button>
            </div>
          </PanelFoot>
        )}
      </Panel>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Every employee row this period carries is removed with it, and nothing recovers it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-cv-danger text-cv-on-danger hover:bg-cv-danger-hover"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all payroll periods?</AlertDialogTitle>
            <AlertDialogDescription>
              Every period and every employee row behind it is removed, for the whole company.
              Nothing recovers it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClearConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-cv-danger text-cv-on-danger hover:bg-cv-danger-hover"
            >
              Delete all periods
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
