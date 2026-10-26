export type PeriodType = "monthly" | "weekly" | "bi_monthly" | "bi_weekly";
export type ForecastMethod = "run_rate" | "average" | "prior_year";

export type Category =
  | "base_salary"
  | "allowance"
  | "bonus_commission"
  | "overtime"
  | "other_earning"
  | "income_tax"
  | "social_security_employee"
  | "other_deduction"
  | "absence_deduction"
  | "social_security_employer"
  | "other_employer_cost"
  | "absence_days"
  | "other_quantity"
  | "ignore"
  | "uncategorised";

export const EARNING_CATEGORIES: readonly Category[] = [
  "base_salary",
  "allowance",
  "bonus_commission",
  "overtime",
  "other_earning",
];

export const EMPLOYEE_DEDUCTION_CATEGORIES: readonly Category[] = [
  "income_tax",
  "social_security_employee",
  "other_deduction",
  "absence_deduction",
];

export const EMPLOYER_COST_CATEGORIES: readonly Category[] = [
  "social_security_employer",
  "other_employer_cost",
];

export const QUANTITY_CATEGORIES: readonly ("absence_days" | "other_quantity")[] = [
  "absence_days",
  "other_quantity",
];

export const MONEY_CATEGORIES: readonly Category[] = [
  ...EARNING_CATEGORIES,
  ...EMPLOYEE_DEDUCTION_CATEGORIES,
  ...EMPLOYER_COST_CATEGORIES,
];

export type Money = number;

export const CATEGORY_LABELS: Record<Category, string> = {
  base_salary: "Base salary",
  allowance: "Allowances",
  bonus_commission: "Bonus & commission",
  overtime: "Overtime",
  other_earning: "Other earnings",
  income_tax: "Income tax",
  social_security_employee: "Employee social security",
  other_deduction: "Other deductions",
  absence_deduction: "Absence",
  social_security_employer: "Employer social security",
  other_employer_cost: "Other employer costs",
  absence_days: "Absence days",
  other_quantity: "Other quantities",
  ignore: "Ignored",
  uncategorised: "Uncategorised",
};

/** A per-period, per-component aggregated row (output of query Q2). */
export interface ComponentAggregate {
  key: string;
  total: number;
  negRows: number;
  posRows: number;
}

/** A normalized payroll period fed to the annual calculation engine. */
export interface AnnualPeriodInput {
  id: string;
  periodType: PeriodType;
  currency: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  headcount: number;
  gross: number;
  net: number;
  components: ComponentAggregate[];
  employeeIds?: string[];
}

export interface ExpectedSlot {
  label: string;
  start: string;
  end: string;
  index: number;
}

export interface CategoryTotals {
  byCategory: Partial<Record<Category, number>>;
  quantities: Partial<Record<"absence_days" | "other_quantity", number>>;
  byKey: Record<string, { category: Category; total: number }>;
  mixedSignKeys: string[];
  uncategorisedKeys: string[];
  /**
   * Columns the vocabulary could not place, each with the question to ask
   * (step 11). A subset of `uncategorisedKeys`: these are uncategorised
   * because the classifier declined to guess, not because nothing matched,
   * and they get a question of their own rather than the generic notice.
   */
  ambiguousKeys: { key: string; question: string }[];
}

/**
 * "estimated" is a past slot with no upload whose figures were projected
 * (step 14) — distinct from "forecast", which is the future. The UI draws them
 * differently: estimated outlined, missing hatched, forecast at 40% opacity.
 */
export type PeriodKind = "actual" | "estimated" | "forecast" | "missing";

export interface PeriodResult {
  label: string;
  start: string;
  end: string;
  kind: PeriodKind;
  gross: Money;
  net: Money;
  /** Gross plus employer costs. Replaces the old on-costs-only `employerCost`. */
  totalEmploymentCost: Money;
  headcount: number | null;
  joiners: number | null;
  leavers: number | null;
}