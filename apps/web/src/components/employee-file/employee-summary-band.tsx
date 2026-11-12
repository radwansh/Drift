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
import { Badge, Stat } from "@/components/cv";
import { formatMoney, formatPct, SCOPE_LABELS, type Scope } from "@/components/annual/annual-utils";
import { KPI_SUPPRESSION_LABELS } from "@/components/employee-file/employee-file-text";

/**
 * The year summary band (step E5, spec 4.2) — the default view, on Ink &
 * Signal (canvas board "Employee File: one person").
 *
 * Six `Stat`s in a 3-column grid, each with its scope label in the label row,
 * so nothing is mistaken for a full year it does not cover.
 *
 * **Every figure except coverage is a `Kpi<T>`**, and the suppressed case
 * renders its reason rather than a number — as `Stat muted`, so the card reads
 * in ink-subtle and never looks like a figure. That is enforced by the type,
 * not by this component remembering to check: if `averageGrossPerPaidPeriod`
 * returned `number`, a card could print it with no window label and nothing
 * would fail.
 *
 * Employer cost is the one worth naming. With no component in range classifying
 * to an employer category it reads `Employer costs not mapped` — **never 0**. A
 * zero there is a claim that the employer pays nothing on top of salary, which
 * is false in every jurisdiction the product runs in.
 */

/**
 * A suppression reason in the place the figure would have been.
 *
 * Set at body size inside `Stat`'s 36px figure slot: the reasons are sentences
 * ("No period here is free of a one-off, a part period or duplicate rows"), and
 * a sentence at KPI size is unreadable before it is honest. `muted` on the
 * `Stat` keeps it in ink-subtle, which is what stops it reading as a figure.
 */
function SuppressedValue({ kpi }: { kpi: Kpi<unknown> }) {
  if (kpi.ok) return null;
  return (
    <span className="text-[15px] font-medium leading-[22px]">
      {KPI_SUPPRESSION_LABELS[kpi.reason]}
    </span>
  );
}

export function EmployeeSummaryBand({ file, scope }: { file: EmployeeFileResult; scope: Scope }) {
  const { kpis, currency, decimals } = file;
  const paid = paidSlots(file.slots);
  const scopeBadge = <Badge tone="neutral">{SCOPE_LABELS[scope]}</Badge>;

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
   * `USD 0.00` under a caption reading "Not paid in this range" — against this
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
      <Stat
        label="Gross paid in range"
        aside={scopeBadge}
        muted={!kpis.grossInRange.ok}
        value={
          kpis.grossInRange.ok ? (
            formatMoney(kpis.grossInRange.value, currency)
          ) : (
            <SuppressedValue kpi={kpis.grossInRange} />
          )
        }
        caption={`${coverage.paid} of ${coverage.covered} uploaded periods paid${
          coverage.notUploaded > 0 ? ` · ${coverage.notUploaded} never uploaded` : ""
        }`}
      />

      <Stat
        label="Net paid in range"
        aside={scopeBadge}
        muted={!kpis.netInRange.ok}
        value={
          kpis.netInRange.ok ? (
            formatMoney(kpis.netInRange.value, currency)
          ) : (
            <SuppressedValue kpi={kpis.netInRange} />
          )
        }
      />

      <Stat
        label="Employee deductions"
        aside={scopeBadge}
        muted={!kpis.bridge.ok}
        value={
          kpis.bridge.ok ? (
            formatMoney(kpis.bridge.value.deductions, currency)
          ) : (
            <SuppressedValue kpi={kpis.bridge} />
          )
        }
        caption={
          deductionSplit.length > 0 ? (
            <span className="flex flex-col">
              {deductionSplit.map((entry) => (
                <span key={entry.category}>
                  {CATEGORY_LABELS[entry.category]}:{" "}
                  <span className="cv-num">{formatMoney(entry.total, currency)}</span>
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
      />

      {/*
        K13, as gross plus employer costs rather than the on-top amount: the
        difference would be arithmetic done here, and when K1 is suppressed it
        would silently print the whole total as if it were the increment.

        Never 0. With no component in range classifying to an employer category
        this reads `Employer costs not mapped` — a zero there is a claim that
        the employer pays nothing on top of salary. K14's rate rides in the
        caption with its component count, because one mapped employer line plus
        one unmapped reads as a low on-cost rate rather than as missing data.
      */}
      <Stat
        label="Total employment cost"
        aside={scopeBadge}
        muted={!kpis.totalEmploymentCost.ok}
        value={
          kpis.totalEmploymentCost.ok ? (
            formatMoney(kpis.totalEmploymentCost.value.total, currency)
          ) : (
            <SuppressedValue kpi={kpis.totalEmploymentCost} />
          )
        }
        caption={
          kpis.totalEmploymentCost.ok ? (
            <>
              {kpis.totalEmploymentCost.value.componentCount} employer{" "}
              {kpis.totalEmploymentCost.value.componentCount === 1 ? "component" : "components"}{" "}
              found.{" "}
              {kpis.employerOnCostRate.ok
                ? `On-cost rate ${formatPct(kpis.employerOnCostRate.value.value)} over ${
                    kpis.employerOnCostRate.value.paidPeriods
                  } paid periods.`
                : KPI_SUPPRESSION_LABELS[kpis.employerOnCostRate.reason]}
            </>
          ) : undefined
        }
      />

      {/* K6, with the slot named beside the scope. Never presented as "monthly
          salary" on its own, which is why K5's mean sits beside it with its
          exclusions. */}
      <Stat
        label="Recurring pay, latest clean period"
        aside={
          <span className="flex flex-none items-center gap-1.5">
            {kpis.recurringLatest.ok && (
              <Badge tone="neutral">{kpis.recurringLatest.value.slotLabel}</Badge>
            )}
            {scopeBadge}
          </span>
        }
        muted={!kpis.recurringLatest.ok}
        value={
          kpis.recurringLatest.ok ? (
            formatMoney(kpis.recurringLatest.value.value, currency)
          ) : (
            <SuppressedValue kpi={kpis.recurringLatest} />
          )
        }
        caption={
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
      />

      <Stat
        label="Variable and one-off pay"
        aside={scopeBadge}
        muted={!variable.ok}
        value={
          variable.ok ? formatMoney(variable.value, currency) : <SuppressedValue kpi={variable} />
        }
        caption={
          kpis.variableShare.ok
            ? `${formatPct(kpis.variableShare.value.value)} of gross, over ${
                kpis.variableShare.value.paidPeriods
              } paid periods.`
            : KPI_SUPPRESSION_LABELS[kpis.variableShare.reason]
        }
      />
    </div>
  );
}
