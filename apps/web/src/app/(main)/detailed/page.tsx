"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { ComparisonOutput } from "@saas/payroll-core";
import { trpc } from "@/lib/trpc";
import { usePeriodOptions } from "@/hooks/use-period-options";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { ComparisonTable, STATUS_LABELS } from "@/components/detailed-view/comparison-table";
import { ColumnPicker, type ColumnConfig } from "@/components/detailed-view/column-picker";
import { SavedViews } from "@/components/detailed-view/saved-views";
import { ExportButton } from "@/components/detailed-view/export-button";
import { Icon, Notice, PageHeader } from "@/components/cv";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { usePayrollStore } from "@/lib/payroll-store";

function extractAllComponents(results: ComparisonOutput[]): string[] {
  const comps = new Set<string>();
  for (const r of results) {
    for (const c of Object.keys(r.currentComponents)) comps.add(c);
    for (const c of Object.keys(r.previousComponents)) comps.add(c);
  }
  return Array.from(comps).sort();
}

function buildColumnConfig(
  results: ComparisonOutput[],
  visibility: Record<string, boolean>,
): ColumnConfig[] {
  const components = extractAllComponents(results);
  const specials =
    results.length > 0
      ? [
          {
            component: "gross_salary",
            visible: visibility["gross_salary"] !== false,
            mode: "side_by_side" as const,
          },
          {
            component: "net_salary",
            visible: visibility["net_salary"] !== false,
            mode: "side_by_side" as const,
          },
        ]
      : [];
  return [
    ...specials,
    ...components.map((component) => ({
      component,
      visible: visibility[component] !== false,
      mode: "side_by_side" as const,
    })),
  ];
}

/**
 * The Detailed View — the Ink & Signal rebuild (canvas board "Detailed View").
 *
 * Step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md still holds: the comparison runs
 * server-side through `comparisons.run` instead of over employee records held
 * in an in-memory store, so this page works for any period the company has,
 * not only ones uploaded in the current tab. `comparisons.getById` and
 * `comparisons.run` are `memberProcedure`s and this screen is built on them,
 * viewers included — CLAUDE.md records that as a product decision, so nothing
 * here gates on a role.
 *
 * The rebuild was presentation only — same mutation, same preselection
 * effect, same `buildColumnConfig`, same export handler. The **status filter**
 * is the one exception on this screen and was approved by Radwan: the screen
 * map lists it as part of the filter row, and the screen never had one.
 *
 *   PageHeader ("July 2026 vs June 2026")
 *   PeriodSelector — the Dashboard's toolbar, with Saved views, Export and
 *                    Columns in its `actions` slot (the prop it was given in
 *                    phase 3 for exactly this screen)
 *   filter row     — search, department and status, in the same bordered
 *                    surface row the Employee File list uses
 *   ComparisonTable in a Panel
 *
 * The three filters narrow, they never replace one another: all three
 * predicates run in `filteredResults` over the same array, in one memo with
 * all three in its dependency list.
 */
export default function DetailedViewPage() {
  const { componentVisibility } = usePayrollStore();
  const [periodType, setPeriodType] = useState<string>("monthly");
  const { periods } = usePeriodOptions();
  const [currentPeriodId, setCurrentPeriodId] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");
  const [results, setResults] = useState<ComparisonOutput[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Step 8b: the company currency, so the table labels its figures with the
  // right code instead of defaulting every cell to USD.
  const [currency, setCurrency] = useState("USD");

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);

  const comparison = trpc.comparisons.run.useMutation({
    onSuccess: (result) => {
      setResults(result.results);
      setCurrency(result.currency);
      setColumnConfig(buildColumnConfig(result.results, componentVisibility));
    },
    onError: () => {
      setResults([]);
      setColumnConfig([]);
    },
  });
  const loading = comparison.isPending;

  useEffect(() => {
    if (periods.length === 0) return;
    setCurrentPeriodId(periods[periods.length - 1]!.id);
    if (periods.length >= 2) setPreviousPeriodId(periods[periods.length - 2]!.id);
  }, [periods]);

  const runComparisonHandler = useCallback(() => {
    if (!currentPeriodId || !previousPeriodId || currentPeriodId === previousPeriodId) return;
    comparison.mutate({ currentPeriodId, previousPeriodId });
  }, [comparison, currentPeriodId, previousPeriodId]);

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
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    return filtered;
  }, [results, searchQuery, departmentFilter, statusFilter]);

  const departments = useMemo(() => {
    const depts = new Set<string>();
    for (const r of results) {
      if (r.department) depts.add(r.department);
    }
    return Array.from(depts).sort();
  }, [results]);

  /**
   * The statuses actually on screen, the way `departments` above lists the
   * departments actually on screen — read off the results, never a literal
   * list of the five the classifier has today. A sixth status would otherwise
   * be unreachable through the filter while its rows sat in the table.
   *
   * `STATUS_LABELS` only orders them and names them, and anything missing from
   * it sorts last rather than being dropped, so an unlabelled status is still
   * filterable (it shows its raw key, which is what the Status column shows
   * for it too).
   */
  const statuses = useMemo(() => {
    const order = Object.keys(STATUS_LABELS);
    const rank = (status: string) => {
      const index = order.indexOf(status);
      return index === -1 ? order.length : index;
    };
    return Array.from(new Set(results.map((r) => r.status))).sort((a, b) => rank(a) - rank(b));
  }, [results]);

  const handleExport = async (format: "pdf" | "xlsx" | "csv") => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log(`Exporting ${format} with ${filteredResults.length} rows`);
  };

  // The title names the comparison on screen, current period first, the way the
  // Dashboard does — the two screens read the same pair of periods.
  const currentLabel = periods.find((p) => p.id === currentPeriodId)?.label ?? "";
  const previousLabel = periods.find((p) => p.id === previousPeriodId)?.label ?? "";
  const comparisonLabel =
    currentLabel && previousLabel ? `${currentLabel} vs ${previousLabel}` : "";
  const hasResults = results.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Detailed View"
        title={hasResults && comparisonLabel ? comparisonLabel : "Every employee, side by side"}
        lede={
          hasResults
            ? `Every pay component for every employee, with the change since ${previousLabel || "the previous period"}. Open a row for its components and anomaly flags.`
            : "Pick a current and a previous period, then compare. Every employee and every pay component lands here, with the change between them."
        }
      />

      <PeriodSelector
        periodType={periodType}
        onPeriodTypeChange={setPeriodType}
        periods={periods}
        currentPeriodId={currentPeriodId}
        previousPeriodId={previousPeriodId}
        onCurrentPeriodChange={setCurrentPeriodId}
        onPreviousPeriodChange={setPreviousPeriodId}
        onCompare={runComparisonHandler}
        loading={loading}
        actions={
          hasResults ? (
            <>
              <SavedViews currentColumns={columnConfig} onApplyView={setColumnConfig} />
              <ExportButton hasData={filteredResults.length > 0} onExport={handleExport} />
              <ColumnPicker columns={columnConfig} onChange={setColumnConfig} />
            </>
          ) : undefined
        }
      />

      {/* The run's own failure, said once. It used to clear the table and
          leave no explanation on screen at all. */}
      {comparison.error && (
        <Notice tone="danger" title="Could not run the comparison">
          {comparison.error.message}
        </Notice>
      )}

      {hasResults && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-cv-lg border border-cv-line bg-cv-surface px-4 py-3">
            <div className="relative min-w-[16rem] flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cv-ink-subtle"
              />
              <Input
                placeholder="Search by name or ID"
                aria-label="Search by name or ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger aria-label="Department" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The words are the Status column's own, from one exported map. */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Status" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ComparisonTable
            data={filteredResults}
            columnConfig={columnConfig}
            loading={false}
            currency={currency}
          />
        </>
      )}
    </div>
  );
}
