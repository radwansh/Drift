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

    const current = selectPreferredRecord(currentList);
    const previous = selectPreferredRecord(previousList);

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
    const id = normalizeExternalId(record.externalId);
    if (!grouped[id]) {
      grouped[id] = [];
    }
    grouped[id].push(record);
  }
  return grouped;
}

function normalizeExternalId(id: string): string {
  return id.trim();
}

function selectPreferredRecord(records: EmployeeRecord[]): EmployeeRecord | null {
  if (!records || records.length === 0) return null;
  if (records.length === 1) return records[0];

  // Prefer records with non-null name/gross/net; otherwise stable sort
  const scored = records.map((r, idx) => ({
    score:
      (r.name ? 1 : 0) + (typeof r.grossSalary === "number" ? 1 : 0) + (typeof r.netSalary === "number" ? 1 : 0),
    idx,
    rec: r,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx; // stable fallback
  });

  return scored[0].rec;
}
