import { describe, it, expect } from "vitest";
import { matchEmployees } from "./matcher";
import type { EmployeeRecord } from "./types";

function makeRecord(overrides: Partial<EmployeeRecord> & { externalId: string }): EmployeeRecord {
  return {
    name: "Test",
    department: null,
    components: {},
    grossSalary: 0,
    netSalary: 0,
    ...overrides,
  };
}

describe("matchEmployees", () => {
  it("matches employees by externalId", () => {
    const current = [makeRecord({ externalId: "1", name: "Alice", netSalary: 5000 })];
    const previous = [makeRecord({ externalId: "1", name: "Alice", netSalary: 4500 })];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.employeeExternalId).toBe("1");
    expect(result.pairs[0]!.current?.netSalary).toBe(5000);
    expect(result.pairs[0]!.previous?.netSalary).toBe(4500);
    expect(result.pairs[0]!.status).toBe("unchanged");
  });

  it("marks new employees", () => {
    const current = [makeRecord({ externalId: "1", name: "Bob" })];
    const previous: EmployeeRecord[] = [];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.status).toBe("new");
  });

  it("marks departed employees", () => {
    const current: EmployeeRecord[] = [];
    const previous = [makeRecord({ externalId: "1", name: "Bob" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.status).toBe("departed");
  });

  it("handles employees only in current", () => {
    const current = [
      makeRecord({ externalId: "1", name: "Alice" }),
      makeRecord({ externalId: "2", name: "Bob" }),
    ];
    const previous = [makeRecord({ externalId: "1", name: "Alice" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(2);
    const bob = result.pairs.find((p) => p.employeeExternalId === "2")!;
    expect(bob.status).toBe("new");
  });

  it("handles employees only in previous", () => {
    const current = [makeRecord({ externalId: "1", name: "Alice" })];
    const previous = [
      makeRecord({ externalId: "1", name: "Alice" }),
      makeRecord({ externalId: "2", name: "Bob" }),
    ];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(2);
    const bob = result.pairs.find((p) => p.employeeExternalId === "2")!;
    expect(bob.status).toBe("departed");
  });

  it("detects duplicate externalIds", () => {
    const current = [
      makeRecord({ externalId: "1", name: "Alice" }),
      makeRecord({ externalId: "1", name: "Alice Dup" }),
    ];
    const previous = [makeRecord({ externalId: "1", name: "Alice" })];

    const result = matchEmployees(current, previous);
    expect(result.duplicateIds).toContain("1");
  });

  it("handles empty records", () => {
    const result = matchEmployees([], []);
    expect(result.pairs).toHaveLength(0);
    expect(result.duplicateIds).toHaveLength(0);
  });

  it("uses current name and department when available", () => {
    const current = [makeRecord({ externalId: "1", name: "Alice", department: "Eng" })];
    const previous = [makeRecord({ externalId: "1", name: "Alice Old", department: "Sales" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs[0]!.employeeName).toBe("Alice");
    expect(result.pairs[0]!.department).toBe("Eng");
  });

  it("uses previous name and department when current is null", () => {
    const current: EmployeeRecord[] = [];
    const previous = [makeRecord({ externalId: "1", name: "Bob", department: "Eng" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs[0]!.employeeName).toBe("Bob");
    expect(result.pairs[0]!.department).toBe("Eng");
  });
});

/**
 * Step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md.
 *
 * `pairs` only ever carries the first row per ID, so the row counts below are
 * the only record of what was left out. `runComparison` refuses on them rather
 * than reporting a total built from a register it has silently truncated.
 */
describe("matchEmployees - the rows behind a duplicate ID", () => {
  it("counts the rows per side and sorts by ID", () => {
    const current = [
      makeRecord({ externalId: "E009", grossSalary: 1000, netSalary: 900 }),
      makeRecord({ externalId: "E009", grossSalary: 1000, netSalary: 900 }),
      makeRecord({ externalId: "E002", grossSalary: 2000, netSalary: 1800 }),
      makeRecord({ externalId: "E777", grossSalary: 3000, netSalary: 2700 }),
    ];
    const previous = [
      makeRecord({ externalId: "E009", grossSalary: 1000, netSalary: 900 }),
      makeRecord({ externalId: "E002", grossSalary: 2000, netSalary: 1800 }),
      makeRecord({ externalId: "E002", grossSalary: 2000, netSalary: 1800 }),
      makeRecord({ externalId: "E002", grossSalary: 2000, netSalary: 1800 }),
    ];

    const result = matchEmployees(current, previous);

    expect(result.duplicates).toEqual([
      { externalId: "E002", currentRows: 1, previousRows: 3 },
      { externalId: "E009", currentRows: 2, previousRows: 1 },
    ]);
    // E777 appears once on one side only: not a duplicate, just a joiner.
    expect(result.duplicateIds).not.toContain("E777");
  });

  it("reports no duplicates for a register whose IDs are unique", () => {
    const result = matchEmployees(
      [makeRecord({ externalId: "E001" }), makeRecord({ externalId: "E002" })],
      [makeRecord({ externalId: "E001" })],
    );
    expect(result.duplicates).toEqual([]);
  });
});
