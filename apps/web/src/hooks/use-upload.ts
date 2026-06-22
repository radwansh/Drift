"use client";

import { useState, useCallback } from "react";
import type { DateRange } from "@saas/types";

export type UploadStep = "select" | "period_info" | "mapping" | "confirm" | "uploading" | "done" | "error";

export interface UploadState {
  step: UploadStep;
  file: File | null;
  periodType: string | null;
  dateRange: DateRange | null;
  currencyCode: string | null;
  columnMappings: Array<{ sourceColumn: string; mappedComponent: string }>;
  progress: number;
  errorMessage: string | null;
  uploadResult: { periodId?: string; employeeCount?: number } | null;
}

const initialState: UploadState = {
  step: "select",
  file: null,
  periodType: null,
  dateRange: null,
  currencyCode: null,
  columnMappings: [],
  progress: 0,
  errorMessage: null,
  uploadResult: null,
};

export function useUpload() {
  const [state, setState] = useState<UploadState>(initialState);

  const uploadFile = useCallback((file: File) => {
    const validExts = [".csv", ".xlsx", ".xls"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExts.includes(ext)) {
      setState((s) => ({ ...s, errorMessage: "Unsupported file format. Use CSV or XLSX." }));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setState((s) => ({ ...s, errorMessage: "File too large. Maximum 50 MB." }));
      return;
    }
    setState((s) => ({
      ...s,
      step: "period_info",
      file,
      errorMessage: null,
      progress: 0,
    }));
  }, []);

  const setPeriodInfo = useCallback(
    (periodType: string, dateRange: DateRange, currencyCode: string) => {
      setState((s) => ({
        ...s,
        step: "mapping",
        periodType,
        dateRange,
        currencyCode,
      }));
    },
    [],
  );

  const setColumnMappings = useCallback(
    (mappings: Array<{ sourceColumn: string; mappedComponent: string }>) => {
      setState((s) => ({
        ...s,
        step: "confirm",
        columnMappings: mappings,
      }));
    },
    [],
  );

  const confirmUpload = useCallback(async () => {
    setState((s) => ({ ...s, step: "uploading", progress: 0, errorMessage: null }));

    for (let pct = 10; pct <= 90; pct += 20) {
      await new Promise((r) => setTimeout(r, 200));
      setState((s) => ({ ...s, progress: pct }));
    }

    await new Promise((r) => setTimeout(r, 500));
    setState((s) => ({
      ...s,
      step: "done",
      progress: 100,
      uploadResult: { periodId: crypto.randomUUID(), employeeCount: 16 },
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    uploadFile,
    setPeriodInfo,
    setColumnMappings,
    confirmUpload,
    reset,
  };
}
