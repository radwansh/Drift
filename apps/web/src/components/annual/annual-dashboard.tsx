"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { AlertCircle, AlertTriangle, Info, CalendarDays, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { PERIOD_TYPE_LABELS } from "@/lib/constants";

const WARNING_SEVERITY: Record<string, "critical" | "warning" | "info"> = {
  RECONCILIATION_GAP: "critical",
  MISSING_PERIODS: "warning",
  MIXED_SIGN: "warning",
  MIXED_CADENCE: "warning",
  MULTI_CURRENCY: "warning",
  MIXED_CURRENCY: "warning",
  UNCATEGORISED: "warning",
  LOW_HISTORY: "warning",
  DUPLICATES_IGNORED: "info",
  NO_DATA: "info",
};

const SEVERITY_STYLES: Record<"critical" | "warning" | "info", { icon: typeof Info; className: string }> = {
  critical: { icon: AlertCircle, className: "anomaly-critical" },
  warning: { icon: AlertTriangle, className: "anomaly-warning" },
  info: { icon: Info, className: "anomaly-info" },
};

function severityFor(message: string): "critical" | "warning" | "info" {
  const code = message.split(":")[0]?.trim().toUpperCase() ?? "";
  return WARNING_SEVERITY[code] ?? "info";
}

function formatWarning(message: string): string {
  return message.replace(/^[A-Z_]+:/, "").trim();
}

const METHOD_LABELS: Record<string, string> = {
  run_rate: "Run rate",
  average: "Average (last 3)",
  prior_year: "Prior year",
};

export function AnnualDashboard({
  initialYear,
  availableYears,
}: {
  initialYear: number;
  availableYears: number[];
}) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [periodType, setPeriodType] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [forecastMethod, setForecastMethod] = useState<string>("run_rate");

  const summaryQuery = trpc.annual.getSummary.useQuery(
    {
      year,
      periodType: (periodType ?? undefined) as "monthly" | "weekly" | "bi_monthly" | "bi_weekly" | undefined,
      currency: currency ?? undefined,
      forecastMethod: forecastMethod as "run_rate" | "average" | "prior_year",
    },
    { retry: 1 },
  );

  const summary = summaryQuery.data ?? null;

  useEffect(() => {
    if (!summaryQuery.data) return;
    if (periodType === null) setPeriodType(summaryQuery.data.periodType);
    if (currency === null) setCurrency(summaryQuery.data.currency);
    if (!summaryQuery.data.methodsAvailable.includes(forecastMethod as "run_rate" | "average" | "prior_year")) {
      setForecastMethod("run_rate");
    }
  }, [summaryQuery.data, periodType, currency, forecastMethod]);

  useEffect(() => {
    if (initialYear !== year) setYear(initialYear);
  }, [initialYear]);

  const handleYearChange = (nextYear: number) => {
    setYear(nextYear);
    setPeriodType(null);
    setCurrency(null);
  };

  const methodsAvailable = summary?.methodsAvailable ?? ["run_rate", "average"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Annual Salaries Dashboard</h2>
          <p className="text-muted-foreground mt-1">Calendar-year payroll totals and forecast</p>
        </div>
        <YearSelector initialYear={year} availableYears={availableYears} onYearChange={handleYearChange} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {summary && summary.allPeriodTypes.length > 1 && (
          <Select
            value={periodType ?? summary.periodType}
            onValueChange={(v) => setPeriodType(v)}
          >
            <SelectTrigger aria-label="Select period type" className="w-44">
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
          <Select
            value={currency ?? summary.currency}
            onValueChange={(v) => setCurrency(v)}
          >
            <SelectTrigger aria-label="Select currency" className="w-28">
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

        <Select value={forecastMethod} onValueChange={(v) => setForecastMethod(v)}>
          <SelectTrigger aria-label="Select forecast method" className="w-40">
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
            title={summary.missingLabels.length > 0 ? `Missing: ${summary.missingLabels.join(", ")}` : undefined}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {summary.coverage.uploaded} of {summary.coverage.expected} periods
            {summary.missingLabels.length > 0 && (
              <span className="font-normal">· missing: {summary.missingLabels.join(", ")}</span>
            )}
          </span>
        )}
      </div>

      {summary && summary.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {summary.warnings.map((warning, i) => {
            const severity = severityFor(warning);
            const meta = SEVERITY_STYLES[severity];
            const Icon = meta.icon;
            return (
              <div
                key={i}
                role="alert"
                className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", meta.className)}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formatWarning(warning)}</span>
              </div>
            );
          })}
        </div>
      )}

      {summaryQuery.isLoading ? (
        <AnnualKpiCards summary={null} />
      ) : summaryQuery.isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h3 className="mt-4 text-lg font-semibold">Could not load the annual summary</h3>
          <p className="mt-1 text-sm text-muted-foreground">Please try again.</p>
          <Button className="mt-4" onClick={() => summaryQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : summary && summary.coverage.uploaded === 0 && summary.coverage.expected === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No payroll data for {summary.year}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Upload a payroll period to start building your annual dashboard. Periods with status ready and an
            end date in {summary.year} count toward the year.
          </p>
          <Button className="mt-4" onClick={() => router.push("/payroll-periods")}>
            Go to Payroll Periods
          </Button>
        </div>
      ) : summary ? (
        <>
          <AnnualKpiCards summary={summary} />

          <div className="grid grid-cols-1 gap-6">
            <AnnualPeriodsChart summary={summary} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <AnnualBridge summary={summary} />
            <AnnualStatutory summary={summary} />
          </div>

          <AnnualYoY summary={summary} />

          <div className="grid grid-cols-1 gap-6">
            <AnnualHeadcountChart summary={summary} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <AnnualCategories summary={summary} />
            <div className="grid grid-cols-1 gap-6">
              <AnnualAbsences summary={summary} />
              <AnnualMix summary={summary} />
            </div>
          </div>

          <AnnualDepartments summary={summary} />
        </>
      ) : null}
    </div>
  );
}