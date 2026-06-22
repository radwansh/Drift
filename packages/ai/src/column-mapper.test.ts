import { describe, it, expect } from "vitest";
import { suggestColumnMappings } from "./column-mapper";

describe("suggestColumnMappings", () => {
  it("maps standard headers correctly", async () => {
    const headers = ["Emp ID", "Full Name", "Department", "Gross", "Net", "Bonus", "Tax"];
    const result = await suggestColumnMappings(headers);

    expect(result).toHaveLength(7);

    const idCol = result.find((c) => c.sourceColumn === "Emp ID")!;
    expect(idCol.suggestedComponent).toBe("employee_id");
    expect(idCol.isEmployeeId).toBe(true);
    expect(idCol.confidence).toBeGreaterThan(0);

    const nameCol = result.find((c) => c.sourceColumn === "Full Name")!;
    expect(nameCol.suggestedComponent).toBe("employee_name");
    expect(nameCol.isEmployeeName).toBe(true);

    const deptCol = result.find((c) => c.sourceColumn === "Department")!;
    expect(deptCol.suggestedComponent).toBe("department");
    expect(deptCol.isDepartment).toBe(true);

    const grossCol = result.find((c) => c.sourceColumn === "Gross")!;
    expect(grossCol.suggestedComponent).toBe("gross_salary");
    expect(grossCol.isGrossSalary).toBe(true);

    const netCol = result.find((c) => c.sourceColumn === "Net")!;
    expect(netCol.suggestedComponent).toBe("net_salary");
    expect(netCol.isNetSalary).toBe(true);
  });

  it("maps employee_id variants", async () => {
    const variants = ["id", "emp_id", "employee_id", "code", "personnel_no"];
    const result = await suggestColumnMappings(variants);

    for (const col of result) {
      expect(col.suggestedComponent).toBe("employee_id");
      expect(col.isEmployeeId).toBe(true);
    }
  });

  it("maps bonus variants", async () => {
    const headers = ["bonus", "commission", "incentive"];
    const result = await suggestColumnMappings(headers);

    for (const col of result) {
      expect(col.suggestedComponent).toBe("bonus");
    }
  });

  it("maps deduction variants", async () => {
    const headers = ["deduction", "insurance", "pension", "social_security"];
    const result = await suggestColumnMappings(headers);

    const deductionCol = result.find((c) => c.sourceColumn === "deduction")!;
    expect(deductionCol.suggestedComponent).toBe("other_deduction");

    const insuranceCol = result.find((c) => c.sourceColumn === "insurance")!;
    expect(insuranceCol.suggestedComponent).toBe("insurance_deduction");

    const pensionCol = result.find((c) => c.sourceColumn === "pension")!;
    expect(pensionCol.suggestedComponent).toBe("pension_deduction");
  });

  it("handles unknown headers with low confidence", async () => {
    const headers = ["xyz_unknown", "foo_bar_baz"];
    const result = await suggestColumnMappings(headers);

    for (const col of result) {
      expect(col.confidence).toBeLessThan(0.5);
      expect(col.suggestedComponent).toBe("other_allowance");
    }
  });

  it("handles messy header formatting", async () => {
    const headers = ["  Gross Pay  ", "NET_SALARY", "employee-name"];
    const result = await suggestColumnMappings(headers);

    const grossCol = result.find((c) => c.sourceColumn === "  Gross Pay  ")!;
    expect(grossCol.suggestedComponent).toBe("gross_salary");

    const netCol = result.find((c) => c.sourceColumn === "NET_SALARY")!;
    expect(netCol.suggestedComponent).toBe("net_salary");

    const nameCol = result.find((c) => c.sourceColumn === "employee-name")!;
    expect(nameCol.suggestedComponent).toBe("employee_name");
  });

  it("handles empty headers", async () => {
    const result = await suggestColumnMappings([]);
    expect(result).toEqual([]);
  });
});
