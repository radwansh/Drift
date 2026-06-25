import { useState, useCallback, useEffect } from "react";
import {
  runComparison,
  type ComparisonOutput,
  type AggregatedSummary,
} from "@saas/payroll-core";
import { usePayrollStore } from "@/lib/payroll-store";

export interface ComparisonState {
  data: ComparisonOutput[] | null;
  summary: AggregatedSummary | null;
  isLoading: boolean;
  error: string | null;
}

export function useComparison(currentPeriodId?: string, previousPeriodId?: string) {
  const { periods } = usePayrollStore();
  const [state, setState] = useState<ComparisonState>({
    data: null,
    summary: null,
    isLoading: false,
    error: null,
  });

  const runComparisonAsync = useCallback(async (currentId?: string, previousId?: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const currentPeriod = periods.find((p) => p.id === currentId);
      const previousPeriod = periods.find((p) => p.id === previousId);
      const current = currentPeriod?.employees ?? [];
      const previous = previousPeriod?.employees ?? [];
      if (current.length === 0 || previous.length === 0) {
        setState({ data: null, summary: null, isLoading: false, error: "Select two periods with data to compare" });
        return null;
      }
      const result = runComparison(current, previous);
      setState({
        data: result.results,
        summary: result.summary,
        isLoading: false,
        error: null,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Comparison failed";
      setState((s) => ({ ...s, isLoading: false, error: message }));
      return null;
    }
  }, [periods]);

  useEffect(() => {
    if (currentPeriodId && previousPeriodId) {
      runComparisonAsync(currentPeriodId, previousPeriodId);
    }
  }, [currentPeriodId, previousPeriodId, runComparisonAsync]);

  return {
    data: state.data,
    summary: state.summary,
    isLoading: state.isLoading,
    error: state.error,
    runComparison: runComparisonAsync,
  };
}
