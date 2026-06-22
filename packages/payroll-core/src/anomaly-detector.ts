import type { EmployeeRecord, ComparisonOutput } from "./types";
import { diffComponents } from "./differ";

export interface AnomalyFlag {
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

export interface AnomalyResult {
  employeeId: string;
  employeeName: string;
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

export function detectAnomalies(
  current: EmployeeRecord | null,
  previous: EmployeeRecord | null,
  comparisonOutput: ComparisonOutput,
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  if (!current || !previous) {
    return flags;
  }

  checkLargeNetChangeWithoutComponentChange(flags, comparisonOutput);
  checkNewOrRemovedComponents(flags, comparisonOutput);
  checkZeroSalary(flags, comparisonOutput);

  return flags;
}

export function collectAnomalies(results: ComparisonOutput[]): AnomalyResult[] {
  const all: AnomalyResult[] = [];
  for (const r of results) {
    if (r.anomalyFlags) {
      for (const flag of r.anomalyFlags) {
        all.push({
          employeeId: r.employeeExternalId,
          employeeName: r.employeeName,
          ...flag,
        });
      }
    }
  }
  return all;
}

function checkLargeNetChangeWithoutComponentChange(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
): void {
  if (comp.netDelta === null || comp.grossDelta === null) return;

  const absNet = Math.abs(comp.netDelta);
  const previousNet = Object.values(comp.previousComponents).reduce(
    (sum, v) => sum + (v ?? 0),
    0,
  );

  if (previousNet === 0) return;

  const netPct = (absNet / previousNet) * 100;

  if (netPct >= 20) {
    const componentDeltas = diffComponents(
      comp.currentComponents,
      comp.previousComponents,
    );
    const hasAnyComponentChange = componentDeltas.some(
      (d) => d.absoluteDiff !== null && Math.abs(d.absoluteDiff) > 0.01,
    );

    if (!hasAnyComponentChange) {
      flags.push({
        type: "large_net_change_no_component_change",
        severity: "warning",
        description: `Net changed by ${netPct.toFixed(1)}% but no individual component changed`,
      });
    }
  }
}

function checkNewOrRemovedComponents(
  flags: AnomalyFlag[],
  comp: ComparisonOutput,
): void {
  const currentKeys = new Set(Object.keys(comp.currentComponents));
  const previousKeys = new Set(Object.keys(comp.previousComponents));

  for (const key of currentKeys) {
    if (!previousKeys.has(key)) {
      flags.push({
        type: "new_component",
        severity: "info",
        description: `New component "${key}" added`,
      });
    }
  }

  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      flags.push({
        type: "removed_component",
        severity: "info",
        description: `Component "${key}" removed`,
      });
    }
  }
}

function checkZeroSalary(flags: AnomalyFlag[], comp: ComparisonOutput): void {
  const currentZero = Object.entries(comp.currentComponents).some(
    ([, v]) => v === 0,
  );
  const previousZero = Object.entries(comp.previousComponents).some(
    ([, v]) => v === 0,
  );

  if (currentZero) {
    flags.push({
      type: "zero_salary_component",
      severity: "warning",
      description: "Employee has zero value component(s) in current period",
    });
  }

  if (previousZero) {
    flags.push({
      type: "zero_salary_component_previous",
      severity: "info",
      description: "Employee had zero value component(s) in previous period",
    });
  }
}
