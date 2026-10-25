import type { EmployeeRecord, ComparisonOutput, AggregatedSummary } from "./types";
import { matchEmployees, type DuplicateEmployeeId } from "./matcher";
import { diffComponents } from "./differ";
import { calculateDelta } from "./delta-calculator";
import { classifyMatchedPairs } from "./classifier";
import { detectAnomalies } from "./anomaly-detector";
import { aggregateResults } from "./aggregator";

export interface ComparisonResult {
  results: ComparisonOutput[];
  summary: AggregatedSummary;
}

/** At most this many IDs are listed in a refusal; the rest are counted. */
const MAX_IDS_IN_MESSAGE = 10;

/**
 * Raised when either register carries more than one row for an employee ID.
 *
 * Step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md. `matchEmployees` keeps the first
 * row per ID and the duplicate list used to be discarded, so the rest of the
 * rows left no trace: one person paid 5,000.00 twice reported a variance of
 * 0.00, `totalNet {previous: 5000, current: 5000, absolute: 0}` and no anomaly
 * of any kind — the whole second payment gone, under a headline saying nothing
 * had moved.
 *
 * The comparison refuses rather than picking a reading. Two rows for one ID may
 * be a genuine off-cycle second payment, a duplicated export, or one ID reused
 * for two people; summing is right for the first, double-counts the second and
 * merges two people's pay in the third, and nothing in a register distinguishes
 * them. The fix belongs in the source system, so the message names the IDs and
 * their row counts and asks for the register again.
 */
export class DuplicateEmployeeIdsError extends Error {
  readonly duplicates: readonly DuplicateEmployeeId[];

  constructor(duplicates: readonly DuplicateEmployeeId[]) {
    super(describeDuplicates(duplicates));
    this.name = "DuplicateEmployeeIdsError";
    this.duplicates = duplicates;
  }
}

function describeDuplicates(duplicates: readonly DuplicateEmployeeId[]): string {
  const subject =
    duplicates.length === 1
      ? "1 employee ID appears more than once"
      : `${duplicates.length} employee IDs appear more than once`;

  const listed = duplicates
    .slice(0, MAX_IDS_IN_MESSAGE)
    .map(
      (d) =>
        `${d.externalId} (${d.currentRows} ${rowWord(d.currentRows)} in the current register, ` +
        `${d.previousRows} in the previous)`,
    )
    .join("; ");

  const omitted = duplicates.length - MAX_IDS_IN_MESSAGE;
  const more = omitted > 0 ? ` and ${omitted} more` : "";

  return (
    `Comparison refused: ${subject} — ${listed}${more}. ` +
    "Two rows for one ID may be a second payment or a duplicated export, and the register " +
    "does not say which, so no total is reported. Correct the duplicate rows at source and " +
    "upload the register again."
  );
}

function rowWord(n: number): string {
  return n === 1 ? "row" : "rows";
}

export function runComparison(
  currentEmployees: EmployeeRecord[],
  previousEmployees: EmployeeRecord[],
): ComparisonResult {
  const { pairs, duplicates } = matchEmployees(currentEmployees, previousEmployees);

  // Before anything is classified, diffed or aggregated. Every figure below is
  // built from `pairs`, which holds one row per ID, so a duplicate makes all of
  // them wrong at once — and wrong in a direction the data cannot reveal.
  if (duplicates.length > 0) {
    throw new DuplicateEmployeeIdsError(duplicates);
  }

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
