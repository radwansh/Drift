import { describe, it, expect } from "vitest";
import { classifyComponent, classifyComponentWithReason, isTotalColumn } from "./classify";

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

    // Private cover is an employer cost, not a statutory contribution. Bare
    // employer insurance used to match the social-security rule, which
    // overstated the statutory line and the employer on-cost rate, so a
    // reconciliation against a social security filing was out by the whole
    // medical premium.
    expect(classifyComponent("Health Insurance Employer")).toBe("other_employer_cost");

    // Still statutory when the name carries a social-security signal.
    expect(classifyComponent("Employer Social Insurance")).toBe("social_security_employer");
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

/**
 * Step 20 / finding C12: v1 missed 26 of these 30 common column names. Each row
 * is a real header shape seen in payroll exports.
 */
describe("classifyComponent v2 (the 30 names from C12)", () => {
  const cases: [string, string][] = [
    // bare headers — the single biggest source of v1 misses
    ["Basic", "base_salary"],
    ["Salary", "base_salary"],
    ["Wage", "base_salary"],
    ["Pay", "base_salary"],
    // abbreviations
    ["OT", "overtime"],
    ["OT Amount", "overtime"],
    // plurals
    ["Other Deductions", "other_deduction"],
    ["Allowances", "allowance"],
    ["Bonuses", "bonus_commission"],
    ["Taxes", "income_tax"],
    // near-misses on the v1 vocabulary
    ["Transportation", "allowance"],
    ["Transportation Allowance", "allowance"],
    ["Meal Allowance", "allowance"],
    // employer/employee side written as a token
    ["NSSF ER", "social_security_employer"],
    ["NSSF EE", "social_security_employee"],
    ["Pension ER", "social_security_employer"],
    // French
    ["Salaire de base", "base_salary"],
    ["Heures supplémentaires", "overtime"],
    ["Prime", "bonus_commission"],
    ["Indemnité de transport", "allowance"],
    ["Cotisation sociale", "social_security_employee"],
    ["Retenue", "other_deduction"],
    ["Impôt", "income_tax"],
    // Arabic
    ["الراتب الاساسي", "base_salary"],
    ["بدل سكن", "allowance"],
    ["ضريبة", "income_tax"],
    ["خصومات", "other_deduction"],
    ["عمل اضافي", "overtime"],
    ["مكافأة", "bonus_commission"],
    ["ايام غياب", "absence_days"],
  ];

  it.each(cases)("classifies %s as %s", (key, expected) => {
    expect(classifyComponent(key)).toBe(expected);
  });

  it("ignores total columns so they cannot double-count", () => {
    for (const total of [
      "Gross Pay",
      "Gross Salary",
      "Net Pay",
      "Net Salary",
      "Total Deductions",
      "Total Earnings",
      "Salaire net",
      "اجمالي",
    ]) {
      expect(isTotalColumn(total)).toBe(true);
      expect(classifyComponent(total)).toBe("ignore");
    }
  });

  it("does not treat an adjustment column as a total", () => {
    expect(isTotalColumn("Gross Salary Adjustment")).toBe(false);
    expect(classifyComponent("Gross Salary Adjustment")).not.toBe("ignore");
  });

  it("returns the matched rule so the category manager can explain itself", () => {
    expect(classifyComponentWithReason("NSSF ER").rule).toBe("employer-social");
    expect(classifyComponentWithReason("Gross Pay").rule).toBe("total-column");
    expect(classifyComponentWithReason("Salary").rule).toBe("salary-bare");
    expect(classifyComponentWithReason("Wage advance").rule).toBe("other-deduction");
    expect(classifyComponentWithReason("Zzz").rule).toBe("no-match");
  });
});