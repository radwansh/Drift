"use client";

import { useState, useCallback } from "react";
import type { ExportFormat, ExportHistory } from "@saas/types";

export interface ExportState {
  isExporting: boolean;
  exportResult: { format: ExportFormat; exportedAt: string; rowCount: number } | null;
  error: string | null;
}

export function useExport() {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    exportResult: null,
    error: null,
  });

  const exportTo = useCallback(async (format: ExportFormat, rowCount?: number) => {
    setState({ isExporting: true, exportResult: null, error: null });
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setState({
        isExporting: false,
        exportResult: { format, exportedAt: new Date().toISOString(), rowCount: rowCount ?? 0 },
        error: null,
      });
    } catch (err) {
      setState({
        isExporting: false,
        exportResult: null,
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }, []);

  return {
    exportTo,
    isExporting: state.isExporting,
    exportResult: state.exportResult,
    error: state.error,
  };
}
