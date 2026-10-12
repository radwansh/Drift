"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Briefcase, CalendarRange, ReceiptText, Users, Wallet, PieChart } from "lucide-react";
import { AnnualKpiCard, AnnualKpiCardSkeleton } from "@/components/annual/annual-kpi-card";
import {
  formatCompact,
  formatCount,
  formatMoney,
  formatPct,
  periodNameFor,
  type Scope,
} from "@/components/annual/annual-utils";

interface AnnualKpiCardsProps {
  summary: AnnualSummary | null;
}

/**
 * The KPI row (step 34, finding U5).
 *
 * Four problems, all fixed here: cards mixed scopes without saying so (the
 * employer-cost card was a full-year forecast sitting next to to-date cards);
 * they mixed money formats, printing "$3,089,200.00" under "USD 2.67M"; they
 * showed raw ISO dates ("up to 2026-09-30"); and turnover was computed but never
 * displayed anywhere.
 */
export function AnnualKpiCards({ summary }: AnnualKpiCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <AnnualKpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const currency = summary.currency;
  const cat = summary.categories.byCategory;
  const { actual, forecast, fullYear } = summary.bridge;
  const statutory = summary.statutory;

  const actualPeriods = summary.periods.filter((p) => p.kind === "actual");
  const latestHeadcount =
    actualPeriods.length > 0 ? actualPeriods[actualPeriods.length - 1]!.headcount : null;

  const costPerEmployeeToDate =
    summary.avgHeadcountYtd > 0 ? actual.totalEmploymentCost / summary.avgHeadcountYtd : null;
  const costPerEmployeeAnnualised =
    summary.avgHeadcountFullYear > 0 ? fullYear.totalEmploymentCost / summary.avgHeadcountFullYear : null;

  const taxesToDate =
    (cat.income_tax ?? 0) + (cat.social_security_employee ?? 0) + statutory.employerOnCostTotal;

  const estimatedCount = summary.coverage.estimatedLabels.length;
  const estimatedBadge =
    estimatedCount > 0
      ? `incl. ${estimatedCount} estimated ${estimatedCount === 1 ? "period" : "periods"}`
      : undefined;

  const lastPeriod = periodNameFor(summary.coverage.lastPeriodEnd);

  const cards: {
    title: string;
    display: string;
    fullValue?: string;
    scope: Scope;
    subtext?: string;
    badge?: string;
    icon: typeof Wallet;
  }[] = [
    {
      title: "Salaries paid",
      display: formatCompact(actual.net, currency),
      fullValue: formatMoney(actual.net, currency),
      scope: "to_date",
      // A period name, not an ISO date.
      subtext: `Net, through ${lastPeriod}. Gross ${formatCompact(actual.gross, currency)}.`,
      icon: Wallet,
    },
    {
      title: `Salaries forecast`,
      display: formatCompact(fullYear.net, currency),
      fullValue: formatMoney(fullYear.net, currency),
      scope: "full_year_forecast",
      subtext: `Net. ${formatCompact(actual.net, currency)} paid plus ${formatCompact(forecast.net, currency)} to come.`,
      badge: estimatedBadge,
      icon: CalendarRange,
    },
    {
      title: "Total employer cost",
      display: formatCompact(fullYear.totalEmploymentCost, currency),
      fullValue: formatMoney(fullYear.totalEmploymentCost, currency),
      // v1 showed this figure with no label at all, so a forecast read as fact.
      scope: "full_year_forecast",
      subtext: `Gross plus employer costs. ${formatCompact(actual.totalEmploymentCost, currency)} to date.`,
      badge: estimatedBadge,
      icon: Briefcase,
    },
    {
      title: "Headcount",
      display: latestHeadcount !== null ? formatCount(latestHeadcount) : "—",
      scope: "to_date",
      subtext: [
        `Average ${summary.avgHeadcountYtd.toFixed(1)}`,
        `${formatCount(summary.headcount.joinerTotal)} joined`,
        `${formatCount(summary.headcount.leaverTotal)} left`,
        // Turnover was computed and then never shown (finding C9 / KPI 9).
        `turnover ${formatPct(summary.headcount.turnoverRate)}`,
        summary.headcount.annualisedTurnoverRate !== null
          ? `${formatPct(summary.headcount.annualisedTurnoverRate)} annualised`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      icon: Users,
    },
    {
      title: "Cost per employee",
      display: costPerEmployeeToDate !== null ? formatCompact(costPerEmployeeToDate, currency) : "—",
      fullValue: costPerEmployeeToDate !== null ? formatMoney(costPerEmployeeToDate, currency) : undefined,
      // v1 led with a year-to-date figure and put an annualised one beside it
      // without saying which was which.
      scope: "to_date",
      subtext:
        costPerEmployeeAnnualised !== null
          ? `Annualised ${formatCompact(costPerEmployeeAnnualised, currency)} on average headcount ${summary.avgHeadcountFullYear.toFixed(1)}.`
          : undefined,
      icon: PieChart,
    },
    {
      title: "Taxes and social security",
      display: formatCompact(taxesToDate, currency),
      fullValue: formatMoney(taxesToDate, currency),
      scope: "to_date",
      // State the definition on screen (KPI 13).
      subtext: `Income tax, employee social security and employer on-costs. Employer on-cost rate ${formatPct(
        statutory.employerOnCostRate,
      )} of gross.`,
      icon: ReceiptText,
    },
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <AnnualKpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}
