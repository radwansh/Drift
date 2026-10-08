"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PiggyBank, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { AnnualSummary } from "@saas/payroll-core";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { formatMoney } from "@/components/annual/annual-utils";

interface BudgetInputProps {
  year: number;
  currency: string;
  disabled?: boolean;
}

export function BudgetInput({ year, currency, disabled }: BudgetInputProps) {
  const utils = trpc.useUtils();
  const query = trpc.annual.getBudget.useQuery({ year, currency }, { enabled: !disabled });
  const save = trpc.annual.setBudget.useMutation();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const synced = useRef<number | null>(null);

  useEffect(() => {
    if (query.data === undefined) return;
    synced.current = query.data.amount;
    setValue(query.data.amount === null ? "" : String(query.data.amount));
  }, [query.data]);

  useEffect(() => {
    if (disabled || query.isLoading) return;
    const trimmed = String(value).trim();
    const parsed = parseFloat(trimmed);
    const stored = synced.current;

    if (trimmed === "" && (stored === null || stored === undefined)) return;
    if (trimmed !== "" && (!Number.isFinite(parsed) || parsed < 0)) return;
    if (trimmed === "" && stored === null) return;
    if (trimmed !== "" && stored !== null && Math.abs(parsed - stored) < 1e-6) return;

    const t = setTimeout(() => {
      setSaving(true);
      const amount = trimmed === "" ? null : parsed;
      save.mutateAsync({ year, currency, amount })
        .then(() => {
          synced.current = amount;
          void utils.annual.getBudget.invalidate();
          void utils.annual.getSummary.invalidate();
        })
        .finally(() => setSaving(false));
    }, 600);
    return () => clearTimeout(t);
  }, [value, year, currency, disabled, query.isLoading]);

  return (
    <div className="relative inline-flex items-center">
      <PiggyBank className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        disabled={disabled || query.isLoading}
        placeholder={query.isLoading ? "Loading…" : "Set annual budget"}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Annual budget for ${year}`}
        className={cn(
          "h-9 w-44 rounded-md border border-input bg-background pl-9 pr-9 text-sm shadow-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      {saving ? (
        <Loader2 className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span className="pointer-events-none absolute right-2.5 text-xs font-medium text-muted-foreground">
          {currency}
        </span>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums" title={value}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, className }: { pct: number | null; className?: string }) {
  const width = pct === null || pct < 0 ? 0 : Math.min(pct, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full bg-primary", className)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function AnnualBudgetCard({ summary }: { summary: AnnualSummary }) {
  const budgetQuery = trpc.annual.getBudget.useQuery({
    year: summary.year,
    currency: summary.currency,
  });
  const budget = budgetQuery.data?.amount ?? null;
  const currency = summary.currency;

  const forecastGross = summary.bridge.fullYear.gross || summary.bridge.actual.gross;
  const grossToDate = summary.bridge.actual.gross;
  const elapsed =
    summary.coverage.expected > 0 ? summary.coverage.uploaded / summary.coverage.expected : 0;
  const consumed = budget && budget > 0 ? grossToDate / budget : null;
  const variance = forecastGross - (budget ?? 0);
  const variancePct =
    budget && budget > 0 ? ((forecastGross - budget) / budget) * 100 : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <div>
          <CardTitle className="text-sm font-semibold">Budget vs forecast</CardTitle>
          <CardDescription>
            {summary.year} · {currency}
          </CardDescription>
        </div>
        <PiggyBank className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CardHeader>
      <CardContent className="p-4 pt-1">
        {budget === null ? (
          <p className="text-sm text-muted-foreground">
            No budget set yet. Enter an amount in the toolbar to compare it with the full-year
            forecast.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Annual budget"
              value={formatMoney(budget, currency)}
              sub={`${summary.coverage.uploaded} of ${summary.coverage.expected} periods uploaded`}
            />
            <Metric
              label="Full-year forecast (gross)"
              value={formatMoney(forecastGross, currency)}
              sub={`${summary.forecastMethod} method`}
            />
            <Metric
              label="Variance vs budget"
              value={`${variance >= 0 ? "+" : "−"}${formatMoney(Math.abs(variance), currency)}`}
              sub={variancePct === null ? "n/a" : `${(variance >= 0 ? variancePct : -variancePct).toFixed(1)}% ${variance >= 0 ? "over" : "under"} budget`}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Budget consumed / year elapsed</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <ProgressBar pct={consumed !== null ? consumed * 100 : null} />
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {consumed === null ? "0%" : `${(consumed * 100).toFixed(0)}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <ProgressBar pct={elapsed * 100} className="bg-muted-foreground/50" />
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {(elapsed * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}