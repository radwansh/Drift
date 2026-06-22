import { useState, useCallback, useEffect } from "react";
import {
  runComparison,
  type EmployeeRecord,
  type ComparisonOutput,
  type AggregatedSummary,
} from "@saas/payroll-core";

function buildMockEmployees(): { current: EmployeeRecord[]; previous: EmployeeRecord[] } {
  const current: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 95000, bonus: 12000, benefits: 5000 }, grossSalary: 112000, netSalary: 82000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000 }, grossSalary: 84000, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 88000, bonus: 15000, benefits: 4500 }, grossSalary: 107500, netSalary: 78500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 110000, bonus: 18000, benefits: 6000 }, grossSalary: 134000, netSalary: 98000 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 65000, bonus: 5000, benefits: 3500 }, grossSalary: 73500, netSalary: 54000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 22000, benefits: 5000 }, grossSalary: 119000, netSalary: 87000 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 125000, bonus: 25000, benefits: 7000 }, grossSalary: 157000, netSalary: 114000 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500 }, grossSalary: 77500, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 78000, bonus: 10000, benefits: 4000 }, grossSalary: 92000, netSalary: 67200 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 105000, bonus: 16000, benefits: 5500 }, grossSalary: 126500, netSalary: 92500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 35000, benefits: 8000 }, grossSalary: 193000, netSalary: 140000 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 85000, bonus: 12000, benefits: 4500 }, grossSalary: 101500, netSalary: 74000 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 55000, bonus: 4000, benefits: 3000 }, grossSalary: 62000, netSalary: 45500 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 71000, bonus: 7000, benefits: 3500 }, grossSalary: 81500, netSalary: 59800 },
    { externalId: "E016", name: "Peter Nguyen", department: "Operations", components: { salary: 58000, bonus: 5000, benefits: 3000 }, grossSalary: 66000, netSalary: 48500 },
  ];

  const previous: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 90000, bonus: 10000, benefits: 5000 }, grossSalary: 105000, netSalary: 77000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000 }, grossSalary: 84000, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 85000, bonus: 12000, benefits: 4500 }, grossSalary: 101500, netSalary: 74500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 105000, bonus: 15000, benefits: 6000 }, grossSalary: 126000, netSalary: 92500 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 62000, bonus: 4000, benefits: 3500 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 20000, benefits: 5000 }, grossSalary: 117000, netSalary: 85500 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 120000, bonus: 22000, benefits: 7000 }, grossSalary: 149000, netSalary: 108500 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500 }, grossSalary: 77500, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 75000, bonus: 8000, benefits: 4000 }, grossSalary: 87000, netSalary: 63800 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 100000, bonus: 14000, benefits: 5500 }, grossSalary: 119500, netSalary: 87500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000 }, grossSalary: 69500, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 30000, benefits: 8000 }, grossSalary: 188000, netSalary: 136500 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 82000, bonus: 10000, benefits: 4500 }, grossSalary: 96500, netSalary: 70500 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 52000, bonus: 3000, benefits: 3000 }, grossSalary: 58000, netSalary: 42800 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 68000, bonus: 5000, benefits: 3500 }, grossSalary: 76500, netSalary: 56200 },
    { externalId: "E017", name: "Quinn Harris", department: "Operations", components: { salary: 60000, bonus: 5000, benefits: 3500 }, grossSalary: 68500, netSalary: 50200 },
  ];

  return { current, previous };
}

export interface ComparisonState {
  data: ComparisonOutput[] | null;
  summary: AggregatedSummary | null;
  isLoading: boolean;
  error: string | null;
}

export function useComparison(currentPeriodId?: string, previousPeriodId?: string) {
  const [state, setState] = useState<ComparisonState>({
    data: null,
    summary: null,
    isLoading: false,
    error: null,
  });

  const runComparisonAsync = useCallback(async (currentId?: string, previousId?: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const { current, previous } = buildMockEmployees();
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
  }, []);

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
