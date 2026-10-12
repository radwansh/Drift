"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Gauge,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney, formatPct, formatSignedPct } from "@/components/annual/annual-utils";

type Basis = "gross" | "employer_cost" | "net";

const BASIS_LABELS: Record<Basis, string> = {
  gross: "Gross pay",
  employer_cost: "Total employment cost",
  net: "Net pay",
};

/** Group digits while typing, so a large figure is readable as it is entered. */
function formatWithSeparators(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [intPart, ...rest] = cleaned.split(".");
  const grouped = (intPart ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length > 0 ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

function parseAmount(display: string): number | null {
  const cleaned = display.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

interface BudgetInputProps {
  year: number;
  currency: string;
  disabled?: boolean;
}

/**
 * The budget editor (step 37, finding U6).
 *
 * v1 was a bare number input in the toolbar that saved 600ms after every
 * keystroke — so typing "1200000" fired a save for 1, 12, 120, 1200 and so on,
 * each one a write and an invalidation. It had no thousands separators (a
 * `type="number"` field cannot show them), no error message if the save failed,
 * and the placeholder was clipped to "Set annual bu".
 *
 * It is now a dialog with a grouped text input, a basis select and an explicit
 * Save, so exactly one write happens per edit.
 */
export function BudgetInput({ year, currency, disabled }: BudgetInputProps) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const query = trpc.annual.getBudget.useQuery({ year, currency }, { enabled: !disabled });
  const save = trpc.annual.setBudget.useMutation({
    onSuccess: () => {
      void utils.annual.getBudget.invalidate();
      void utils.annual.getSummary.invalidate();
      setOpen(false);
    },
  });

  const [display, setDisplay] = useState("");
  const [basis, setBasis] = useState<Basis>("gross");

  // Seed from the server only when the dialog opens, so a background refetch
  // cannot overwrite what is being typed (finding C18).
  useEffect(() => {
    if (!open || query.data === undefined) return;
    setDisplay(query.data.amount === null ? "" : formatWithSeparators(String(query.data.amount)));
    setBasis((query.data.basis as Basis) ?? "gross");
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query.data === undefined]);

  const parsed = parseAmount(display);
  const invalid = parsed !== null && Number.isNaN(parsed);
  const current = query.data?.amount ?? null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || query.isLoading}
        onClick={() => setOpen(true)}
      >
        <PiggyBank className="mr-2 h-4 w-4" aria-hidden="true" />
        {current === null ? "Set annual budget" : `Budget ${formatMoney(current, currency)}`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annual budget for {year}</DialogTitle>
            <DialogDescription>
              Compared against the full-year forecast on the basis you choose.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="budget-amount" className="text-sm font-medium">
                Amount ({currency})
              </label>
              <input
                id="budget-amount"
                // Text, not number: a number input cannot display separators.
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={display}
                onChange={(e) => setDisplay(formatWithSeparators(e.target.value))}
                placeholder="e.g. 1,200,000"
                aria-invalid={invalid}
                className={cn(
                  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm tabular-nums",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  invalid && "border-destructive",
                )}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to remove the budget.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="budget-basis" className="text-sm font-medium">
                Measured against
              </label>
              <Select value={basis} onValueChange={(v) => setBasis(v as Basis)}>
                <SelectTrigger id="budget-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BASIS_LABELS) as Basis[]).map((b) => (
                    <SelectItem key={b} value={b}>
                      {BASIS_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* A real error state: a failed save was previously silent. */}
            {save.error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  {save.error.data?.code === "FORBIDDEN"
                    ? "Setting the budget requires the admin or manager role."
                    : save.error.message}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate({ year, currency, amount: parsed, basis })}
              disabled={save.isPending || invalid}
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 break-words text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, className }: { pct: number | null; className?: string }) {
  const width = pct === null || pct < 0 ? 0 : Math.min(pct, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full bg-primary", className)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function AnnualBudgetCard({ summary }: { summary: AnnualSummary }) {
  const budgetQuery = trpc.annual.getBudget.useQuery({
    year: summary.year,
    currency: summary.currency,
  });

  const budget = budgetQuery.data?.amount ?? null;
  const basis = (budgetQuery.data?.basis as Basis) ?? "gross";
  const currency = summary.currency;

  const forecastOnBasis = useMemo(() => {
    const fy = summary.bridge.fullYear;
    if (basis === "net") return fy.net;
    if (basis === "employer_cost") return fy.totalEmploymentCost;
    return fy.gross;
  }, [summary, basis]);

  const actualOnBasis = useMemo(() => {
    const a = summary.bridge.actual;
    if (basis === "net") return a.net;
    if (basis === "employer_cost") return a.totalEmploymentCost;
    return a.gross;
  }, [summary, basis]);

  /**
   * Year elapsed from the last slot, not from the count of uploads (finding U6).
   *
   * With June missing and data through September, v1 divided 8 uploads by 12
   * expected and reported 67% of the year gone; three quarters of it had
   * actually passed. Every row that is not a forecast lies at or before the last
   * covered slot, so counting them gives the elapsed position.
   */
  const elapsedSlots = summary.periods.filter((p) => p.kind !== "forecast").length;
  const elapsed = summary.coverage.expected > 0 ? elapsedSlots / summary.coverage.expected : 0;

  const consumed = budget && budget > 0 ? actualOnBasis / budget : null;
  const variance = forecastOnBasis - (budget ?? 0);
  const variancePct = budget && budget > 0 ? (variance / budget) * 100 : null;
  const over = variance > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <div>
          <CardTitle className="text-sm font-semibold">Budget vs forecast</CardTitle>
          <CardDescription>
            {summary.year} · {currency} · {BASIS_LABELS[basis].toLowerCase()}
          </CardDescription>
        </div>
        <PiggyBank className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="p-4 pt-1">
        {budget === null ? (
          <p className="text-sm text-muted-foreground">
            No budget set yet. Use the Set annual budget button to compare one against the full-year
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
              label={`Full-year forecast (${BASIS_LABELS[basis].toLowerCase()})`}
              value={formatMoney(forecastOnBasis, currency)}
              sub={
                summary.coverage.estimatedLabels.length > 0
                  ? `incl. ${summary.coverage.estimatedLabels.length} estimated`
                  : undefined
              }
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Variance vs budget</p>
              {/* Red or green, with an icon and words — not a bare number. */}
              <p
                className={cn(
                  "mt-1 flex items-center gap-1.5 break-words text-lg font-semibold tabular-nums",
                  over ? "text-destructive" : "text-emerald-600 dark:text-emerald-500",
                )}
              >
                {over ? (
                  <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {formatMoney(Math.abs(variance), currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatSignedPct(variancePct)} · {over ? "over budget" : "under budget"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Budget used vs year elapsed</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <ProgressBar pct={consumed !== null ? consumed * 100 : null} />
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {consumed === null ? "0%" : formatPct(consumed * 100)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CircleCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <ProgressBar pct={elapsed * 100} className="bg-muted-foreground/50" />
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {formatPct(elapsed * 100)}
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
