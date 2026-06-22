"use client";

import { trpc } from "@/lib/trpc";
import type { PayrollPeriod } from "@saas/types";

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
      rawFileKey: null, errorMessage: "Failed to parse salary data",
      createdAt: "2026-03-20T00:00:00Z", updatedAt: "2026-03-20T00:00:00Z",
    },
  ];
}

export interface PeriodFilters {
  periodType?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function usePeriods(filters?: PeriodFilters) {
  const query = trpc.payrollPeriods.list.useQuery(
    {
      periodType: filters?.periodType as any,
      status: filters?.status as any,
      search: filters?.search,
      page: filters?.page ?? 1,
      pageSize: filters?.pageSize ?? 20,
    },
    { enabled: false },
  );

  const data = query.data?.data ?? buildMockPeriods();

  return {
    data,
    total: query.data?.total ?? data.length,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

export function usePeriod(id: string) {
  const mockPeriods = buildMockPeriods();
  const mock = mockPeriods.find((p) => p.id === id) ?? null;

  const query = trpc.payrollPeriods.getById.useQuery(
    { id },
    { enabled: false },
  );

  return {
    data: query.data ?? mock,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
