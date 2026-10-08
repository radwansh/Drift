import { describe, it, expect } from "vitest";
import { classifyComponent } from "./classify";

describe("classifyComponent", () => {
  it("classifies quantities before money categories", () => {
    expect(classifyComponent("Overtime Hours")).toBe("other_quantity");
    expect(classifyComponent("Absence Days")).toBe("absence_days");
    expect(classifyComponent("Sick-leave days")).toBe("absence_days");
    expect(classifyComponent("Hours worked")).toBe("other_quantity");
  });

  it("buckets employer social security and other employer costs", () => {
    expect(classifyComponent("Employer Social Security")).toBe("social_security_employer");
    expect(classifyComponent("SOCIAL_SECURITY")).toBe("social_security_employee");
    expect(classifyComponent("Employer pension contribution")).toBe("social_security_employer");
    expect(classifyComponent("Employer NSSF")).toBe("social_security_employer");
    expect(classifyComponent("Company bonus")).toBe("bonus_commission");
    expect(classifyComponent("Employer training levy")).toBe("other_employer_cost");
  });

  it("excludes taxable base and pre-tax amounts from income tax", () => {
    expect(classifyComponent("Income Tax")).toBe("income_tax");
    expect(classifyComponent("PAYE tax")).toBe("income_tax");
    expect(classifyComponent("Impôt sur le revenu")).toBe("income_tax");
    expect(classifyComponent("Taxable Salary")).toBe("uncategorised");
    expect(classifyComponent("Pre tax salary")).toBe("uncategorised");
  });

  it("classifies employee social security and retirement", () => {
    expect(classifyComponent("Social Security")).toBe("social_security_employee");
    expect(classifyComponent("National Insurance")).toBe("social_security_employee");
    expect(classifyComponent("NSSF")).toBe("social_security_employee");
    expect(classifyComponent("Provident fund")).toBe("social_security_employee");
  });

  it("classifies variable earnings", () => {
    expect(classifyComponent("Overtime")).toBe("overtime");
    expect(classifyComponent("OT pay")).toBe("overtime");
    expect(classifyComponent("Bonus")).toBe("bonus_commission");
    expect(classifyComponent("Sales commission")).toBe("bonus_commission");
    expect(classifyComponent("13th month")).toBe("bonus_commission");
    expect(classifyComponent("Gratuity")).toBe("bonus_commission");
  });

  it("classifies allowances and base salary", () => {
    expect(classifyComponent("Housing Allowance")).toBe("allowance");
    expect(classifyComponent("Transport allowance")).toBe("allowance");
    expect(classifyComponent("Per diem")).toBe("allowance");
    expect(classifyComponent("Base Salary")).toBe("base_salary");
    expect(classifyComponent("basic pay")).toBe("base_salary");
  });

  it("classifies absence penalties and other deductions", () => {
    expect(classifyComponent("Unpaid leave")).toBe("absence_deduction");
    expect(classifyComponent("Lateness")).toBe("absence_deduction");
    expect(classifyComponent("No pay")).toBe("absence_deduction");
    expect(classifyComponent("Loan recovery")).toBe("other_deduction");
    expect(classifyComponent("Union dues")).toBe("other_deduction");
    expect(classifyComponent("Health Insurance")).toBe("other_deduction");
    expect(classifyComponent("Wage advance")).toBe("other_deduction");
  });

  it("treats unsupported keys as uncategorised and ignores empties", () => {
    expect(classifyComponent("Mystery Earnings Line")).toBe("uncategorised");
    expect(classifyComponent("  ")).toBe("uncategorised");
    expect(classifyComponent("")).toBe("uncategorised");
  });
});