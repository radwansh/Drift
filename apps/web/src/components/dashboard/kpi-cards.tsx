"use client";

import type { AggregatedSummary } from "@saas/payroll-core";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatCurrency } from "@/lib/utils";

interface KpiCardsProps {
  summary: AggregatedSummary | null;
  /** The company currency (step 8b). */
  currency: string;
  /** The period compared against, e.g. "June 2026", for the captions. */
  previousLabel?: string;
}

const MINUS = "−";

/** "+USD 10,345.00" / "−USD 120.00": the sign leads, the formatter stays the app's one. */
function signedMoney(amount: number, currency: string): string {
  if (amount === 0) return formatCurrency(0, currency);
  return `${amount > 0 ? "+" : MINUS}${formatCurrency(Math.abs(amount), currency)}`;
}

/**
 * The six Dashboard KPIs, in the canvas's order and words.
 *
 * Net variance leads: `totalPayrollVariance` is net — what actually left the bank — and
 * the card says so. Gross sits in its caption for anyone costing the payroll.
 */
export function KpiCards({ summary, currency, previousLabel }: KpiCardsProps) {
  const grid = "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3";

  if (!summary) {
    return (
      <section className={grid} aria-label="Key figures" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCard key={i} label="" loading />
        ))}
      </section>
    );
  }

  const since = previousLabel ? ` since ${previousLabel}` : "";
  const vs = previousLabel ? ` vs ${previousLabel}` : "";
  const variance = summary.totalPayrollVariance;
  const gross = summary.totalGross;
  const affected = summary.employeesAffected;

  return (
    <section className={grid} aria-label="Key figures">
      <KpiCard
        label="Net variance"
        value={signedMoney(variance.absolute, currency)}
        variance={
          variance.percentage !== null
            ? { value: variance.absolute, percent: variance.percentage, percentOnly: true }
            : undefined
        }
        caption={`Net pay${vs} · gross ${signedMoney(gross.absolute, currency)}`}
      />
      <KpiCard
        label="Employees affected"
        value={affected.total.toLocaleString("en-US")}
        caption={`${affected.increased} increased · ${affected.decreased} decreased · ${affected.unchanged} unchanged`}
      />
      <KpiCard
        label="Largest increase"
        value={
          summary.largestIncrease ? signedMoney(summary.largestIncrease.amount, currency) : "None"
        }
        muted={!summary.largestIncrease}
        caption={
          summary.largestIncrease
            ? `${summary.largestIncrease.employeeName} · ${summary.largestIncrease.department ?? "No department"}`
            : `Nobody was paid more than${previousLabel ? ` in ${previousLabel}` : " before"}`
        }
      />
      <KpiCard
        label="New employees"
        value={summary.newEmployees.toLocaleString("en-US")}
        caption={`Joined${since}`}
      />
      <KpiCard
        label="Departed employees"
        value={summary.departedEmployees.toLocaleString("en-US")}
        caption={`Left${since}`}
      />
      <KpiCard
        label="Largest decrease"
        value={
          summary.largestDecrease ? signedMoney(summary.largestDecrease.amount, currency) : "None"
        }
        muted={!summary.largestDecrease}
        caption={
          summary.largestDecrease
            ? `${summary.largestDecrease.employeeName} · ${summary.largestDecrease.department ?? "No department"}`
            : `Nobody was paid less than${previousLabel ? ` in ${previousLabel}` : " before"}`
        }
      />
    </section>
  );
}
