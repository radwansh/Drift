"use client";

import { useMemo, useState } from "react";
import type { AnnualSummary, Category } from "@saas/payroll-core";
import { CATEGORY_LABELS } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { formatMoney, formatComponentName, formatPct } from "@/components/annual/annual-utils";
import { ScrollShadow } from "@/components/annual/scroll-shadow";

const EARNING_CATEGORIES: Category[] = [
  "base_salary",
  "allowance",
  "bonus_commission",
  "overtime",
  "other_earning",
];

interface AnnualCategoriesProps {
  summary: AnnualSummary | null;
  onCategorise?: () => void;
}

interface CategoryRow {
  id: string;
  label: string;
  toDate: number;
  forecast: number;
  fullYear: number;
  /**
   * "memo" is a line that is already counted inside the rows above it, so it is
   * excluded from the add-up-to-gross check. One-offs held out of the forecast
   * are the only memo line today (step 6).
   */
  kind: "earning" | "balance" | "uncategorised" | "memo";
  components: { key: string; label: string; total: number }[];
}

/**
 * Salary components by category (step 36, KPI 5).
 *
 * Three fixes. The table showed to-date figures only, so it could not be read
 * against the forecast. It had no earnings-balance row, so the categories did not
 * add up to gross and a company with an unmapped earning column saw a table that
 * silently did not reconcile. And the rows were clickable `<tr>`s with no
 * keyboard handler and no `aria-expanded`, so the detail was unreachable without
 * a mouse (finding U10).
 */
export function AnnualCategories({ summary, onCategorise }: AnnualCategoriesProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo<CategoryRow[]>(() => {
    if (!summary) return [];
    const byKey = summary.categories.byKey;
    const toDate = summary.categories.byCategory;
    const fc = summary.categoryForecast;
    const fy = summary.categoryFullYear;

    const out: CategoryRow[] = EARNING_CATEGORIES.map((category) => ({
      id: category,
      label: CATEGORY_LABELS[category],
      toDate: toDate[category] ?? 0,
      forecast: fc[category] ?? 0,
      fullYear: fy[category] ?? 0,
      kind: "earning" as const,
      components: Object.entries(byKey)
        .filter(([, v]) => v.category === category)
        .map(([key, v]) => ({ key, label: formatComponentName(key), total: v.total }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    })).filter((r) => r.toDate !== 0 || r.fullYear !== 0);

    // The balancing line that makes the table add up to gross (step 11).
    const balanceToDate = summary.bridge.actual.earningsBalance;
    const balanceForecast = summary.bridge.forecast.earningsBalance;
    if (balanceToDate !== 0 || balanceForecast !== 0) {
      out.push({
        id: "other_earnings_balance",
        label: "Earnings not categorised",
        toDate: balanceToDate,
        forecast: balanceForecast,
        fullYear: summary.bridge.fullYear.earningsBalance,
        kind: "balance",
        components: [],
      });
    }

    // Step 6: the forecast projects a recurring floor and holds one-offs back,
    // so say so. A silent exclusion is a different kind of wrong number — the
    // bonus line reads low against last year and nothing on the page explains
    // why. The amount is inside "To date" already, hence the dashes.
    const oneOffs = summary.oneOffsExcluded;
    if (oneOffs.total !== 0) {
      out.push({
        id: "one_offs_excluded",
        label: "One-offs excluded from forecast",
        toDate: oneOffs.total,
        forecast: 0,
        fullYear: 0,
        kind: "memo",
        components: Object.entries(oneOffs.byCategory)
          .map(([category, total]) => ({
            key: category,
            label: CATEGORY_LABELS[category as Category],
            total: total ?? 0,
          }))
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      });
    }

    if (summary.categories.uncategorisedKeys.length > 0) {
      out.push({
        id: "uncategorised",
        label: "Uncategorised components",
        toDate: summary.categories.uncategorisedKeys.reduce((acc, k) => acc + (byKey[k]?.total ?? 0), 0),
        forecast: 0,
        fullYear: 0,
        kind: "uncategorised",
        components: summary.categories.uncategorisedKeys
          .map((key) => ({ key, label: formatComponentName(key), total: byKey[key]?.total ?? 0 }))
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      });
    }

    return out;
  }, [summary]);

  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Salary components</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  const currency = summary.currency;
  const gross = summary.bridge.actual.gross;
  const earningsTotal = rows
    .filter((r) => r.kind === "earning" || r.kind === "balance")
    .reduce((acc, r) => acc + r.toDate, 0);
  // Earnings plus the balance must equal gross; show the check rather than
  // leaving the reader to add the column up.
  const reconciles = Math.abs(earningsTotal - gross) < 0.01;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Salary components</CardTitle>
        <CardDescription>
          Earnings by category. Earnings plus any uncategorised balance add up to gross.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollShadow>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 top-0 z-30 bg-background">Category</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-right">To date</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-right">Forecast</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-right">Full year</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background text-right">% of gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isExpanded = expanded.has(row.id);
                const hasDetail = row.components.length > 0;
                const pct = gross !== 0 ? (row.toDate / gross) * 100 : null;

                return (
                  <>
                    <TableRow
                      key={row.id}
                      className={cn(
                        row.kind === "uncategorised" && "bg-amber-500/10",
                        row.kind === "balance" && "bg-muted/40",
                        row.kind === "memo" && "bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background font-medium">
                        {hasDetail ? (
                          // A real button, so it is focusable and operable with
                          // the keyboard and announces its state.
                          <button
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            {row.label}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 pl-5">{row.label}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(row.toDate, currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {row.kind === "uncategorised" || row.kind === "memo"
                          ? "—"
                          : formatMoney(row.forecast, currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {row.kind === "uncategorised" || row.kind === "memo"
                          ? "—"
                          : formatMoney(row.fullYear, currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatPct(pct)}
                      </TableCell>
                    </TableRow>

                    {isExpanded && hasDetail && (
                      <TableRow key={`${row.id}-detail`} className="bg-muted/30">
                        <TableCell colSpan={5}>
                          <div className="space-y-1 py-1">
                            {row.components.map((c) => (
                              <div key={c.key} className="flex items-center justify-between gap-4 text-sm">
                                <span className="truncate text-muted-foreground">{c.label}</span>
                                <span className="whitespace-nowrap text-right tabular-nums">
                                  {formatMoney(c.total, currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}

              <TableRow className="border-t-2 font-medium">
                <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-background">
                  Gross
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatMoney(gross, currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatMoney(summary.bridge.forecast.gross, currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {formatMoney(summary.bridge.fullYear.gross, currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">100.0%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ScrollShadow>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {reconciles
              ? "Categories add up to gross."
              : `Categories are ${formatMoney(Math.abs(gross - earningsTotal), currency)} short of gross.`}
          </span>
          {summary.oneOffsExcluded.total !== 0 && (
            <span>
              {formatMoney(summary.oneOffsExcluded.total, currency)} of one-offs is counted in the
              period it was paid and is not projected into the remaining periods, so it is already
              inside the figures above and is not added again.
            </span>
          )}
          {summary.categories.uncategorisedKeys.length > 0 && onCategorise && (
            <Button size="sm" variant="outline" onClick={onCategorise}>
              Categorise components
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
