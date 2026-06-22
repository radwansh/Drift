import type { EmployeeRecord, MatchedPair } from "./types";

export interface MatchResult {
  pairs: MatchedPair[];
  duplicateIds: string[];
}

export function matchEmployees(
  currentRecords: EmployeeRecord[],
  previousRecords: EmployeeRecord[],
): MatchResult {
  const currentById = groupByExternalId(currentRecords);
  const previousById = groupByExternalId(previousRecords);

  const duplicateIds: string[] = [];
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
    }

    const current = currentList.length > 0 ? currentList[0] : null;
    const previous = previousList.length > 0 ? previousList[0] : null;

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

  return { pairs, duplicateIds };
}

function groupByExternalId(
  records: EmployeeRecord[],
): Record<string, EmployeeRecord[]> {
  const grouped: Record<string, EmployeeRecord[]> = {};
  for (const record of records) {
    if (!grouped[record.externalId]) {
      grouped[record.externalId] = [];
    }
    grouped[record.externalId].push(record);
  }
  return grouped;
}
