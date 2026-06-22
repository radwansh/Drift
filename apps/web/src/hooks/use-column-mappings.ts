"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { suggestColumnMappings } from "@saas/ai";
import type { ColumnMapping } from "@saas/types";

const mockMappings: ColumnMapping[] = [
  {
    id: "m1", companyId: "c1", sourceColumn: "Employee ID", mappedComponent: "employee_id",
    isEmployeeId: true, isEmployeeName: false, isDepartment: false,
    isGrossSalary: false, isNetSalary: false, isAiSuggested: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2", companyId: "c1", sourceColumn: "Full Name", mappedComponent: "employee_name",
    isEmployeeId: false, isEmployeeName: true, isDepartment: false,
    isGrossSalary: false, isNetSalary: false, isAiSuggested: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "m3", companyId: "c1", sourceColumn: "Department", mappedComponent: "department",
    isEmployeeId: false, isEmployeeName: false, isDepartment: true,
    isGrossSalary: false, isNetSalary: false, isAiSuggested: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "m4", companyId: "c1", sourceColumn: "Gross Pay", mappedComponent: "gross_salary",
    isEmployeeId: false, isEmployeeName: false, isDepartment: false,
    isGrossSalary: true, isNetSalary: false, isAiSuggested: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "m5", companyId: "c1", sourceColumn: "Net Pay", mappedComponent: "net_salary",
    isEmployeeId: false, isEmployeeName: false, isDepartment: false,
    isGrossSalary: false, isNetSalary: true, isAiSuggested: false,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

export function useColumnMappings(companyId?: string) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(mockMappings);
  const [isMapping, setIsMapping] = useState(false);

  const listQuery = trpc.columnMappings.list.useQuery(undefined, {
    enabled: false,
  });

  const saveMutation = trpc.columnMappings.save.useMutation({
    onMutate: () => setIsMapping(true),
    onSettled: () => setIsMapping(false),
  });

  const saveMappings = useCallback(
    async (mappingsToSave: Omit<ColumnMapping, "id" | "companyId" | "createdAt">[]) => {
      setIsMapping(true);
      try {
        await saveMutation.mutateAsync({ mappings: mappingsToSave });
        const updated = mappingsToSave.map((m, i) => ({
          ...m,
          id: `m${Date.now()}-${i}`,
          companyId: companyId ?? "c1",
          createdAt: new Date().toISOString(),
        })) as ColumnMapping[];
        setMappings(updated);
      } finally {
        setIsMapping(false);
      }
    },
    [saveMutation, companyId],
  );

  return {
    mappings: listQuery.data ?? mappings,
    isLoading: listQuery.isLoading,
    saveMappings,
    isMapping,
  };
}

export function useSuggestMappings(headers: string[]) {
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof suggestColumnMappings>> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await suggestColumnMappings(headers);
      setSuggestions(result);
    } finally {
      setIsLoading(false);
    }
  }, [headers]);

  return {
    suggestions,
    isLoading,
    getSuggestions,
  };
}
