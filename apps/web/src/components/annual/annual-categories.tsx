"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary, Category } from "@saas/payroll-core";
import { CATEGORY_LABELS } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatMoney, formatComponentName, formatPct } from "@/components/annual/annual-utils";

const EARNING_CATEGORIES: Category[] = [
  "base_salary",
  "allowance",
  "bonus_commission",
  "overtime",
  "other_earning",
];

interface AnnualCategoriesProps {
  summary: AnnualSummary | null;
}

interface CategoryRow {
  category: Category;
  total: number;
  gross: number;
  components: { key: string; label: string; total: number }[];
}

export function AnnualCategories({ summary }: AnnualCategoriesProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo<CategoryRow[]>(() => {
    if (!summary) return [];
    const byCategory = summary.categories.byCategory;
    const byKey = summary.categories.byKey;
    const gross = summary.bridge.actual.gross;

    const rows: CategoryRow[] = EARNING_CATEGORIES.map((category) => ({
      category,
      total: byCategory[category] ?? 0,
      gross,
      components: Object.entries(byKey)
        .filter(([, v]) => v.category === category)
        .map(([key, v]) => ({ key, label: formatComponentName(key), total: v.total }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    }));

    if (summary.categories.uncategorisedKeys.length > 0) {
      const uncategorisedTotal = summary.categories.uncategorisedKeys.reduce(
        (acc, key) => acc + (byKey[key]?.total ?? 0),
        0,
      );
      rows.push({
        category: "uncategorised",
        total: uncategorisedTotal,
        gross,
        components: summary.categories.uncategorisedKeys
          .map((key) => ({
            key,
            label: formatComponentName(key),
            total: byKey[key]?.total ?? 0,
          }))
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      });
    }

    return rows.filter((r) => r.total !== 0 || r.category === "uncategorised");
  }, [summary]);

  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Salary Components</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  const toggle = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Salary Components by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">To date</TableHead>
                <TableHead className="text-right">% of gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isUncategorised = row.category === "uncategorised";
                const isExpanded = expanded.has(row.category);
                const pct = row.gross !== 0 ? (row.total / row.gross) * 100 : null;
                return (
                  <CategoryRows
                    key={row.category}
                    row={row}
                    currency={summary.currency}
                    isUncategorised={isUncategorised}
                    isExpanded={isExpanded}
                    onToggle={() => toggle(row.category)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          To-date earnings by resolved category. Expand a row to see the underlying components. Earnings
          keep their sign; deduction and employer components use absolute values.
        </p>
      </CardContent>
    </Card>
  );
}

function CategoryRows({
  row,
  currency,
  isUncategorised,
  isExpanded,
  onToggle,
}: {
  row: CategoryRow;
  currency: string;
  isUncategorised: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        className={cn("cursor-pointer", isUncategorised && "bg-amber-500/10")}
        onClick={onToggle}
      >
        <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {row.components.length > 0 ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )
            ) : null}
            {isUncategorised ? "Uncategorised" : CATEGORY_LABELS[row.category]}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">
          {formatCompact(row.total, currency)}
        </TableCell>
        <TableCell className="text-right tabular-nums whitespace-nowrap">
          {isUncategorised ? "—" : formatPct(row.total / row.gross * 100)}
        </TableCell>
      </TableRow>
      {isExpanded && row.components.length > 0 ? (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={3}>
            <div className="py-1">
              {row.components.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-4 py-1 text-sm"
                >
                  <span className="text-muted-foreground truncate">{c.label}</span>
                  <span className="tabular-nums text-right whitespace-nowrap" title={formatMoney(c.total, currency)}>
                    {formatMoney(c.total, currency)}
                  </span>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}