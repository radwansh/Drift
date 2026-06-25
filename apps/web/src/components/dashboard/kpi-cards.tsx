"use client";

import type { AggregatedSummary } from "@saas/payroll-core";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatCurrency } from "@/lib/utils";

interface KpiCardsProps {
  summary: AggregatedSummary | null;
}

export function KpiCards({ summary }: KpiCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCard key={i} title="" value="" loading />
        ))}
      </div>
    );
  }

  const variance = summary.totalPayrollVariance;
  const isPositive = variance.absolute >= 0;

  const cards = [
    {
      title: "Total Variance",
      value: formatCurrency(Math.abs(variance.absolute)),
      subtext: variance.percentage !== null ? `${isPositive ? "+" : ""}${variance.percentage.toFixed(1)}%` : "N/A",
      iconName: isPositive ? "TrendingUp" : "TrendingDown",
      trend: isPositive ? "up" as const : "down" as const,
    },
    {
      title: "Employees Affected",
      value: summary.employeesAffected.total.toString(),
      subtext: `${summary.employeesAffected.increased} ↑ · ${summary.employeesAffected.decreased} ↓`,
      iconName: "Users",
      trend: "neutral" as const,
    },
    {
      title: "New Employees",
      value: summary.newEmployees.toString(),
      subtext: "Added this period",
      iconName: "UserPlus",
      trend: "up" as const,
    },
    {
      title: "Departed Employees",
      value: summary.departedEmployees.toString(),
      subtext: "Removed this period",
      iconName: "UserMinus",
      trend: "down" as const,
    },
    {
      title: "Largest Increase",
      value: summary.largestIncrease ? formatCurrency(summary.largestIncrease.amount) : "—",
      subtext: summary.largestIncrease ? `${summary.largestIncrease.employeeName} (${summary.largestIncrease.department ?? "N/A"})` : "None",
      iconName: "ArrowUpCircle",
      trend: "up" as const,
    },
    {
      title: "Largest Decrease",
      value: summary.largestDecrease ? formatCurrency(Math.abs(summary.largestDecrease.amount)) : "—",
      subtext: summary.largestDecrease ? `${summary.largestDecrease.employeeName} (${summary.largestDecrease.department ?? "N/A"})` : "None",
      iconName: "ArrowDownCircle",
      trend: "down" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}
