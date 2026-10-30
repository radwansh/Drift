"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { YearSelector } from "@/components/annual/year-selector";
import { AnnualKpiCards } from "@/components/annual/annual-kpi-cards";
import { AnnualPeriodsChart } from "@/components/annual/annual-periods-chart";
import { AnnualBridge } from "@/components/annual/annual-bridge";
import { AnnualStatutory } from "@/components/annual/annual-statutory";
import { AnnualHeadcountChart } from "@/components/annual/annual-headcount-chart";
import { AnnualCategories } from "@/components/annual/annual-categories";
import { AnnualAbsences } from "@/components/annual/annual-absences";
import { AnnualDepartments } from "@/components/annual/annual-departments";
import { AnnualYoY } from "@/components/annual/annual-yoy";
import { AnnualMix } from "@/components/annual/annual-mix";
import { AnnualWarnings } from "@/components/annual/annual-warnings";
import { CategoryManager } from "@/components/annual/category-manager";
import { BudgetInput, AnnualBudgetCard } from "@/components/annual/annual-budget";
import { AnnualInsights } from "@/components/annual/annual-insights";
import { AnnualExport } from "@/components/annual/annual-export";
import { AnnualScenario } from "@/components/annual/annual-scenario";
import { AnnualAuditTrail } from "@/components/annual/annual-audit-trail";
import { AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

const METHOD_LABELS: Record<string, string> = {
  run_rate: "Run rate",
  average: "Average (last 3)",
  prior_year: "Prior year",
};

type PeriodTypeValue = "monthly" | "weekly" | "bi_monthly" | "bi_weekly";
type MethodValue = "run_rate" | "average" | "prior_year";

const PERIOD_TYPES: PeriodTypeValue[] = ["monthly", "weekly", "bi_monthly", "bi_weekly"];
const METHODS: MethodValue[] = ["run_rate", "average", "prior_year"];

/**
 * The annual dashboard (step 38, findings U12, U13, U14).
 *
 * Controls live in the URL rather than in component state. Two things follow.
 * First, a pasted or reloaded URL reproduces the exact view — previously only
 * the year survived, so a cadence or currency selection could not be shared.
 * Second, the page stops fetching the summary twice: an effect used to copy the
 * server's resolved `periodType` and `currency` into state, which changed the
 * query key and triggered a second request on every load and year change
 * (finding U13). The server resolves its own defaults and the client simply
 * leaves those params absent until the user picks something.
 */
export function AnnualDashboard({
  initialYear,
  availableYears,
}: {
  initialYear: number;
  availableYears: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categoriserOpen, setCategoriserOpen] = useState(0);

  const yearParam = Number(searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : initialYear;

  const cadenceParam = searchParams.get("cadence");
  const cadence = PERIOD_TYPES.includes(cadenceParam as PeriodTypeValue)
    ? (cadenceParam as PeriodTypeValue)
    : undefined;

  const currencyParam = searchParams.get("currency");
  const currency = currencyParam && /^[A-Za-z]{3}$/.test(currencyParam)
    ? currencyParam.toUpperCase()
    : undefined;

  const methodParam = searchParams.get("method");
  const method = METHODS.includes(methodParam as MethodValue) ? (methodParam as MethodValue) : undefined;

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const summaryQuery = trpc.annual.getSummary.useQuery(
    { year, periodType: cadence, currency, forecastMethod: method },
    {
      retry: 1,
      // Keep the previous year's figures on screen while the next load runs,
      // instead of collapsing the whole page to skeletons (finding U13).
      placeholderData: keepPreviousData,
    },
  );

  const summary = summaryQuery.data ?? null;
  const methodsAvailable = summary?.methodsAvailable ?? ["run_rate", "average"];
  const openCategoriser = useCallback(() => setCategoriserOpen((n) => n + 1), []);
  /**
   * Step 12a. FORECAST_HOLDS_HEADCOUNT has no fix — the forecast cannot
   * invent a hiring plan — so its action takes the reader to the card that
   * prices one rather than opening a dialog.
   */
  const scenarioRef = useRef<HTMLDivElement>(null);
  const openScenario = useCallback(() => {
    scenarioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Annual salaries</h2>
          <p className="mt-1 text-muted-foreground">Calendar-year payroll totals and forecast</p>
        </div>
        <YearSelector
          initialYear={year}
          availableYears={availableYears}
          // Changing the year clears the cadence and currency so the server can
          // resolve them again for that year.
          onYearChange={(next) =>
            setParams({ year: String(next), cadence: null, currency: null })
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {summary && summary.allPeriodTypes.length > 1 && (
          <Select
            value={summary.periodType}
            onValueChange={(v) => setParams({ cadence: v })}
          >
            <SelectTrigger aria-label="Pay cadence" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {summary.allPeriodTypes.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {PERIOD_TYPE_LABELS[pt] ?? pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {summary && summary.allCurrencies.length > 1 && (
          <Select value={summary.currency} onValueChange={(v) => setParams({ currency: v })}>
            <SelectTrigger aria-label="Currency" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {summary.allCurrencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={summary?.forecastMethod ?? method ?? "run_rate"}
          onValueChange={(v) => setParams({ method: v })}
        >
          <SelectTrigger aria-label="Forecast method" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {methodsAvailable.map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABELS[m] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {summary && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
              summary.missingLabels.length > 0 ? "anomaly-warning" : "anomaly-info",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {summary.coverage.uploaded} of {summary.coverage.expected} periods
            {summary.coverage.estimatedLabels.length > 0 && (
              <span className="font-normal">
                · {summary.coverage.estimatedLabels.length} estimated
              </span>
            )}
          </span>
        )}

        {summary && (
          <CategoryManager
            year={summary.year}
            currency={summary.currency}
            periodType={summary.periodType}
            hasUncategorised={summary.warnings.some((w) => w.code === "UNCATEGORISED")}
            openSignal={categoriserOpen}
          />
        )}

        {summary && (
          <BudgetInput
            key={`${summary.year}-${summary.currency}`}
            year={summary.year}
            currency={summary.currency}
            disabled={summary.coverage.expected === 0}
          />
        )}

        {summary && <AnnualExport summary={summary} />}

        {summaryQuery.isFetching && !summaryQuery.isLoading && (
          <span className="text-xs text-muted-foreground" role="status">
            Updating…
          </span>
        )}
      </div>

      {summary && (
        <AnnualWarnings
          warnings={summary.warnings}
          onCategorise={openCategoriser}
          onOpenScenario={openScenario}
        />
      )}

      {summaryQuery.isLoading ? (
        <AnnualKpiCards summary={null} />
      ) : summaryQuery.isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold">Could not load the annual summary</h3>
          {/* A plain message: error.tsx used to print the raw error (finding U15). */}
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Something went wrong while building the figures for {year}. Retrying usually works; if it
            does not, the payroll data for this year may need re-uploading.
          </p>
          <Button className="mt-4" onClick={() => summaryQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : summary && summary.coverage.uploaded === 0 ? (
        /* The empty state now shows whenever nothing is uploaded. It used to
           require `expected === 0` as well, but coverage always expects 12
           monthly slots, so a year with no data rendered a page of zeros
           instead (finding U12). */
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No payroll uploaded for {summary.year}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Upload a payroll period to start building the annual view. A period counts toward
            {" "}
            {summary.year} when its status is ready and its end date falls in that year.
          </p>
          <Button className="mt-4" onClick={() => router.push("/payroll-periods")}>
            Go to payroll periods
          </Button>
        </div>
      ) : summary ? (
        <>
          <AnnualKpiCards summary={summary} />

          {summary.coverage.expected > 0 && <AnnualBudgetCard summary={summary} />}

          <AnnualInsights summary={summary} />

          <AnnualPeriodsChart summary={summary} />

          {/* items-start, so a short card no longer stretches to match a tall
              neighbour and leave a block of empty space (finding U14). */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <AnnualBridge summary={summary} />
            <AnnualStatutory summary={summary} />
          </div>

          <AnnualYoY summary={summary} />

          <AnnualHeadcountChart summary={summary} />

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <AnnualCategories summary={summary} onCategorise={openCategoriser} />
            <div className="grid grid-cols-1 items-start gap-6">
              <AnnualAbsences summary={summary} onCategorise={openCategoriser} />
              <AnnualMix summary={summary} />
            </div>
          </div>

          <div ref={scenarioRef}>
            <AnnualScenario summary={summary} />
          </div>

          <AnnualDepartments summary={summary} />

          <AnnualAuditTrail />
        </>
      ) : null}
    </div>
  );
}
