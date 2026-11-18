import { describe, it, expect } from "vitest";
import { classifyComponent, classifyComponentWithReason } from "../annual/classify";
import {
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  EMPLOYER_COST_CATEGORIES,
  type Category,
} from "../annual/types";
import { qeTreatmentFor } from "./qualifying-earnings";

/**
 * `docs/AU_PAYROLL_SPEC.md` sections 5, 6 and 9.1, as a table.
 *
 * Section 9.1 is the list of verified misclassifications, each reproduced
 * against the code at commit `4ca973a`; section 5.2 is the taxonomy it is
 * measured against. Headers are added here as a real register brings them, the
 * same way the French and Arabic tables were built.
 */
describe("the Australian vocabulary — spec 9.1's misclassifications", () => {
  const cases: [string, Category, string][] = [
    // --- salary sacrifice: every variant read as base_salary ---
    ["Salary Sacrifice", "other_deduction", "au-salary-sacrifice-super"],
    ["Salary Sacrifice (Super)", "other_deduction", "au-salary-sacrifice-super"],
    ["Salary Sacrifice (Superannuation)", "other_deduction", "au-salary-sacrifice-super"],
    ["Salary Sacrifice Super", "other_deduction", "au-salary-sacrifice-super"],
    ["Salary Sacrifice - Superannuation", "other_deduction", "au-salary-sacrifice-super"],
    ["Super Salary Sacrifice", "other_deduction", "au-salary-sacrifice-super"],
    ["Sacrifice Super", "other_deduction", "au-salary-sacrifice-super"],
    ["Pre-tax Super", "other_deduction", "au-salary-sacrifice-super"],
    ["Salary packaging - super", "other_deduction", "au-salary-sacrifice-super"],
    // STP Phase 2 type O, which is not added back into the super base
    ["Salary Sacrifice (Other)", "other_deduction", "au-salary-sacrifice-other"],
    ["Salary Sacrifice - Other", "other_deduction", "au-salary-sacrifice-other"],
    ["Salary Sacrifice (Novated Lease)", "other_deduction", "au-salary-sacrifice-other"],
    ["Novated Lease", "other_deduction", "au-salary-sacrifice-other"],
    ["Salary Packaging", "other_deduction", "au-salary-sacrifice-other"],
    ["Device Salary Sacrifice", "other_deduction", "au-salary-sacrifice-other"],
    // --- leave and loadings: all nine were absence_deduction ---
    ["Leave Loading", "other_earning", "leave-loading"],
    ["Annual Leave Loading", "other_earning", "leave-loading"],
    ["Holiday Leave Loading", "other_earning", "leave-loading"],
    ["Annual Leave", "base_salary", "leave-taken"],
    ["Annual Leave Taken", "base_salary", "leave-taken"],
    ["Long Service Leave", "base_salary", "leave-taken"],
    ["Personal Leave", "base_salary", "leave-taken"],
    ["Personal/Carer's Leave", "base_salary", "leave-taken"],
    ["Compassionate Leave", "base_salary", "leave-taken"],
    ["Unused Annual Leave on Termination", "other_earning", "termination-pay"],
    ["Parental Leave", "other_earning", "leave-excluded"],
    // --- employer taxes read as the employee's income tax ---
    ["Payroll Tax", "other_employer_cost", "employer-tax"],
    ["State Payroll Tax", "other_employer_cost", "employer-tax"],
    ["Fringe Benefits Tax", "other_employer_cost", "employer-tax"],
    ["FBT", "other_employer_cost", "employer-tax"],
    ["WorkCover", "other_employer_cost", "employer-tax"],
    ["Workers Compensation", "other_employer_cost", "employer-tax"],
    ["Portable Long Service Levy", "other_employer_cost", "employer-tax"],
    // --- an earning read as a tax, and a basis read as a tax ---
    ["Tax Exempt Earnings", "ignore", "aggregate-column"],
    ["Post Tax Deductions", "other_deduction", "taxable-base-deduction"],
    ["Pre Tax Deductions", "other_deduction", "taxable-base-deduction"],
    // --- twenty headers that matched nothing at all ---
    ["Super", "social_security_employer", "au-employer-super"],
    ["Superannuation", "social_security_employer", "au-employer-super"],
    ["Super Guarantee", "social_security_employer", "au-employer-super"],
    ["Superannuation Guarantee", "social_security_employer", "au-employer-super"],
    ["Super Guarantee (SG)", "social_security_employer", "au-employer-super"],
    ["SG", "social_security_employer", "au-employer-super"],
    ["Employer Super", "social_security_employer", "au-employer-super"],
    ["Employer Superannuation", "social_security_employer", "au-employer-super"],
    ["PAYG", "income_tax", "tax"],
    ["PAYGW", "income_tax", "tax"],
    ["PAYG Withholding", "income_tax", "tax"],
    ["STSL", "income_tax", "tax"],
    ["HECS-HELP", "income_tax", "tax"],
    ["SFSS", "income_tax", "tax"],
    ["RESC", "ignore", "aggregate-column"],
    ["Employer Additional", "other_employer_cost", "employer-additional"],
    ["Employer Additional Super", "other_employer_cost", "au-employer-super-additional"],
    ["Child Support", "other_deduction", "other-deduction"],
    ["Lump Sum A", "other_earning", "termination-pay"],
    ["Lump Sum E", "other_earning", "termination-pay"],
    ["Lump Sum W", "other_earning", "termination-pay"],
    ["ETP", "other_earning", "termination-pay"],
    ["ETP Taxable Component", "other_earning", "termination-pay"],
    ["ETP Tax Free Component", "other_earning", "termination-pay"],
    ["Employment Termination Payment", "other_earning", "termination-pay"],
    ["Directors Fees", "other_earning", "director-fee"],
    ["Director's Fees", "other_earning", "director-fee"],
    ["Casual Loading", "base_salary", "loading"],
    ["Shift Loading", "base_salary", "loading"],
    ["Higher Duties", "base_salary", "loading"],
    ["Ordinary Earnings", "base_salary", "au-ordinary-earnings"],
    ["Ordinary Time Earnings", "base_salary", "au-ordinary-earnings"],
    ["OTE", "base_salary", "au-ordinary-earnings"],
    ["Redundancy Pay", "other_earning", "termination-pay"],
    ["Payment in Lieu of Notice", "other_earning", "termination-pay"],
    // --- text read as an employer cost ---
    ["Super Fund Name", "ignore", "text-column"],
    ["Superannuation Fund", "ignore", "text-column"],
    ["Fund USI", "ignore", "text-column"],
    ["Member Number", "ignore", "text-column"],
    // --- employee social security, which Australia does not have ---
    ["Social Club", "other_deduction", "other-deduction"],
    ["Social Club Fund", "other_deduction", "other-deduction"],
    // --- a money column read as a quantity ---
    ["Ordinary Hours", "base_salary", "au-ordinary-earnings"],
    // --- a date column stored as 0.00 against every employee ---
    ["Pay Period Start", "ignore", "date-column"],
    ["Pay Period End", "ignore", "date-column"],
    // --- an overtime allowance read as overtime ---
    ["Meal Allowance (Overtime)", "allowance", "allowance"],
    ["Overtime Meal Allowance", "allowance", "allowance"],
    // --- the rest of spec 9.1's last row ---
    ["Unused Holiday Pay", "other_earning", "termination-pay"],
    ["Super Guarantee Charge", "other_employer_cost", "au-super-charge"],
  ];

  it.each(cases)("%s -> %s", (key, category, rule) => {
    const reason = classifyComponentWithReason(key);
    expect(
      [reason.category, reason.rule],
      `"${key}" landed in ${reason.category} by rule "${reason.rule}", matching ${JSON.stringify(reason.matched)}`,
    ).toEqual([category, rule]);
  });

  it("covers every row of spec 9.1", () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
  });
});

/**
 * Spec 6.8: the table of false matches, each of which would break a customer's
 * gross-to-net. This is the reason the classifier matches tokens, not
 * substrings — pinned so a later vocabulary addition cannot quietly undo it.
 */
describe("spec 6.8 — the dangerously ambiguous tokens", () => {
  it("never reads `super` as a substring", () => {
    // Each of these would move from inside gross to the employer side, which
    // lowers gross and raises the on-cost rate at once. What matters is the
    // side, so the side is what is asserted.
    for (const key of [
      "Supervisor Allowance",
      "Supervisor Loading",
      "Supervision Allowance",
      "Supermarket Allowance",
      "Superintendent Allowance",
    ]) {
      expect(EARNING_CATEGORIES, key).toContain(classifyComponent(key));
      expect(EMPLOYER_COST_CATEGORIES, key).not.toContain(classifyComponent(key));
    }
    for (const key of ["Supervisor Allowance", "Supervision Allowance", "Superintendent Allowance"]) {
      expect(classifyComponent(key), key).toBe("allowance");
    }
  });

  it("keeps a loading on the earnings side, always", () => {
    for (const key of ["Leave Loading", "Casual Loading", "Shift Loading", "Salary Loading"]) {
      expect(EARNING_CATEGORIES, key).toContain(classifyComponent(key));
      expect(EMPLOYEE_DEDUCTION_CATEGORIES, key).not.toContain(classifyComponent(key));
    }
  });

  it("never counts the guarantee charge toward the guarantee", () => {
    // A penalty payable to the ATO, not a contribution. `actualSG` reads the
    // rule name, so this column cannot reach it.
    expect(classifyComponentWithReason("Super Guarantee Charge").rule).toBe("au-super-charge");
    expect(classifyComponentWithReason("SGC Penalty").rule).not.toBe("au-employer-super");
  });

  it("splits `Child Support` from `Child Support Deduction` no longer", () => {
    expect(classifyComponent("Child Support")).toBe("other_deduction");
    expect(classifyComponent("Child Support Deduction")).toBe("other_deduction");
  });

  it("keeps `Gross Plus Super` out of gross", () => {
    expect(classifyComponent("Gross Plus Super")).toBe("ignore");
  });

  it("still reads an unpaid absence as a deduction", () => {
    for (const key of ["Unpaid Leave", "Leave Without Pay", "LWOP", "No pay", "Absence sans solde"]) {
      expect(EMPLOYEE_DEDUCTION_CATEGORIES, key).toContain(classifyComponent(key));
    }
  });

  it("keeps the employer side off the employee side, in every AU spelling", () => {
    for (const key of [
      "Superannuation Guarantee",
      "Employer Additional Super",
      "Payroll Tax",
      "WorkCover",
      "Super Guarantee Charge",
    ]) {
      expect(EMPLOYER_COST_CATEGORIES, key).toContain(classifyComponent(key));
      expect(EARNING_CATEGORIES, key).not.toContain(classifyComponent(key));
      expect(EMPLOYEE_DEDUCTION_CATEGORIES, key).not.toContain(classifyComponent(key));
    }
  });
});

/**
 * The French and Arabic vocabularies the Australian one had to share a file
 * with. `annual/classify.test.ts` covers them in full; these are the specific
 * collisions the Australian additions created.
 */
describe("the vocabularies that were already here", () => {
  it("leaves `Congés payés` a paid-leave earning, by its own rule", () => {
    expect(classifyComponentWithReason("Congés payés")).toMatchObject({
      category: "other_earning",
      rule: "paid-leave",
    });
  });

  it("keeps a retro an earning and a retro of a statutory line on that line", () => {
    expect(classifyComponentWithReason("Retro Pay").rule).toBe("one-off-earning");
    expect(classifyComponent("Rappel de cotisation sociale")).toBe("social_security_employee");
    expect(classifyComponent("Retro Income Tax")).toBe("income_tax");
  });

  it("still asks about a bare `Maladie` and nothing Australian", () => {
    expect(classifyComponentWithReason("Maladie").rule).toBe("ambiguous");
    for (const key of ["Superannuation", "Annual Leave Loading", "PAYG", "Salary Sacrifice"]) {
      expect(classifyComponentWithReason(key).ambiguity, key).toBeUndefined();
    }
  });

  it("leaves samples/2025's deliberately unplaced column unplaced", () => {
    // The fixture generator documents it, `other_earnings_balance` depends on
    // it, and the `burden` vocabulary added for `Employer Expenses` must not
    // claim it: that group only ever fires next to an employer marker.
    expect(classifyComponent("Expense Reimbursement")).toBe("uncategorised");
    expect(classifyComponent("Employer Expenses")).toBe("other_employer_cost");
  });
});

/**
 * Spec 5.4, the reason Australia needs no sixteenth `Category`: three
 * `other_deduction` columns, and only one of them is qualifying earnings. The
 * distinction lives in the rule name.
 */
describe("the rule name carries what the category cannot", () => {
  it("adds back only the sacrifice to superannuation", () => {
    expect(qeTreatmentFor("Salary Sacrifice (Superannuation)")).toMatchObject({
      category: "other_deduction",
      treatment: "in",
    });
    expect(qeTreatmentFor("Salary Sacrifice (Other)")).toMatchObject({
      category: "other_deduction",
      treatment: "out",
    });
    expect(qeTreatmentFor("Union Fee")).toMatchObject({
      category: "other_deduction",
      treatment: "out",
    });
  });

  it("lets a saved category override the rule, which is what an override is for", () => {
    const moved = qeTreatmentFor("Salary Sacrifice (Superannuation)", {
      "Salary Sacrifice (Superannuation)": "other_employer_cost",
    });
    expect(moved.category).toBe("other_employer_cost");
    expect(moved.treatment).toBe("out");
  });

  it("places each of spec 7.2's inclusions and exclusions", () => {
    const expected: [string, string][] = [
      ["Ordinary Hours", "in"],
      ["Base Salary", "in"],
      ["Casual Loading", "in"],
      ["Annual Leave", "in"],
      ["Commission", "in"],
      ["Performance Bonus", "in"],
      ["Tool Allowance", "in"],
      ["Directors Fees", "in"],
      ["Overtime", "out"],
      ["Meal Allowance (Overtime)", "out"],
      ["Expense Allowance", "out"],
      ["Unused Annual Leave on Termination", "out"],
      ["Annual Leave Loading on Termination", "out"],
      ["Redundancy Pay", "out"],
      ["Payment in Lieu of Notice", "out"],
      ["ETP", "out"],
      ["Parental Leave", "out"],
      ["PAYG Withholding", "out"],
      ["STSL", "out"],
      ["Union Fee", "out"],
      ["Unpaid Leave", "out"],
      ["Superannuation Guarantee", "out"],
      ["Payroll Tax", "out"],
      ["Gross Plus Super", "out"],
      ["Hours", "out"],
      ["Annual Leave Loading", "uncertain"],
      ["Travel Allowance", "uncertain"],
      ["Motor Vehicle Allowance", "uncertain"],
      ["Mystery Earnings Line", "unplaced"],
    ];
    for (const [key, treatment] of expected) {
      const got = qeTreatmentFor(key);
      expect([key, got.treatment], `${key}: ${got.reason}`).toEqual([key, treatment]);
    }
  });

  it("cites the statute for every treatment it gives", () => {
    for (const key of ["Ordinary Hours", "Commission", "Overtime", "ETP", "Parental Leave"]) {
      expect(qeTreatmentFor(key).reason.length, key).toBeGreaterThan(20);
    }
    expect(qeTreatmentFor("Commission").reason).toContain("s 10A(1)(b)");
    expect(qeTreatmentFor("Directors Fees").reason).toContain("s 10A(1)(c)");
    expect(qeTreatmentFor("Salary Sacrifice").reason).toContain("s 10A(1)(h)");
    expect(qeTreatmentFor("Parental Leave").reason).toContain("Regulation 12");
  });
});
