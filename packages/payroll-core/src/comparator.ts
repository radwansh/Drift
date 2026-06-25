import type { EmployeeRecord, ComparisonOutput, AggregatedSummary } from "./types";
import { matchEmployees } from "./matcher";
import { diffComponents } from "./differ";
import { calculateDelta } from "./delta-calculator";
import { classifyMatchedPairs } from "./classifier";
import { detectAnomalies } from "./anomaly-detector";
import { aggregateResults } from "./aggregator";

export interface ComparisonResult {
  results: ComparisonOutput[];
  summary: AggregatedSummary;
}

export function runComparison(
  currentEmployees: EmployeeRecord[],
  previousEmployees: EmployeeRecord[],
): ComparisonResult {
  const { pairs } = matchEmployees(currentEmployees, previousEmployees);
  const classifiedPairs = classifyMatchedPairs(pairs);

  const results: ComparisonOutput[] = classifiedPairs.map((pair) => {
    const currentComponents = pair.current?.components ?? {};
    const previousComponents = pair.previous?.components ?? {};

    const componentDeltas = diffComponents(currentComponents, previousComponents);

    const { absolute: grossDelta } = calculateDelta(
      pair.current?.grossSalary ?? null,
      pair.previous?.grossSalary ?? null,
    );

    const { absolute: netDelta } = calculateDelta(
      pair.current?.netSalary ?? null,
      pair.previous?.netSalary ?? null,
    );

    const comparisonOutput: ComparisonOutput = {
      employeeExternalId: pair.employeeExternalId,
      employeeName: pair.employeeName,
      department: pair.department,
      currentComponents,
      previousComponents,
      componentDeltas,
      currentGross: pair.current?.grossSalary ?? null,
      previousGross: pair.previous?.grossSalary ?? null,
      currentNet: pair.current?.netSalary ?? null,
      previousNet: pair.previous?.netSalary ?? null,
      grossDelta,
      netDelta,
      status: pair.status,
      anomalyFlags: null,
    };

    const anomalyFlags = detectAnomalies(
      pair.current,
      pair.previous,
      comparisonOutput,
    );

    comparisonOutput.anomalyFlags = anomalyFlags.length > 0 ? anomalyFlags : null;

    return comparisonOutput;
  });

  const summary = aggregateResults(results);

  return { results, summary };
}
