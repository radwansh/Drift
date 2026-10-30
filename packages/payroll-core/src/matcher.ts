import type { EmployeeRecord, MatchedPair } from "./types";

/**
 * An external ID that appeared on more than one row, with the rows behind it.
 *
 * `pairs` below only ever carries the *first* row per ID, so these counts are
 * the only record of what was left out. Step 2 of
 * docs/PAYROLL_AUDIT_FIX_PLAN.md: `runComparison` refuses on them rather than
 * reporting a total built from a register it has silently truncated.
 */
export interface DuplicateEmployeeId {
  externalId: string;
  currentRows: number;
  previousRows: number;
}

export interface MatchResult {
  pairs: MatchedPair[];
  /** The IDs seen more than once, in either register. */
  duplicateIds: string[];
  /** The same IDs with their row counts, sorted by ID so a refusal reads the same way twice. */
  duplicates: DuplicateEmployeeId[];
}

export function matchEmployees(
  currentRecords: EmployeeRecord[],
  previousRecords: EmployeeRecord[],
): MatchResult {
  const currentById = groupByExternalId(currentRecords);
  const previousById = groupByExternalId(previousRecords);

  const duplicateIds: string[] = [];
  const duplicates: DuplicateEmployeeId[] = [];
  const allIds = new Set([
    ...Object.keys(currentById),
    ...Object.keys(previousById),
  ]);

  const pairs: MatchedPair[] = [];

  for (const id of allIds) {
    const currentList = currentById[id] ?? [];
    const previousList = previousById[id] ?? [];

    if (currentList.length > 1 || previousList.length > 1) {
      duplicateIds.push(id);
      duplicates.push({
        externalId: id,
        currentRows: currentList.length,
        previousRows: previousList.length,
      });
    }

    const current = currentList[0] ?? null;
    const previous = previousList[0] ?? null;

    const employeeName = current?.name ?? previous?.name ?? "Unknown";
    const department = current?.department ?? previous?.department ?? null;

    let status: MatchedPair["status"] = "unchanged";
    if (current && !previous) status = "new";
    else if (!current && previous) status = "departed";

    pairs.push({
      employeeExternalId: id,
      employeeName,
      department,
      current,
      previous,
      status,
    });
  }

  duplicates.sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));

  return { pairs, duplicateIds, duplicates };
}

function groupByExternalId(
  records: EmployeeRecord[],
): Record<string, EmployeeRecord[]> {
  const grouped: Record<string, EmployeeRecord[]> = {};
  for (const record of records) {
    const id = record.externalId;

    if (!grouped[id]) {
      grouped[id] = [];
    }
    grouped[id].push(record);
  }
  return grouped;
}
