"use client";

import { Fragment, useMemo, useState } from "react";
import type { AnnualSummary, Category } from "@saas/payroll-core";
import { CATEGORY_LABELS } from "@saas/payroll-core";
import { Button, Panel } from "@/components/cv";
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
 * Salary components by category (step 36, KPI 5), on Ink & Signal.
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
        toDate: summary.categories.uncategorisedKeys.reduce(
          (acc, k) => acc + (byKey[k]?.total ?? 0),
          0,
        ),
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
      <Panel headingId="annual-categories-h" title="Salary components">
        <Skeleton className="h-56 w-full" />
      </Panel>
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
    <Panel
      headingId="annual-categories-h"
      title="Salary components"
      description="Earnings by category. Earnings plus any uncategorised balance add up to gross."
    >
      <ScrollShadow>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 top-0 z-30 bg-cv-surface-sunken">
                Category
              </TableHead>
              <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                To date
              </TableHead>
              <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                Forecast
              </TableHead>
              <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                Full year
              </TableHead>
              <TableHead className="sticky top-0 z-20 bg-cv-surface-sunken text-right">
                % of gross
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isExpanded = expanded.has(row.id);
              const hasDetail = row.components.length > 0;
              const pct = gross !== 0 ? (row.toDate / gross) * 100 : null;
              /* Uncategorised money is a warning: it is inside gross but inside
                 no bucket, so every category figure below it reads low. */
              const groundClass =
                row.kind === "uncategorised"
                  ? "bg-cv-warning-soft hover:bg-cv-warning-soft"
                  : row.kind === "balance"
                    ? "bg-cv-surface-sunken"
                    : row.kind === "memo"
                      ? "bg-cv-surface-sunken text-cv-ink-muted"
                      : undefined;
              const stickyGround =
                row.kind === "uncategorised"
                  ? "bg-cv-warning-soft"
                  : row.kind === "balance" || row.kind === "memo"
                    ? "bg-cv-surface-sunken"
                    : "bg-cv-surface";

              return (
                <Fragment key={row.id}>
                  <TableRow className={groundClass}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 whitespace-nowrap font-medium",
                        stickyGround,
                      )}
                    >
                      {hasDetail ? (
                        // A real button, so it is focusable and operable with
                        // the keyboard and announces its state.
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          aria-expanded={isExpanded}
                          className="inline-flex items-center gap-1 rounded-cv-sm focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
                        >
                          {isExpanded ? (
                            <ChevronDown
                              className="h-4 w-4 shrink-0 text-cv-ink-subtle"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-cv-ink-subtle"
                              aria-hidden="true"
                            />
                          )}
                          {row.label}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 pl-5">{row.label}</span>
                      )}
                    </TableCell>
                    <TableCell className="cv-num">{formatMoney(row.toDate, currency)}</TableCell>
                    <TableCell className="cv-num">
                      {row.kind === "uncategorised" || row.kind === "memo"
                        ? "—"
                        : formatMoney(row.forecast, currency)}
                    </TableCell>
                    <TableCell className="cv-num">
                      {row.kind === "uncategorised" || row.kind === "memo"
                        ? "—"
                        : formatMoney(row.fullYear, currency)}
                    </TableCell>
                    <TableCell className="cv-num">{formatPct(pct)}</TableCell>
                  </TableRow>

                  {isExpanded && hasDetail && (
                    <TableRow className="bg-cv-surface-sunken hover:bg-cv-surface-sunken">
                      <TableCell colSpan={5}>
                        <div className="flex flex-col gap-1 py-1">
                          {row.components.map((c) => (
                            <div
                              key={c.key}
                              className="flex items-center justify-between gap-4 text-sm leading-5"
                            >
                              <span className="truncate text-cv-ink-muted">{c.label}</span>
                              <span className="cv-num text-cv-ink">
                                {formatMoney(c.total, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}

            <TableRow className="border-t-2 border-t-cv-border font-medium">
              <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-cv-surface">
                Gross
              </TableCell>
              <TableCell className="cv-num">{formatMoney(gross, currency)}</TableCell>
              <TableCell className="cv-num">
                {formatMoney(summary.bridge.forecast.gross, currency)}
              </TableCell>
              <TableCell className="cv-num">
                {formatMoney(summary.bridge.fullYear.gross, currency)}
              </TableCell>
              <TableCell className="cv-num">100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ScrollShadow>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-4 text-cv-ink-subtle">
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
          <Button size="sm" variant="secondary" onClick={onCategorise}>
            Categorise components
          </Button>
        )}
      </div>
    </Panel>
  );
}
