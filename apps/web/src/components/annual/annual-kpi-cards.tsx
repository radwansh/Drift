"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Briefcase, CalendarRange, ReceiptText, Users, Wallet, PieChart } from "lucide-react";
import { AnnualKpiCard, AnnualKpiCardSkeleton } from "@/components/annual/annual-kpi-card";
import { formatCompact, formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualKpiCardsProps {
  summary: AnnualSummary | null;
}

export function AnnualKpiCards({ summary }: AnnualKpiCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <AnnualKpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const currency = summary.currency;
  const cat = summary.categories.byCategory;
  const actual = summary.bridge.actual;
  const forecast = summary.bridge.forecast;
  const fullYear = summary.bridge.fullYear;
  const statutory = summary.statutory;

  const actualPeriods = summary.periods.filter((p) => p.kind === "actual");
  const latestHeadcount = actualPeriods.length > 0
    ? actualPeriods[actualPeriods.length - 1]!.headcount
    : null;

  const costPerEmployeeToDate = summary.avgHeadcountYtd > 0
    ? actual.totalEmploymentCost / summary.avgHeadcountYtd
    : null;
  const costPerEmployeeAnnualised = summary.avgHeadcountFullYear > 0
    ? fullYear.totalEmploymentCost / summary.avgHeadcountFullYear
    : null;

  const taxesToDate =
    (cat.income_tax ?? 0) + (cat.social_security_employee ?? 0) + statutory.employerOnCostTotal;

  const cards = [
    {
      title: "Total Paid Salaries Up To Now",
      display: formatCompact(actual.net, currency),
      titleAttr: formatMoney(actual.net, currency),
      subtext: `gross ${formatMoney(actual.gross, currency)} · up to ${summary.coverage.lastPeriodEnd ?? "—"}`,
      icon: Wallet,
    },
    {
      title: `Total Forecasted Salaries - Full Year ${summary.year}`,
      display: formatCompact(fullYear.net, currency),
      titleAttr: formatMoney(fullYear.net, currency),
      subtext: `actual ${formatMoney(actual.net, currency)} + forecast ${formatMoney(forecast.net, currency)}`,
      icon: CalendarRange,
    },
    {
      title: "Total Employer Cost",
      display: formatCompact(fullYear.totalEmploymentCost, currency),
      titleAttr: formatMoney(fullYear.totalEmploymentCost, currency),
      subtext: `to date ${formatMoney(actual.totalEmploymentCost, currency)}`,
      icon: Briefcase,
    },
    {
      title: "Headcount",
      display: latestHeadcount !== null ? String(latestHeadcount) : "—",
      titleAttr: latestHeadcount !== null ? `${latestHeadcount} employees` : "",
      subtext: `avg ${summary.avgHeadcountYtd.toFixed(1)} · ${summary.headcount.joinerTotal} joiners · ${summary.headcount.leaverTotal} leavers`,
      icon: Users,
    },
    {
      title: "Average Cost per Employee",
      display: costPerEmployeeToDate !== null ? formatCompact(costPerEmployeeToDate, currency) : "—",
      titleAttr: costPerEmployeeToDate !== null ? formatMoney(costPerEmployeeToDate, currency) : "",
      subtext: costPerEmployeeAnnualised !== null
        ? `annualised ${formatMoney(costPerEmployeeAnnualised, currency)}`
        : "annualised —",
      icon: PieChart,
    },
    {
      title: "Taxes and Social Security to Date",
      display: formatCompact(taxesToDate, currency),
      titleAttr: formatMoney(taxesToDate, currency),
      subtext: `effective tax rate ${formatPct(statutory.effectiveTaxRate)}`,
      icon: ReceiptText,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <AnnualKpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}