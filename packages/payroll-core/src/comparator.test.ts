import { describe, it, expect } from "vitest";
import { runComparison, DuplicateEmployeeIdsError } from "./comparator";
import type { EmployeeRecord, AggregatedSummary } from "./types";

function emp(
  id: string,
  name: string,
  dept: string | null,
  components: Record<string, number | null>,
  gross: number,
  net: number,
): EmployeeRecord {
  return { externalId: id, name, department: dept, components, grossSalary: gross, netSalary: net };
}

describe("runComparison - integration", () => {
  it("returns results and summary for matched employees", () => {
    const current: EmployeeRecord[] = [
      emp("1", "Alice", "Engineering", { salary: 6000, bonus: 500 }, 6500, 5500),
      emp("2", "Bob", "Engineering", { salary: 5000, bonus: 200 }, 5200, 4600),
      emp("3", "Carol", "Sales", { salary: 4500 }, 4500, 4000),
    ];

    const previous: EmployeeRecord[] = [
      emp("1", "Alice", "Engineering", { salary: 5500, bonus: 500 }, 6000, 5000),
      emp("2", "Bob", "Engineering", { salary: 5000, bonus: 200 }, 5200, 4600),
      emp("4", "Dave", "Sales", { salary: 4000 }, 4000, 3500),
    ];

    const { results, summary } = runComparison(current, previous);

    expect(results).toHaveLength(4);

    const alice = results.find((r) => r.employeeExternalId === "1")!;
    expect(alice.status).toBe("increased");
    expect(alice.netDelta).toBe(500);
    expect(alice.grossDelta).toBe(500);
    expect(alice.componentDeltas).toHaveLength(2);
    expect(alice.anomalyFlags).toBeNull();

    const bob = results.find((r) => r.employeeExternalId === "2")!;
    expect(bob.status).toBe("unchanged");

    const carol = results.find((r) => r.employeeExternalId === "3")!;
    expect(carol.status).toBe("new");

    const dave = results.find((r) => r.employeeExternalId === "4")!;
    expect(dave.status).toBe("departed");

    expect(summary.employeesAffected.total).toBe(4);
    expect(summary.employeesAffected.increased).toBe(1);
    expect(summary.employeesAffected.decreased).toBe(0);
    expect(summary.employeesAffected.unchanged).toBe(1);
    expect(summary.newEmployees).toBe(1);
    expect(summary.departedEmployees).toBe(1);

    expect(summary.totalPayrollVariance.absolute).toBe(1000);
    expect(summary.largestIncrease?.employeeName).toBe("Alice");
    expect(summary.largestIncrease?.amount).toBe(500);
    expect(summary.largestDecrease).toBeNull();

    expect(summary.departmentBreakdown).toHaveLength(2);
    expect(summary.componentBreakdown.length).toBeGreaterThan(0);
    expect(summary.topMovers.length).toBeGreaterThan(0);
  });

  it("handles large dataset with all statuses", () => {
    const current: EmployeeRecord[] = [
      emp("1", "Alice", "Eng", { salary: 7000, bonus: 1000 }, 8000, 7000),
      emp("2", "Bob", "Eng", { salary: 5000 }, 5000, 4500),
      emp("3", "Carol", "Sales", { salary: 4000, commission: 500 }, 4500, 4000),
      emp("5", "Eve", "Eng", { salary: 6000 }, 6000, 5200),
    ];

    const previous: EmployeeRecord[] = [
      emp("1", "Alice", "Eng", { salary: 5000, bonus: 1000 }, 6000, 5200),
      emp("2", "Bob", "Eng", { salary: 5000 }, 5000, 4500),
      emp("3", "Carol", "Sales", { salary: 4000, commission: 300 }, 4300, 3800),
      emp("4", "Dave", "Sales", { salary: 4500 }, 4500, 4000),
    ];

    const { results, summary } = runComparison(current, previous);

    expect(results).toHaveLength(5);

    const alice = results.find((r) => r.employeeExternalId === "1")!;
    expect(alice.status).toBe("increased");
    expect(alice.netDelta).toBe(1800);
    expect(alice.grossDelta).toBe(2000);

    const bob = results.find((r) => r.employeeExternalId === "2")!;
    expect(bob.status).toBe("unchanged");

    const carol = results.find((r) => r.employeeExternalId === "3")!;
    expect(carol.status).toBe("increased");

    const dave = results.find((r) => r.employeeExternalId === "4")!;
    expect(dave.status).toBe("departed");

    const eve = results.find((r) => r.employeeExternalId === "5")!;
    expect(eve.status).toBe("new");

    expect(summary.employeesAffected.total).toBe(5);
    expect(summary.employeesAffected.increased).toBe(2);
    expect(summary.employeesAffected.unchanged).toBe(1);
    expect(summary.newEmployees).toBe(1);
    expect(summary.departedEmployees).toBe(1);

    expect(summary.largestIncrease?.employeeName).toBe("Alice");
    expect(summary.largestDecrease).toBeNull();

    // Net: 17,500 -> 20,700, excluding departed Dave from the current side and
    // new Eve from the previous side.
    expect(summary.totalPayrollVariance.absolute).toBe(3200);
    expect(summary.totalNet).toEqual({ previous: 17_500, current: 20_700, absolute: 3200, percentage: 18.29 });

    // Gross: 19,800 -> 23,500. This assertion used to read 3,700 under the
    // name "totalPayrollVariance" — the component sum, which in this fixture
    // equals gross exactly, because there are no deduction columns in it. The
    // headline was reporting gross while being read as net.
    expect(summary.totalGross).toEqual({ previous: 19_800, current: 23_500, absolute: 3700, percentage: 18.69 });

    expect(summary.distribution).toHaveLength(5);
  });

  it("handles empty lists", () => {
    const { results, summary } = runComparison([], []);
    expect(results).toHaveLength(0);
    expect(summary.employeesAffected.total).toBe(0);
    expect(summary.totalPayrollVariance.absolute).toBe(0);
  });

  it("handles employees with component changes triggering anomalies", () => {
    const current: EmployeeRecord[] = [
      emp("1", "Alice", "Eng", { salary: 5000 }, 5000, 5000),
      emp("2", "Bob", "Eng", { salary: 0 }, 0, 0),
    ];

    const previous: EmployeeRecord[] = [
      emp("1", "Alice", "Eng", { salary: 5000 }, 5000, 4000),
      emp("2", "Bob", "Eng", { salary: 5000 }, 5000, 4500),
    ];

    const { results } = runComparison(current, previous);

    const bob = results.find((r) => r.employeeExternalId === "2")!;
    expect(bob.anomalyFlags).not.toBeNull();
    expect(bob.anomalyFlags!.some((f) => f.type === "zero_salary_component")).toBe(true);
  });
});

/**
 * Step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md — a duplicate employee ID blocks.
 *
 * `matchEmployees` keeps the first row per ID and `runComparison` used to throw
 * the duplicate list away, so a second payment vanished: measured on the
 * fixture below, 5,000.00 paid twice reported `totalPayrollVariance 0.00`,
 * `totalNet {previous: 5000, current: 5000, absolute: 0}` and an empty
 * `anomalies` array. No flag of any kind, under a headline saying nothing moved.
 *
 * The comparison now refuses. Summing the rows instead would guess at intent:
 * two rows for one ID may be a genuine off-cycle second payment (sum is right),
 * a duplicated export (sum double-counts) or a reused ID for two people (sum
 * merges two people's pay), and nothing in the register says which.
 */
describe("runComparison - a duplicate employee ID refuses the comparison", () => {
  const one = (gross: number, net: number) =>
    emp("E001", "A. One", "Ops", { base_salary: gross }, gross, net);

  /**
   * Runs the comparison and returns the refusal.
   *
   * A returned summary is reported first, and with its figures, because the
   * defect this pins is not "no error was thrown" but "a wrong total was
   * reported": the measured behaviour was `totalNet {previous: 5000, current:
   * 5000, absolute: 0}` with an empty `anomalies` array while 5,000.00 of real
   * money had been paid.
   */
  function refusalFrom(current: EmployeeRecord[], previous: EmployeeRecord[]) {
    let caught: unknown;
    let leaked: AggregatedSummary | null = null;
    try {
      leaked = runComparison(current, previous).summary;
    } catch (e) {
      caught = e;
    }

    if (leaked) {
      throw new Error(
        "runComparison reported on a register carrying a duplicate employee ID " +
          "instead of refusing it: " +
          `totalNet=${JSON.stringify(leaked.totalNet)} ` +
          `totalGross=${JSON.stringify(leaked.totalGross)} ` +
          `anomalies=${leaked.anomalies.length}`,
      );
    }
    expect(caught).toBeInstanceOf(DuplicateEmployeeIdsError);
    return caught as DuplicateEmployeeIdsError;
  }

  it("refuses a duplicate in the current period, naming the ID and its rows", () => {
    const err = refusalFrom([one(5000, 5000), one(5000, 5000)], [one(5000, 5000)]);

    expect(err.duplicates).toEqual([
      { externalId: "E001", currentRows: 2, previousRows: 1 },
    ]);
    expect(err.message).toContain("E001");
    expect(err.message).toContain("2 rows in the current register, 1 in the previous");
  });

  it("refuses a duplicate in the previous period only", () => {
    const err = refusalFrom([one(5000, 5000)], [one(5000, 5000), one(5000, 5000)]);

    expect(err.duplicates).toEqual([
      { externalId: "E001", currentRows: 1, previousRows: 2 },
    ]);
    expect(err.message).toContain("1 row in the current register, 2 in the previous");
  });

  it("counts all three rows when the same ID appears three times", () => {
    const err = refusalFrom(
      [one(5000, 5000), one(5000, 5000), one(5000, 5000)],
      [one(5000, 5000)],
    );

    expect(err.duplicates).toEqual([
      { externalId: "E001", currentRows: 3, previousRows: 1 },
    ]);
    expect(err.message).toContain("3 rows in the current register");
  });

  it("names every duplicated ID, in ID order", () => {
    const dup = (id: string) => emp(id, id, "Ops", { base_salary: 1000 }, 1000, 900);
    const err = refusalFrom(
      [dup("E009"), dup("E009"), dup("E002"), dup("E002")],
      [dup("E009"), dup("E002")],
    );

    expect(err.duplicates.map((d) => d.externalId)).toEqual(["E002", "E009"]);
    expect(err.message).toContain("2 employee IDs appear more than once");
  });

  it("reports +5,000.00 once the register is corrected, which is what the refusal protects", () => {
    // The payroll manager's own fix: one row for E001 carrying both payments.
    // 10,000 paid this period against 5,000 last = +5,000.00. That is the
    // figure the plan measured as 0.00, and it is reachable the moment the
    // register says what it means.
    const { summary } = runComparison([one(10_000, 10_000)], [one(5000, 5000)]);

    expect(summary.totalNet).toEqual({
      previous: 5000, current: 10_000, absolute: 5000, percentage: 100,
    });
    expect(summary.totalGross.absolute).toBe(5000);
    expect(summary.totalPayrollVariance.absolute).toBe(5000);
  });

  it("still compares a register whose IDs are unique", () => {
    const { summary } = runComparison(
      [one(5000, 5000), emp("E002", "B. Two", "Ops", { base_salary: 3000 }, 3000, 2700)],
      [one(5000, 5000), emp("E002", "B. Two", "Ops", { base_salary: 3000 }, 3000, 2700)],
    );
    expect(summary.totalNet.absolute).toBe(0);
    expect(summary.employeesAffected.total).toBe(2);
  });
});
