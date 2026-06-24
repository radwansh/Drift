"use client";

import { useState, useCallback, useMemo } from "react";
import { runComparison, type EmployeeRecord, type ComparisonOutput } from "@saas/payroll-core";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { ComparisonTable } from "@/components/detailed-view/comparison-table";
import { ColumnPicker, type ColumnConfig } from "@/components/detailed-view/column-picker";
import { SavedViews } from "@/components/detailed-view/saved-views";
import { ExportButton } from "@/components/detailed-view/export-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { usePayrollStore } from "@/lib/payroll-store";

function buildMockEmployees(): { current: EmployeeRecord[]; previous: EmployeeRecord[] } {
  const current: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 95000, bonus: 12000, benefits: 5000, overtime: 2000 }, grossSalary: 114000, netSalary: 82000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000, overtime: 500 }, grossSalary: 84500, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 88000, bonus: 15000, benefits: 4500, overtime: 1000 }, grossSalary: 108500, netSalary: 78500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 110000, bonus: 18000, benefits: 6000, overtime: 0 }, grossSalary: 134000, netSalary: 98000 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 65000, bonus: 5000, benefits: 3500, overtime: 300 }, grossSalary: 73800, netSalary: 54000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 22000, benefits: 5000, overtime: 1500 }, grossSalary: 120500, netSalary: 87000 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 125000, bonus: 25000, benefits: 7000, overtime: 3000 }, grossSalary: 160000, netSalary: 114000 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500, overtime: 200 }, grossSalary: 77700, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 78000, bonus: 10000, benefits: 4000, overtime: 0 }, grossSalary: 92000, netSalary: 67200 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 105000, bonus: 16000, benefits: 5500, overtime: 2500 }, grossSalary: 129000, netSalary: 92500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000, overtime: 100 }, grossSalary: 69600, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 35000, benefits: 8000, overtime: 5000 }, grossSalary: 198000, netSalary: 140000 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 85000, bonus: 12000, benefits: 4500, overtime: 800 }, grossSalary: 102300, netSalary: 74000 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 55000, bonus: 4000, benefits: 3000, overtime: 600 }, grossSalary: 62600, netSalary: 45500 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 71000, bonus: 7000, benefits: 3500, overtime: 400 }, grossSalary: 81900, netSalary: 59800 },
    { externalId: "E016", name: "Peter Nguyen", department: "Operations", components: { salary: 58000, bonus: 5000, benefits: 3000, overtime: 200 }, grossSalary: 66200, netSalary: 48500 },
  ];

  const previous: EmployeeRecord[] = [
    { externalId: "E001", name: "Alice Johnson", department: "Engineering", components: { salary: 90000, bonus: 10000, benefits: 5000, overtime: 1500 }, grossSalary: 106500, netSalary: 77000 },
    { externalId: "E002", name: "Bob Smith", department: "Marketing", components: { salary: 72000, bonus: 8000, benefits: 4000, overtime: 500 }, grossSalary: 84500, netSalary: 61500 },
    { externalId: "E003", name: "Carol Davis", department: "Sales", components: { salary: 85000, bonus: 12000, benefits: 4500, overtime: 800 }, grossSalary: 102300, netSalary: 74500 },
    { externalId: "E004", name: "Dan Wilson", department: "Engineering", components: { salary: 105000, bonus: 15000, benefits: 6000, overtime: 0 }, grossSalary: 126000, netSalary: 92500 },
    { externalId: "E005", name: "Eve Martin", department: "HR", components: { salary: 62000, bonus: 4000, benefits: 3500, overtime: 200 }, grossSalary: 69700, netSalary: 51000 },
    { externalId: "E006", name: "Frank Lee", department: "Sales", components: { salary: 92000, bonus: 20000, benefits: 5000, overtime: 1200 }, grossSalary: 118200, netSalary: 85500 },
    { externalId: "E007", name: "Grace Kim", department: "Engineering", components: { salary: 120000, bonus: 22000, benefits: 7000, overtime: 2500 }, grossSalary: 151500, netSalary: 108500 },
    { externalId: "E008", name: "Henry Brown", department: "Marketing", components: { salary: 68000, bonus: 6000, benefits: 3500, overtime: 200 }, grossSalary: 77700, netSalary: 57000 },
    { externalId: "E009", name: "Ivy Chen", department: "Finance", components: { salary: 75000, bonus: 8000, benefits: 4000, overtime: 0 }, grossSalary: 87000, netSalary: 63800 },
    { externalId: "E010", name: "Jack Taylor", department: "Engineering", components: { salary: 100000, bonus: 14000, benefits: 5500, overtime: 2000 }, grossSalary: 121500, netSalary: 87500 },
    { externalId: "E011", name: "Karen White", department: "HR", components: { salary: 62000, bonus: 4500, benefits: 3000, overtime: 100 }, grossSalary: 69600, netSalary: 51000 },
    { externalId: "E012", name: "Leo Garcia", department: "Sales", components: { salary: 150000, bonus: 30000, benefits: 8000, overtime: 4000 }, grossSalary: 192000, netSalary: 136500 },
    { externalId: "E013", name: "Mia Patel", department: "Finance", components: { salary: 82000, bonus: 10000, benefits: 4500, overtime: 600 }, grossSalary: 97100, netSalary: 70500 },
    { externalId: "E014", name: "Noah Adams", department: "Operations", components: { salary: 52000, bonus: 3000, benefits: 3000, overtime: 400 }, grossSalary: 58400, netSalary: 42800 },
    { externalId: "E015", name: "Olivia Scott", department: "Marketing", components: { salary: 68000, bonus: 5000, benefits: 3500, overtime: 300 }, grossSalary: 76800, netSalary: 56200 },
    { externalId: "E017", name: "Quinn Harris", department: "Operations", components: { salary: 60000, bonus: 5000, benefits: 3500, overtime: 500 }, grossSalary: 69000, netSalary: 50200 },
  ];

  return { current, previous };
}

function extractAllComponents(results: ComparisonOutput[]): string[] {
  const comps = new Set<string>();
  for (const r of results) {
    for (const c of Object.keys(r.currentComponents)) comps.add(c);
    for (const c of Object.keys(r.previousComponents)) comps.add(c);
  }
  return Array.from(comps).sort();
}

function buildColumnConfig(results: ComparisonOutput[]): ColumnConfig[] {
  const components = extractAllComponents(results);
  return components.map((component) => ({
    component,
    visible: true,
    mode: "side_by_side" as const,
  }));
}

export default function DetailedViewPage() {
  const { periods } = usePayrollStore();
  const [periodType, setPeriodType] = useState<string>("monthly");
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState("June 2026");
  const [previousPeriodLabel, setPreviousPeriodLabel] = useState("May 2026");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ComparisonOutput[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);

  const runComparisonHandler = useCallback(() => {
    setLoading(true);
    const currentPeriod = periods.find((p) => p.label === currentPeriodLabel);
    const previousPeriod = periods.find((p) => p.label === previousPeriodLabel);
    const current = currentPeriod?.employees ?? [];
    const previous = previousPeriod?.employees ?? [];
    if (current.length === 0 || previous.length === 0) {
      const mock = buildMockEmployees();
      const { results: compResults } = runComparison(mock.current, mock.previous);
      setResults(compResults);
      setColumnConfig(buildColumnConfig(compResults));
      return setLoading(false);
    }
    const { results: compResults } = runComparison(current, previous);
    setResults(compResults);
    setColumnConfig(buildColumnConfig(compResults));
    setLoading(false);
  }, [currentPeriodLabel, previousPeriodLabel, periods]);

  const filteredResults = useMemo(() => {
    let filtered = results;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeExternalId.toLowerCase().includes(q),
      );
    }
    if (departmentFilter !== "all") {
      filtered = filtered.filter((r) => r.department === departmentFilter);
    }
    return filtered;
  }, [results, searchQuery, departmentFilter]);

  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const r of results) {
      if (r.department) depts.add(r.department);
    }
    return Array.from(depts).sort();
  }, [results]);

  const handleExport = async (format: "pdf" | "xlsx" | "csv") => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log(`Exporting ${format} with ${filteredResults.length} rows`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Detailed View</h2>
        <p className="text-muted-foreground mt-1">
          Compare employee salary components side by side across periods
        </p>
      </div>

      <PeriodSelector
        periodType={periodType}
        onPeriodTypeChange={setPeriodType}
        currentPeriodLabel={currentPeriodLabel}
        previousPeriodLabel={previousPeriodLabel}
        onCurrentPeriodChange={setCurrentPeriodLabel}
        onPreviousPeriodChange={setPreviousPeriodLabel}
        onCompare={runComparisonHandler}
        loading={loading}
      />

      {results.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColumnPicker columns={columnConfig} onChange={setColumnConfig} />
            <SavedViews
              currentColumns={columnConfig}
              onApplyView={setColumnConfig}
            />
            <ExportButton
              hasData={filteredResults.length > 0}
              onExport={handleExport}
            />
          </div>

          <ComparisonTable
            data={filteredResults}
            columnConfig={columnConfig}
            loading={false}
          />
        </>
      )}
    </div>
  );
}
