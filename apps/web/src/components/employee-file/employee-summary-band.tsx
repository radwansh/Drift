"use client";

import {
  CATEGORY_LABELS,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  paidSlots,
  sumSlots,
  type Category,
  type EmployeeFileResult,
  type Kpi,
} from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatMoney,
  formatPct,
  SCOPE_LABELS,
  type Scope,
} from "@/components/annual/annual-utils";
import { KPI_SUPPRESSION_LABELS } from "@/components/employee-file/employee-file-text";

/**
 * The year summary band (step E5, spec 4.2) — the default view.
 *
 * Six figures, each with its scope label, so nothing is mistaken for a full
 * year it does not cover.
 *
 * **Every figure except coverage is a `Kpi<T>`**, and the suppressed case
 * renders its reason rather than a number. That is enforced by the type, not by
 * this component remembering to check: if `averageGrossPerPaidPeriod` returned
 * `number`, a card could print it with no window label and nothing would fail.
 *
 * Employer cost is the one worth naming. With no component in range classifying
 * to an employer category it reads `Employer costs not mapped` — **never 0**. A
 * zero there is a claim that the employer pays nothing on top of salary, which
 * is false in every jurisdiction the product runs in.
 */

function Figure({
  title,
  scope,
  children,
  subtext,
  badge,
}: {
  title: string;
  scope: Scope;
  children: React.ReactNode;
  subtext?: React.ReactNode;
  badge?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-1 p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="truncate text-sm text-muted-foreground">{title}</p>
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {SCOPE_LABELS[scope]}
          </Badge>
        </div>
        <div className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
          {children}
        </div>
        {subtext && <p className="break-words text-xs text-muted-foreground">{subtext}</p>}
        {badge && (
          <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
            {badge}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

/** A suppressed KPI's reason, in the place the figure would have been. */
function Suppressed({ kpi }: { kpi: Kpi<unknown> }) {
  if (kpi.ok) return null;
  return (
    <span className="text-base font-medium text-muted-foreground">
      {KPI_SUPPRESSION_LABELS[kpi.reason]}
    </span>
  );
}

export function EmployeeSummaryBand({
  file,
  scope,
}: {
  file: EmployeeFileResult;
  scope: Scope;
}) {
  const { kpis, currency, decimals } = file;
  const paid = paidSlots(file.slots);

  // The split is `sumSlots` over the engine's own per-slot category totals, so
  // the band and the period table cannot disagree about a deduction: the view
  // names a field, the engine does the arithmetic.
  const deductionSplit = EMPLOYEE_DEDUCTION_CATEGORIES.map((category: Category) => ({
    category,
    total: sumSlots(paid, (slot) => slot.byCategory[category] ?? null, decimals),
  })).filter((entry) => entry.total !== 0);

  /**
   * Variable pay as a `Kpi<number>`, like every other figure on this band.
   *
   * It was a bare `sumSlots`, so a file with no paid slot in range rendered
   * `USD 0.00` under subtext reading "Not paid in this range" — against this
   * component's own documented rule and against the "a 0 is a claim" argument
   * the employer-cost card next to it is built on. Nothing was paid, so there
   * is no variable pay to report, which is not the same as none being paid.
   *
   * Suppressed on `kpis.grossInRange`, so the band cannot end up with one card
   * suppressed and another not from the same empty range.
   */
  const variable: Kpi<number> = kpis.grossInRange.ok
    ? { ok: true, value: sumSlots(paid, (slot) => slot.variable, decimals) }
    : kpis.grossInRange;
  const coverage = kpis.coverage;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Figure
        title="Gross paid in range"
        scope={scope}
        subtext={`${coverage.paid} of ${coverage.covered} uploaded periods paid${
          coverage.notUploaded > 0 ? ` · ${coverage.notUploaded} never uploaded` : ""
        }`}
      >
        {kpis.grossInRange.ok ? (
          formatMoney(kpis.grossInRange.value, currency)
        ) : (
          <Suppressed kpi={kpis.grossInRange} />
        )}
      </Figure>

      <Figure title="Net paid in range" scope={scope}>
        {kpis.netInRange.ok ? (
          formatMoney(kpis.netInRange.value, currency)
        ) : (
          <Suppressed kpi={kpis.netInRange} />
        )}
      </Figure>

      <Figure
        title="Employee deductions"
        scope={scope}
        subtext={
          deductionSplit.length > 0 ? (
            <span className="flex flex-col">
              {deductionSplit.map((entry) => (
                <span key={entry.category}>
                  {CATEGORY_LABELS[entry.category]}: {formatMoney(entry.total, currency)}
                </span>
              ))}
            </span>
          ) : kpis.bridge.ok ? (
            // The split is empty and there *is* data, so the sentence is true:
            // the register's deductions did not classify to an employee
            // category.
            "No deduction column in range classifies here."
          ) : (
            // Nothing was paid in range, so there is no column to classify.
            // Blaming the mapping for an empty range names the wrong cause.
            KPI_SUPPRESSION_LABELS[kpis.bridge.reason]
          )
        }
      >
        {kpis.bridge.ok ? (
          formatMoney(kpis.bridge.value.deductions, currency)
        ) : (
          <Suppressed kpi={kpis.bridge} />
        )}
      </Figure>

      {/*
        K13, as gross plus employer costs rather than the on-top amount: the
        difference would be arithmetic done here, and when K1 is suppressed it
        would silently print the whole total as if it were the increment.

        Never 0. With no component in range classifying to an employer category
        this reads `Employer costs not mapped` — a zero there is a claim that
        the employer pays nothing on top of salary. K14's rate rides in the
        subtext with its component count, because one mapped employer line plus
        one unmapped reads as a low on-cost rate rather than as missing data.
      */}
      <Figure
        title="Total employment cost"
        scope={scope}
        subtext={
          kpis.totalEmploymentCost.ok ? (
            <>
              {kpis.totalEmploymentCost.value.componentCount} employer{" "}
              {kpis.totalEmploymentCost.value.componentCount === 1
                ? "component"
                : "components"}{" "}
              found.{" "}
              {kpis.employerOnCostRate.ok
                ? `On-cost rate ${formatPct(kpis.employerOnCostRate.value.value)} over ${
                    kpis.employerOnCostRate.value.paidPeriods
                  } paid periods.`
                : KPI_SUPPRESSION_LABELS[kpis.employerOnCostRate.reason]}
            </>
          ) : undefined
        }
      >
        {kpis.totalEmploymentCost.ok ? (
          formatMoney(kpis.totalEmploymentCost.value.total, currency)
        ) : (
          <Suppressed kpi={kpis.totalEmploymentCost} />
        )}
      </Figure>

      {/* K6, with the slot named. Never presented as "monthly salary" on its
          own, which is why K5's mean sits beside it with its exclusions. */}
      <Figure
        title="Recurring pay, latest clean period"
        scope={scope}
        badge={kpis.recurringLatest.ok ? kpis.recurringLatest.value.slotLabel : undefined}
        subtext={
          kpis.averageGrossPerPaidPeriod.ok
            ? `Mean gross per paid period ${formatMoney(
                kpis.averageGrossPerPaidPeriod.value.mean,
                currency,
              )} over ${kpis.averageGrossPerPaidPeriod.value.periods}${
                kpis.averageGrossPerPaidPeriod.value.excludedLabels.length > 0
                  ? `, excluding ${kpis.averageGrossPerPaidPeriod.value.excludedLabels.join(", ")}`
                  : ""
              }.`
            : KPI_SUPPRESSION_LABELS[kpis.averageGrossPerPaidPeriod.reason]
        }
      >
        {kpis.recurringLatest.ok ? (
          formatMoney(kpis.recurringLatest.value.value, currency)
        ) : (
          <Suppressed kpi={kpis.recurringLatest} />
        )}
      </Figure>

      <Figure
        title="Variable and one-off pay"
        scope={scope}
        subtext={
          kpis.variableShare.ok
            ? `${formatPct(kpis.variableShare.value.value)} of gross, over ${
                kpis.variableShare.value.paidPeriods
              } paid periods.`
            : KPI_SUPPRESSION_LABELS[kpis.variableShare.reason]
        }
      >
        {variable.ok ? formatMoney(variable.value, currency) : <Suppressed kpi={variable} />}
      </Figure>
    </div>
  );
}
