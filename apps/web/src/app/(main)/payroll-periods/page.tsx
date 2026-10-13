"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import type { PayrollPeriod, PeriodType, PeriodStatus, CurrencyCode } from "@saas/types";
import { trpc } from "@/lib/trpc";
import { PeriodCard, PeriodCardSkeleton } from "@/components/payroll-periods/period-card";
import { UploadModal } from "@/components/payroll-periods/upload-modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Search, Filter, SlidersHorizontal, Upload, Trash2, AlertTriangle } from "lucide-react";
import { usePayrollStore } from "@/lib/payroll-store";

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

  /** The server returns period_start/period_end; the card wants a dateRange. */
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payroll Periods</h2>
          <p className="text-muted-foreground mt-1">
            Manage and view all your payroll periods
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyPeriods && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearConfirmOpen(true)}
              disabled={deleteAllMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
          <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search periods..."
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
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="bi_monthly">Bi-Monthly</SelectItem>
            <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SlidersHorizontal className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQuery.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load your payroll periods</AlertTitle>
          <AlertDescription>{listQuery.error.message}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PeriodCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredPeriods.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <div className="rounded-full bg-muted p-4">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No periods found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasAnyPeriods
              ? "No periods match your current filters."
              : "Upload your first payroll period to get started."}
          </p>
          {!hasAnyPeriods && (
            <Button className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload New Period
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPeriods.map((period) => (
              <PeriodCard
                key={period.id}
                period={period}
                onDelete={(id) => setDeleteId(id)}
                onCompare={handleCompare}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pageCount} · {total} period{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || listQuery.isFetching}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount || listQuery.isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Period</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payroll period? All associated
              employee data will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Payroll Periods</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all payroll periods and associated
              employee data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClearConfirmOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
