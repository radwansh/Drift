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
    expect(result.pairs[0].employeeExternalId).toBe("1");
    expect(result.pairs[0].current?.netSalary).toBe(5000);
    expect(result.pairs[0].previous?.netSalary).toBe(4500);
    expect(result.pairs[0].status).toBe("unchanged");
  });

  it("marks new employees", () => {
    const current = [makeRecord({ externalId: "1", name: "Bob" })];
    const previous: EmployeeRecord[] = [];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].status).toBe("new");
  });

  it("marks departed employees", () => {
    const current: EmployeeRecord[] = [];
    const previous = [makeRecord({ externalId: "1", name: "Bob" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].status).toBe("departed");
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
    expect(result.pairs[0].employeeName).toBe("Alice");
    expect(result.pairs[0].department).toBe("Eng");
  });

  it("uses previous name and department when current is null", () => {
    const current: EmployeeRecord[] = [];
    const previous = [makeRecord({ externalId: "1", name: "Bob", department: "Eng" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs[0].employeeName).toBe("Bob");
    expect(result.pairs[0].department).toBe("Eng");
  });

  // New tests for normalization and deterministic selection
  it("normalizes externalId (trims whitespace) before matching", () => {
    const current = [makeRecord({ externalId: "  123 ", name: "Trim" })];
    const previous = [makeRecord({ externalId: "123", name: "Trim Prev" })];

    const result = matchEmployees(current, previous);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].employeeExternalId).toBe("123");
  });

  it("selects preferred record deterministically when duplicates exist", () => {
    const better = makeRecord({ externalId: "9", name: "Preferred", grossSalary: 5000, netSalary: 4500 });
    const worse = makeRecord({ externalId: "9", name: "", grossSalary: NaN as unknown as number, netSalary: NaN as unknown as number });
    const current = [better, worse];
    const previous: EmployeeRecord[] = [];

    const result = matchEmployees(current, previous);
    // duplicateIds should include '9'
    expect(result.duplicateIds).toContain("9");
    // selected record in pair should be the better one (has a name and numeric salaries)
    const pair = result.pairs.find((p) => p.employeeExternalId === "9")!;
    expect(pair.current?.name).toBe("Preferred");
  });
});
