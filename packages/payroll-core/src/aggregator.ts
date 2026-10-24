import type { ComparisonOutput, AggregatedSummary, PeriodTotal } from "./types";
import { collectAnomalies } from "./anomaly-detector";

const DISTRIBUTION_COLORS: Record<string, string> = {
  "decreased >10%": "#ef4444",
  "decreased 1-10%": "#f97316",
  unchanged: "#6b7280",
  "increased 1-10%": "#22c55e",
  "increased >10%": "#16a34a",
};

/**
 * Money rounding for the comparison side, in one place.
 *
 * Two decimals, which is wrong for KWD, BHD and OMR (three) and for LBP (none).
 * Step 8a of docs/PAYROLL_AUDIT_FIX_PLAN.md threads a per-currency minor unit
 * through; this is the single lever that change needs in this file.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds a period total from two sums.
 *
 * The percentage is null rather than 0 when the previous period is empty: a
 * movement from nothing is not a 0% change, and rendering it as one has it read
 * as "no change".
 */
function periodTotal(previous: number, current: number): PeriodTotal {
  const absolute = current - previous;
  return {
    previous: round2(previous),
    current: round2(current),
    absolute: round2(absolute),
    percentage: previous !== 0 ? round2((absolute / previous) * 100) : null,
  };
}

/**
 * Per-employee net, or null when it is absent.
 *
 * Everything below reads gross and net off the employee rows rather than
 * summing `currentComponents` / `previousComponents`. That sum was the bug:
 * components are every mapped column that is not id, name, department, gross or
 * net, so with positive deduction columns their total comes to gross plus
 * deductions — neither of the two numbers anyone wanted, under labels saying it
 * was one of them.
 */
export function aggregateResults(results: ComparisonOutput[]): AggregatedSummary {
  const total = results.length;
  let increased = 0;
  let decreased = 0;
  let unchanged = 0;

  let grossPrevious = 0;
  let grossCurrent = 0;
  let netPrevious = 0;
  let netCurrent = 0;
  let grossMissing = 0;
  let netMissing = 0;

  for (const r of results) {
    if (r.status === "increased") increased++;
    else if (r.status === "decreased") decreased++;
    else if (r.status === "unchanged") unchanged++;

    // A departed employee has no current figures and a new one no previous, so
    // a null on that side is expected rather than missing. Anywhere else a null
    // is a data gap: it is counted, never silently added as zero.
    if (r.status !== "departed") {
      if (r.currentGross === null) grossMissing++;
      else grossCurrent += r.currentGross;
      if (r.currentNet === null) netMissing++;
      else netCurrent += r.currentNet;
    }

    if (r.status !== "new") {
      if (r.previousGross === null) grossMissing++;
      else grossPrevious += r.previousGross;
      if (r.previousNet === null) netMissing++;
      else netPrevious += r.previousNet;
    }
  }

  const totalNet = periodTotal(netPrevious, netCurrent);
  const totalGross = periodTotal(grossPrevious, grossCurrent);

  const newEmployees = results.filter((r) => r.status === "new").length;
  const departedEmployees = results.filter((r) => r.status === "departed").length;

  const resultsWithDelta = results.filter(
    (r) => r.netDelta !== null && r.status !== "new" && r.status !== "departed",
  );

  const netDeltas = resultsWithDelta.map((r) => r.netDelta as number);
  const totalDeltaSum = netDeltas.reduce((s, v) => s + v, 0);

  // Percentage movement per employee, against that employee's own previous net.
  const pctDeltas = resultsWithDelta
    .map((r) => pctOfPreviousNet(r))
    .filter((p): p is number => p !== null);

  const avgPct = pctDeltas.length > 0
    ? pctDeltas.reduce((s, v) => s + v, 0) / pctDeltas.length
    : null;

  const largestIncrease = resultsWithDelta
    .filter((r) => (r.netDelta ?? 0) > 0)
    .sort((a, b) => (b.netDelta ?? 0) - (a.netDelta ?? 0))[0] ?? null;

  const largestDecrease = resultsWithDelta
    .filter((r) => (r.netDelta ?? 0) < 0)
    .sort((a, b) => (a.netDelta ?? 0) - (b.netDelta ?? 0))[0] ?? null;

  const distribution = computeDistribution(results);
  const componentBreakdown = computeComponentBreakdown(results);
  const departmentBreakdown = computeDepartmentBreakdown(results);
  const topMovers = computeTopMovers(results);
  const anomalies = collectAnomalies(results);

  const avgAbsolute = netDeltas.length > 0 ? totalDeltaSum / netDeltas.length : 0;

  return {
    // The headline is net, and it is the same movement as totalNet.
    totalPayrollVariance: {
      absolute: totalNet.absolute,
      percentage: totalNet.percentage,
    },
    totalNet,
    totalGross,
    incompleteTotals: { grossMissing, netMissing },
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
      absolute: round2(avgAbsolute),
      percentage: avgPct !== null ? round2(avgPct) : null,
    },
    distribution,
    componentBreakdown,
    departmentBreakdown,
    topMovers,
    anomalies,
  };
}

/**
 * An employee's net movement as a percentage of their own previous net.
 *
 * Null when there is no previous net to divide by, so the caller decides what
 * an unmeasurable movement means rather than inheriting a 0.
 */
function pctOfPreviousNet(r: ComparisonOutput): number | null {
  if (r.netDelta === null || r.previousNet === null || r.previousNet === 0) return null;
  return (r.netDelta / r.previousNet) * 100;
}

type DistributionLabel =
  | "decreased >10%"
  | "decreased 1-10%"
  | "unchanged"
  | "increased 1-10%"
  | "increased >10%";

function computeDistribution(results: ComparisonOutput[]) {
  const buckets: Record<DistributionLabel, number> = {
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

    // Unmeasurable (no previous net) counts as unchanged rather than being
    // dropped, so the buckets still sum to the compared population.
    const pct = pctOfPreviousNet(r);
    if (pct === null || Math.abs(pct) <= 0.01) {
      buckets["unchanged"]++;
    } else if (pct > 10) {
      buckets["increased >10%"]++;
    } else if (pct > 0) {
      buckets["increased 1-10%"]++;
    } else if (pct < -10) {
      buckets["decreased >10%"]++;
    } else {
      buckets["decreased 1-10%"]++;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
    color: DISTRIBUTION_COLORS[label] ?? "#6b7280",
  }));
}

function computeComponentBreakdown(results: ComparisonOutput[]) {
  const componentMap: Record<string, { totalChange: number; employeeCount: number }> = {};

  for (const r of results) {
    if (!r.componentDeltas) continue;

    for (const delta of r.componentDeltas) {
      const component = delta.component;

      if (!componentMap[component]) {
        componentMap[component] = { totalChange: 0, employeeCount: 0 };
      }
      componentMap[component].totalChange += delta.absoluteDiff ?? 0;
      if (delta.absoluteDiff !== null) {
        componentMap[component].employeeCount++;
      }
    }
  }

  return Object.entries(componentMap)
    .map(([component, data]) => ({
      component,
      totalChange: round2(data.totalChange),
      employeeCount: data.employeeCount,
    }))
    .sort((a, b) => Math.abs(b.totalChange) - Math.abs(a.totalChange));
}

/**
 * Department totals are **gross** — what the department costs in pay, which is
 * what anyone comparing departments means. They were the component sum, so a
 * department's "total" carried its deductions as well as its pay.
 */
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
      deptMap[dept].totalCurrent += r.currentGross ?? 0;
    }

    if (r.status !== "new") {
      deptMap[dept].headcountPrevious.add(r.employeeExternalId);
      deptMap[dept].totalPrevious += r.previousGross ?? 0;
    }
  }

  return Object.entries(deptMap)
    .map(([department, data]) => {
      const absoluteChange = data.totalCurrent - data.totalPrevious;
      const percentageChange = data.totalPrevious !== 0
        ? round2((absoluteChange / data.totalPrevious) * 100)
        : null;
      return {
        department,
        headcountCurrent: data.headcountCurrent.size,
        headcountPrevious: data.headcountPrevious.size,
        totalCurrent: round2(data.totalCurrent),
        totalPrevious: round2(data.totalPrevious),
        absoluteChange: round2(absoluteChange),
        percentageChange,
      };
    })
    .sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));
}

/**
 * Top movers by net movement.
 *
 * The three money cells in a row now tie by construction: `previousNet` and
 * `currentNet` are the employee's own net, and `changeAmount` is their
 * difference. They did not tie before — the two flanking columns were the
 * component sum while the middle one was the real net delta, under headers
 * reading "Previous Net" and "Current Net".
 */
function computeTopMovers(results: ComparisonOutput[]) {
  return results
    .filter((r) => r.netDelta !== null && r.status !== "new" && r.status !== "departed")
    .map((r) => {
      const pct = pctOfPreviousNet(r);
      return {
        employeeName: r.employeeName,
        department: r.department,
        previousNet: round2(r.previousNet ?? 0),
        currentNet: round2(r.currentNet ?? 0),
        changeAmount: round2(r.netDelta!),
        changePercentage: pct !== null ? round2(pct) : null,
      };
    })
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount))
    .slice(0, 10);
}
