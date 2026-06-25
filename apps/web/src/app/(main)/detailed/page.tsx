"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { runComparison, type ComparisonOutput } from "@saas/payroll-core";
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
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState("");
  const [previousPeriodLabel, setPreviousPeriodLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ComparisonOutput[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);

  useEffect(() => {
    if (periods.length >= 2) {
      setCurrentPeriodLabel(periods[periods.length - 1].label);
      setPreviousPeriodLabel(periods[periods.length - 2].label);
    } else if (periods.length === 1) {
      setCurrentPeriodLabel(periods[0].label);
    }
  }, [periods]);

  const runComparisonHandler = useCallback(() => {
    setLoading(true);
    const currentPeriod = periods.find((p) => p.label === currentPeriodLabel);
    const previousPeriod = periods.find((p) => p.label === previousPeriodLabel);
    const current = currentPeriod?.employees ?? [];
    const previous = previousPeriod?.employees ?? [];
    if (current.length === 0 || previous.length === 0) {
      setResults([]);
      setColumnConfig([]);
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
