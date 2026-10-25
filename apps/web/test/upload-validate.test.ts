import { describe, it, expect } from "vitest";
import { validateRows } from "@/server/upload/validate";

/**
 * Step 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md — the upload half of the gate.
 *
 * A repeated employee ID was raised as a *warning*, so `validation.valid`
 * stayed true, `payrollPeriods.ingest` wrote the period and marked it `ready`,
 * and the duplicate rows then disappeared inside the comparison: one person
 * paid twice produced a dashboard reading "no change". The register is the
 * thing to fix, so the error belongs at the door.
 */
const COLUMNS = [
  { sourceColumn: "Employee ID", mappedComponent: "", isEmployeeId: true, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: false },
  { sourceColumn: "Gross", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: true, isNetSalary: false },
  { sourceColumn: "Net", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: true },
];

const row = (id: string, gross: number, net: number) => ({
  "Employee ID": id,
  Gross: String(gross),
  Net: String(net),
});

describe("validateRows - a duplicate employee ID is an error, not a warning", () => {
  it("refuses a register that pays one ID twice", () => {
    const result = validateRows(
      [row("E001", 5000, 5000), row("E001", 5000, 5000)],
      COLUMNS,
    );

    expect(
      result.valid,
      "a register that pays one employee ID twice must not be importable",
    ).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.severity).toBe("error");
    expect(result.errors[0]?.message).toBe("Duplicate employee ID E001: also on row 2");
    // Row 3 of the file: the header is row 1, so the second data row is 3.
    expect(result.errors[0]?.row).toBe(3);
    expect(result.warnings).toHaveLength(0);
  });

  it("reports the third occurrence as well, against the first row that held the ID", () => {
    const result = validateRows(
      [row("E001", 5000, 5000), row("E001", 5000, 5000), row("E001", 5000, 5000)],
      COLUMNS,
    );

    expect(
      result.valid,
      "a register that pays one employee ID three times must not be importable",
    ).toBe(false);
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
    for (const e of result.errors) {
      expect(e.message).toBe("Duplicate employee ID E001: also on row 2");
    }
  });

  it("still totals the rows it refuses, so the figure at stake is visible", () => {
    // 5,000 + 5,000 = 10,000 gross presented; the first-row-only reading that
    // used to reach the dashboard was 5,000.
    const result = validateRows(
      [row("E001", 5000, 4500), row("E001", 5000, 4500)],
      COLUMNS,
    );
    expect(result.totalGross).toBe(10_000);
    expect(result.totalNet).toBe(9000);
    expect(result.employeeCount).toBe(2);
  });

  it("accepts a register whose IDs are unique", () => {
    const result = validateRows(
      [row("E001", 5000, 4500), row("E002", 3000, 2700), row("E003", 4000, 3600)],
      COLUMNS,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.totalGross).toBe(12_000);
    expect(result.totalNet).toBe(10_800);
  });

  it("leaves a missing ID as its own error rather than a duplicate", () => {
    const result = validateRows([row("", 5000, 4500), row("E002", 3000, 2700)], COLUMNS);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toBe("Missing employee ID");
  });

  it("keeps a negative net as a warning, which is a different finding", () => {
    // Pinned so promoting the duplicate check does not promote its neighbours:
    // a negative net is step 4's business, and it still lets the upload through.
    const result = validateRows([row("E001", 5000, -100)], COLUMNS);

    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.message)).toEqual(["Negative net salary value"]);
  });
});
