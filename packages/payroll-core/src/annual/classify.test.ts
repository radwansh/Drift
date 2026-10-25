import { describe, it, expect } from "vitest";
import { classifyComponent, classifyComponentWithReason, isTotalColumn } from "./classify";
import type { Category } from "./types";
import {
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  EMPLOYER_COST_CATEGORIES,
} from "./types";

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
/**
 * Step 7 of docs/PAYROLL_AUDIT_FIX_PLAN.md — the 46 real register headers.
 *
 * 22 of these were misfiled when the step was opened: the plan lists 24, less
 * the two employer-insurance rows closed by step 3b. Each row is a header a
 * payroll export actually emits, and each misfiling had a consequence in the
 * bridge rather than only in a label:
 *
 *   - retro, back pay, arrears, severance and notice pay read as `base_salary`,
 *     so a one-off became permanent and `forecast.ts` carried it into every
 *     remaining period of the year;
 *   - `Accrued Leave Payout` read as `absence_deduction`, so money paid *to*
 *     the employee was booked as a deduction and absolute-valued — a sign error
 *     that moves the bridge the wrong way on both sides;
 *   - end-of-service benefit, indemnity and gratuity accruals read as an
 *     allowance or a bonus, which puts a top-three GCC and Lebanese employer
 *     cost inside gross as employee pay;
 *   - `Congés payés` read as an absence deduction, so French paid leave read as
 *     unpaid;
 *   - none of the six transliterated Arabic headers was recognised at all,
 *     though their Arabic-script forms were: the synonym table carried the
 *     script and no Latin transliteration, which is what local GCC and Levant
 *     payroll software exports;
 *   - `Cost Centre` was uncategorised, and the upload writes a component as
 *     `Number(val) || 0`, so a text code becomes 0.00 against every employee.
 *
 * Headers are added here as they are met, not guessed at.
 */
describe("classifyComponent - the 46 register headers of step 7", () => {
  const cases: [string, Category][] = [
    // --- English, already correct before this step ---
    ["Basic Salary", "base_salary"],
    ["Housing Allowance", "allowance"],
    ["Transportation Allowance", "allowance"],
    ["Overtime", "overtime"],
    ["Bonus", "bonus_commission"],
    ["Sales Commission", "bonus_commission"],
    ["Income Tax", "income_tax"],
    ["Social Security EE", "social_security_employee"],
    ["NSSF ER", "social_security_employer"],
    ["Employer Social Security", "social_security_employer"],
    ["Health Insurance Employer", "other_employer_cost"],
    ["Loan Repayment", "other_deduction"],
    ["Unpaid Leave", "absence_deduction"],
    ["Absence Days", "absence_days"],
    ["Gross Pay", "ignore"],
    ["Net Pay", "ignore"],
    ["Total Deductions", "ignore"],
    // --- French, already correct before this step ---
    ["Salaire de base", "base_salary"],
    ["Heures supplémentaires", "overtime"],
    ["Cotisation sociale salariale", "social_security_employee"],
    ["Retenue sur salaire", "other_deduction"],
    // --- Arabic script, already correct before this step ---
    ["راتب اساسي", "base_salary"],
    ["بدل نقل", "allowance"],
    ["تأمين صحي", "other_deduction"],
    // --- retro and back pay: a one-off, never the run rate ---
    ["Retro Pay", "other_earning"],
    ["Back Pay", "other_earning"],
    ["Retroactive Salary Adjustment", "other_earning"],
    ["Rappel de salaire", "other_earning"],
    ["Arrears", "other_earning"],
    // --- settlement money paid to the employee ---
    ["Severance Pay", "other_earning"],
    ["Notice Pay", "other_earning"],
    ["Accrued Leave Payout", "other_earning"],
    // --- employer provisions and burdens, outside gross ---
    ["End of Service Benefit", "other_employer_cost"],
    ["Indemnity Provision", "other_employer_cost"],
    ["Gratuity Accrual", "other_employer_cost"],
    ["Charges patronales", "other_employer_cost"],
    // --- French leave ---
    ["Congés payés", "other_earning"],
    ["Maladie", "absence_deduction"],
    // --- transliterated Arabic, 0 of 6 recognised before this step ---
    ["Badal Naql", "allowance"],
    ["Badal Sakan", "allowance"],
    ["Rateb Asasi", "base_salary"],
    ["Mukafaa", "bonus_commission"],
    ["Daman Ijtimai", "social_security_employee"],
    ["Takmeen Sehi", "other_deduction"],
    // --- not money at all ---
    ["FTE", "other_quantity"],
    ["Cost Centre", "ignore"],
  ];

  it("covers 46 headers", () => {
    expect(cases).toHaveLength(46);
  });

  it.each(cases)("classifies %s as %s", (key, expected) => {
    const reason = classifyComponentWithReason(key);
    expect(
      reason.category,
      `"${key}" landed in ${reason.category} by rule "${reason.rule}", matching ${JSON.stringify(reason.matched)}`,
    ).toBe(expected);
  });

  /**
   * The side of the bridge, not the label. A misfiling matters because of where
   * the money lands, so the two sign errors are asserted as sides.
   */
  it("puts money paid to the employee on the earnings side", () => {
    for (const key of ["Accrued Leave Payout", "Congés payés", "Retro Pay", "Severance Pay"]) {
      expect(EARNING_CATEGORIES, key).toContain(classifyComponent(key));
    }
  });

  it("keeps end-of-service provisions out of gross, on the employer side", () => {
    for (const key of ["End of Service Benefit", "Indemnity Provision", "Gratuity Accrual"]) {
      expect(EMPLOYER_COST_CATEGORIES, key).toContain(classifyComponent(key));
      expect(EARNING_CATEGORIES, key).not.toContain(classifyComponent(key));
    }
  });

  it("explains itself: every new rule has a name the category manager can show", () => {
    expect(classifyComponentWithReason("Retro Pay").rule).toBe("one-off-earning");
    expect(classifyComponentWithReason("Congés payés").rule).toBe("paid-leave");
    expect(classifyComponentWithReason("Gratuity Accrual").rule).toBe("employer-provision");
    expect(classifyComponentWithReason("Charges patronales").rule).toBe("employer-burden");
    expect(classifyComponentWithReason("FTE").rule).toBe("quantity-fte");
    expect(classifyComponentWithReason("Cost Centre").rule).toBe("text-column");
  });
});

/**
 * The collisions the new vocabulary creates, pinned so a fix for one header
 * does not quietly move another.
 */
describe("classifyComponent - step 7 guards", () => {
  it("reads French health cover as insurance, not sick leave", () => {
    // `maladie` had to join the absence vocabulary for the bare "Maladie"
    // column, which puts it in the same key as "Assurance maladie". Insurance
    // wins: cover is not an absence.
    expect(classifyComponent("Assurance maladie")).toBe("other_deduction");
    expect(classifyComponent("Assurance maladie employeur")).toBe("other_employer_cost");
  });

  it("keeps a deduction a deduction when it is named after an arrear", () => {
    expect(classifyComponent("Loan Arrears")).toBe("other_deduction");
    expect(classifyComponent("Arrears Deduction")).toBe("other_deduction");
  });

  it("leaves a bare gratuity as a bonus, because it is pay in most of the world", () => {
    // Only an *accrual* or a *provision* is an employer liability. "Gratuity"
    // alone is a tip or a bonus and stays where it was.
    expect(classifyComponent("Gratuity")).toBe("bonus_commission");
  });

  it("treats FTE as a quantity only when the column is nothing else", () => {
    // A proration basis is a count; a salary stated at full-time equivalent is
    // money, and dropping it out of the money categories would lose it.
    expect(classifyComponent("FTE")).toBe("other_quantity");
    expect(classifyComponent("FTE Salary")).toBe("base_salary");
  });

  it("still routes an unpaid absence to the deduction side", () => {
    expect(EMPLOYEE_DEDUCTION_CATEGORIES).toContain(classifyComponent("Unpaid Leave"));
    expect(EMPLOYEE_DEDUCTION_CATEGORIES).toContain(classifyComponent("Maladie"));
    expect(classifyComponent("Sick-leave days")).toBe("absence_days");
  });

  it("leaves a retro that names a statutory line on that line", () => {
    // A retro adjustment to social security or to tax is not an earning. The
    // one-off rule is skipped whenever the header names the line it corrects.
    expect(classifyComponent("Rappel de cotisation sociale")).toBe("social_security_employee");
    expect(classifyComponent("Retro Income Tax")).toBe("income_tax");
  });

  it("does not read an English sick-pay column as an absence", () => {
    // `maladie` is in the absence vocabulary because the plan's `Maladie`
    // column is a sick-absence deduction. Its English cousin is deliberately
    // not: "Sick Pay" is money paid, and putting it on the deduction side
    // would be the same sign error this step exists to remove. The day a real
    // register brings a sick column, it gets a row in the table above and a
    // rule of its own.
    expect(EARNING_CATEGORIES).toContain(classifyComponent("Sick Pay"));
  });
});
