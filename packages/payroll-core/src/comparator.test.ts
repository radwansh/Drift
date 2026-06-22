import { describe, it, expect } from "vitest";
import { runComparison } from "./comparator";
import type { EmployeeRecord } from "./types";

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

    expect(summary.totalPayrollVariance.absolute).toBe(3700);

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
