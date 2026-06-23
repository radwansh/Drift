"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PayrollPeriod, PeriodType, PeriodStatus } from "@saas/types";
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
import { Search, Filter, SlidersHorizontal, Upload } from "lucide-react";
import { usePayrollStore } from "@/lib/payroll-store";

function buildMockPeriods(): PayrollPeriod[] {
  return [
    {
      id: "1", companyId: "c1", periodType: "monthly",
      dateRange: { from: "2026-06-01", to: "2026-06-30" },
      source: "upload", sourceFilename: "payroll_jun2026.csv",
      currencyCode: "USD", status: "ready",
      totalEmployees: 16, totalGross: 1620000, totalNet: 1182000,
      rawFileKey: null, errorMessage: null,
      createdAt: "2026-06-21T00:00:00Z", updatedAt: "2026-06-21T00:00:00Z",
    },
    {
      id: "2", companyId: "c1", periodType: "monthly",
      dateRange: { from: "2026-05-01", to: "2026-05-31" },
      source: "upload", sourceFilename: "payroll_may2026.xlsx",
      currencyCode: "USD", status: "ready",
      totalEmployees: 16, totalGross: 1550000, totalNet: 1130000,
      rawFileKey: null, errorMessage: null,
      createdAt: "2026-05-21T00:00:00Z", updatedAt: "2026-05-21T00:00:00Z",
    },
    {
      id: "3", companyId: "c1", periodType: "monthly",
      dateRange: { from: "2026-04-01", to: "2026-04-30" },
      source: "integration", sourceFilename: null,
      currencyCode: "USD", status: "ready",
      totalEmployees: 15, totalGross: 1480000, totalNet: 1080000,
      rawFileKey: null, errorMessage: null,
      createdAt: "2026-04-22T00:00:00Z", updatedAt: "2026-04-22T00:00:00Z",
    },
    {
      id: "4", companyId: "c1", periodType: "bi_weekly",
      dateRange: { from: "2026-06-08", to: "2026-06-21" },
      source: "upload", sourceFilename: "payroll_biweekly_jun21.xlsx",
      currencyCode: "USD", status: "processing",
      totalEmployees: 16, totalGross: 810000, totalNet: 590000,
      rawFileKey: null, errorMessage: null,
      createdAt: "2026-06-21T00:00:00Z", updatedAt: "2026-06-21T00:00:00Z",
    },
    {
      id: "5", companyId: "c1", periodType: "monthly",
      dateRange: { from: "2026-03-01", to: "2026-03-31" },
      source: "integration", sourceFilename: null,
      currencyCode: "USD", status: "error",
      totalEmployees: 15, totalGross: 1500000, totalNet: 1090000,
      rawFileKey: null, errorMessage: "Failed to parse salary data for 2 employees",
      createdAt: "2026-03-20T00:00:00Z", updatedAt: "2026-03-20T00:00:00Z",
    },
    {
      id: "6", companyId: "c1", periodType: "monthly",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      source: "upload", sourceFilename: "payroll_feb2026.csv",
      currencyCode: "USD", status: "ready",
      totalEmployees: 14, totalGross: 1420000, totalNet: 1040000,
      rawFileKey: null, errorMessage: null,
      createdAt: "2026-02-20T00:00:00Z", updatedAt: "2026-02-20T00:00:00Z",
    },
  ];
}

export default function PayrollPeriodsPage() {
  const router = useRouter();
  const { periods: storePeriods, removePeriod } = usePayrollStore();
  const [mockPeriods, setMockPeriods] = useState<PayrollPeriod[]>(buildMockPeriods());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodTypeFilter, setPeriodTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const allPeriods = useMemo(() => {
    const storeAsPayroll: PayrollPeriod[] = storePeriods.map((sp) => ({
      id: sp.id,
      companyId: "c1",
      periodType: sp.periodType as PeriodType,
      dateRange: { from: sp.dateFrom, to: sp.dateTo },
      source: "upload" as const,
      sourceFilename: sp.fileName,
      currencyCode: "USD",
      status: "ready" as PeriodStatus,
      totalEmployees: sp.employees.length,
      totalGross: sp.employees.reduce((sum, e) => sum + e.grossSalary, 0),
      totalNet: sp.employees.reduce((sum, e) => sum + e.netSalary, 0),
      rawFileKey: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const seenLabels = new Set(storePeriods.map((sp) => `${sp.dateFrom}-${sp.dateTo}`));
    const filteredMock = mockPeriods.filter(
      (mp) => !seenLabels.has(`${mp.dateRange.from}-${mp.dateRange.to}`),
    );
    return [...storeAsPayroll, ...filteredMock];
  }, [storePeriods, mockPeriods]);

  const filteredPeriods = useMemo(() => {
    let filtered = allPeriods;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => {
        const label = `${p.dateRange.from} ${p.dateRange.to}`.toLowerCase();
        return label.includes(q) || p.sourceFilename?.toLowerCase().includes(q);
      });
    }
    if (periodTypeFilter !== "all") {
      filtered = filtered.filter((p) => p.periodType === periodTypeFilter);
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }
    return filtered;
  }, [allPeriods, searchQuery, periodTypeFilter, statusFilter]);

  const handleDelete = () => {
    if (!deleteId) return;
    const target = allPeriods.find((p) => p.id === deleteId);
    if (target && storePeriods.some((sp) => sp.id === target.id)) {
      removePeriod(deleteId);
    } else {
      setMockPeriods((prev) => prev.filter((p) => p.id !== deleteId));
    }
    setDeleteId(null);
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
        <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search periods..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={periodTypeFilter} onValueChange={setPeriodTypeFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
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
            {allPeriods.length === 0
              ? "Upload your first payroll period to get started."
              : "No periods match your current filters."}
          </p>
          {allPeriods.length === 0 && (
            <Button className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload New Period
            </Button>
          )}
        </div>
      ) : (
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
    </div>
  );
}
