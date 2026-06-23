import type { ComparisonOutput, AggregatedSummary } from "./types";
import { collectAnomalies } from "./anomaly-detector";

export interface DistributionConfig {
  unchangedThresholdPct: number; // fraction expressed as percent (e.g., 0.01 for 0.01%)
  increased1Pct: number; // e.g., 5 for 5%
  increased2Pct: number; // e.g., 10 for 10%
  decreased1Pct: number; // e.g., -5
  decreased2Pct: number; // e.g., -10
  colors?: Record<string, string>;
}

export const DEFAULT_DISTRIBUTION_CONFIG: DistributionConfig = {
  unchangedThresholdPct: 0.01,
  increased1Pct: 5,
  increased2Pct: 10,
  decreased1Pct: -5,
  decreased2Pct: -10,
  colors: {
    "decreased >10%": "#ef4444",
    "decreased 1-10%": "#f97316",
    unchanged: "#6b7280",
    "increased 1-10%": "#22c55e",
    "increased >10%": "#16a34a",
  },
};

export function aggregateResults(
  results: ComparisonOutput[],
  distConfig: DistributionConfig = DEFAULT_DISTRIBUTION_CONFIG,
): AggregatedSummary {
  const total = results.length;
  let increased = 0;
  let decreased = 0;
  let unchanged = 0;

  let totalCurrent = 0;
  let totalPrevious = 0;

  for (const r of results) {
    if (r.status === "increased") increased++;
    else if (r.status === "decreased") decreased++;
    else if (r.status === "unchanged") unchanged++;

    const prevNet = Object.values(r.previousComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
    const currNet = Object.values(r.currentComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
    totalPrevious += prevNet;
    totalCurrent += currNet;
  }

  const newEmployees = results.filter((r) => r.status === "new").length;
  const departedEmployees = results.filter((r) => r.status === "departed").length;

  const absoluteVariance = totalCurrent - totalPrevious;
  const variancePct = totalPrevious !== 0 ? (absoluteVariance / totalPrevious) * 100 : null;

  const resultsWithDelta = results.filter(
    (r) => r.netDelta !== null && r.status !== "new" && r.status !== "departed",
  );

  const netDeltas = resultsWithDelta.map((r) => r.netDelta as number);
  const totalDeltaSum = netDeltas.reduce((s, v) => s + v, 0);
  const avgAbsolute = netDeltas.length > 0 ? totalDeltaSum / netDeltas.length : 0;

  const pctDeltas = resultsWithDelta
    .map((r) => {
      const prevNet = Object.values(r.previousComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
      return prevNet !== 0 ? (r.netDelta! / prevNet) * 100 : null;
    })
    .filter((p): p is number => p !== null);

  const avgPct = pctDeltas.length > 0 ? pctDeltas.reduce((s, v) => s + v, 0) / pctDeltas.length : null;

  const largestIncrease = resultsWithDelta
    .filter((r) => (r.netDelta ?? 0) > 0)
    .sort((a, b) => (b.netDelta ?? 0) - (a.netDelta ?? 0))[0] ?? null;

  const largestDecrease = resultsWithDelta
    .filter((r) => (r.netDelta ?? 0) < 0)
    .sort((a, b) => (a.netDelta ?? 0) - (b.netDelta ?? 0))[0] ?? null;

  const distribution = computeDistribution(results, distConfig);
  const componentBreakdown = computeComponentBreakdown(results);
  const departmentBreakdown = computeDepartmentBreakdown(results);
  const topMovers = computeTopMovers(results);
  const anomalies = collectAnomalies(results);

  const aggregateAvgAbs = netDeltas.length > 0 ? totalDeltaSum / netDeltas.length : 0;

  return {
    totalPayrollVariance: {
      absolute: absoluteVariance,
      percentage: variancePct !== null ? Math.round(variancePct * 100) / 100 : null,
    },
    employeesAffected: { total, increased, decreased, unchanged },
    newEmployees,
    departedEmployees,
    largestIncrease: largestIncrease
      ? { employeeName: largestIncrease.employeeName, department: largestIncrease.department, amount: largestIncrease.netDelta! }
      : null,
    largestDecrease: largestDecrease
      ? { employeeName: largestDecrease.employeeName, department: largestDecrease.department, amount: largestDecrease.netDelta! }
      : null,
    averageChange: {
      absolute: Math.round(aggregateAvgAbs * 100) / 100,
      percentage: avgPct !== null ? Math.round(avgPct * 100) / 100 : null,
    },
    distribution,
    componentBreakdown,
    departmentBreakdown,
    topMovers,
    anomalies,
  };
}

function computeDistribution(results: ComparisonOutput[], cfg: DistributionConfig) {
  const buckets: Record<string, number> = {
    "decreased >10%": 0,
    "decreased 1-10%": 0,
    unchanged: 0,
    "increased 1-10%": 0,
    "increased >10%": 0,
  };

  for (const r of results) {
    if (r.status === "new" || r.status === "departed") {
      continue;
    }

    if (r.status === "unchanged" || r.netDelta === null) {
      buckets["unchanged"]++;
      continue;
    }

    const prevNet = Object.values(r.previousComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
    const pct = prevNet !== 0 ? (r.netDelta / prevNet) * 100 : 0;

    if (Math.abs(pct) <= cfg.unchangedThresholdPct) {
      buckets["unchanged"]++;
    } else if (pct > cfg.increased2Pct) {
      buckets["increased >10%"]++;
    } else if (pct > 0) {
      buckets["increased 1-10%"]++;
    } else if (pct < cfg.decreased2Pct) {
      buckets["decreased >10%"]++;
    } else {
      buckets["decreased 1-10%"]++;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
    color: (cfg.colors && cfg.colors[label]) ?? DEFAULT_DISTRIBUTION_CONFIG.colors![label] ?? "#6b7280",
  }));
}

function computeComponentBreakdown(results: ComparisonOutput[]) {
  const componentMap: Record<string, { totalChange: number; employeeCount: number }> = {};

  for (const r of results) {
    if (!r.componentDeltas) continue;

    for (const delta of r.componentDeltas) {
      if (!componentMap[delta.component]) {
        componentMap[delta.component] = { totalChange: 0, employeeCount: 0 };
      }
      componentMap[delta.component].totalChange += delta.absoluteDiff ?? 0;
      if (delta.absoluteDiff !== null) {
        componentMap[delta.component].employeeCount++;
      }
    }
  }

  return Object.entries(componentMap)
    .map(([component, data]) => ({
      component,
      totalChange: Math.round(data.totalChange * 100) / 100,
      employeeCount: data.employeeCount,
    }))
    .sort((a, b) => Math.abs(b.totalChange) - Math.abs(a.totalChange));
}

function computeDepartmentBreakdown(results: ComparisonOutput[]) {
  const deptMap: Record<string, {
    headcountCurrent: Set<string>;
    headcountPrevious: Set<string>;
    totalCurrent: number;
    totalPrevious: number;
  }> = {};

  for (const r of results) {
    const dept = r.department ?? "Unassigned";

    if (!deptMap[dept]) {
      deptMap[dept] = {
        headcountCurrent: new Set(),
        headcountPrevious: new Set(),
        totalCurrent: 0,
        totalPrevious: 0,
      };
    }

    if (r.status !== "departed") {
      deptMap[dept].headcountCurrent.add(r.employeeExternalId);
      const currTotal = Object.values(r.currentComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
      deptMap[dept].totalCurrent += currTotal;
    }

    if (r.status !== "new") {
      deptMap[dept].headcountPrevious.add(r.employeeExternalId);
      const prevTotal = Object.values(r.previousComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
      deptMap[dept].totalPrevious += prevTotal;
    }
  }

  return Object.entries(deptMap)
    .map(([department, data]) => {
      const absoluteChange = data.totalCurrent - data.totalPrevious;
      const percentageChange = data.totalPrevious !== 0
        ? Math.round((absoluteChange / data.totalPrevious) * 10000) / 100
        : null;
      return {
        department,
        headcountCurrent: data.headcountCurrent.size,
        headcountPrevious: data.headcountPrevious.size,
        totalCurrent: Math.round(data.totalCurrent * 100) / 100,
        totalPrevious: Math.round(data.totalPrevious * 100) / 100,
        absoluteChange: Math.round(absoluteChange * 100) / 100,
        percentageChange,
      };
    })
    .sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));
}

function computeTopMovers(results: ComparisonOutput[]) {
  const movers = results
    .filter((r) => r.netDelta !== null && r.status !== "new" && r.status !== "departed")
    .map((r) => {
      const prevNet = Object.values(r.previousComponents).reduce<number>((s, v) => s + (v ?? 0), 0);
      const changePercentage = prevNet !== 0
        ? Math.round((r.netDelta! / prevNet) * 10000) / 100
        : null;
      return {
        employeeName: r.employeeName,
        department: r.department,
        previousNet: prevNet,
        currentNet: Object.values(r.currentComponents).reduce<number>((s, v) => s + (v ?? 0), 0),
        changeAmount: r.netDelta!,
        changePercentage,
      };
    })
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount))
    .slice(0, 10);

  return movers;
}
