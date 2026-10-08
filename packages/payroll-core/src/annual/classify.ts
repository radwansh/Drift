import type { Category } from "./types";

/**
 * Deterministic heuristic classifier for payroll component keys (spec 4.2).
 * Normalization: lowercase, `_`/`-` -> space, accent marks stripped.
 * Order matters: quantities first, employer buckets before employee buckets.
 */

function normalize(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[_\u2011-]/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text);
}

function hasAnyWord(text: string, words: readonly string[]): boolean {
  return words.some((w) => hasWord(text, w));
}

function hasPhrase(text: string, phrase: string): boolean {
  return text.includes(phrase);
}

const QUANTITY_WORDS = ["days", "hours", "hrs"] as const;
const ABSENCE_WORDS = ["absence", "leave", "unpaid"] as const;

const EMPLOYER_WORDS = ["employer", "company"] as const;
const EMPLOYER_SOCIAL_WORDS = [
  "social",
  "pension",
  "insurance",
  "contribution",
  "nssf",
  "gosi",
  "cnps",
] as const;
const EMPLOYER_LEVY_WORDS = [
  "levy",
  "fund",
  "scheme",
  "contribution",
  "budget",
] as const;

const ABSENCE_MONEY_WORDS = ["absence", "unpaid", "lwop", "lateness"] as const;
const ABSENCE_MONEY_PHRASES = ["no pay"] as const;

const TAX_WORDS = ["tax", "paye", "withholding", "wht", "impot", "steuer", "irpef", "irpp"] as const;
const TAX_EXCLUSIONS = ["taxable", "pre tax", "tax base", "tax free", "taxable base"] as const;

const EMPLOYEE_SOCIAL_WORDS = [
  "social",
  "pension",
  "retirement",
  "provident",
  "ssn",
  "nssf",
  "gosi",
  "pifss",
  "cnps",
  "cnaps",
  "inss",
] as const;
const EMPLOYEE_SOCIAL_PHRASES = ["national insurance"] as const;

const OVERTIME_WORDS = ["overtime"] as const;
const OVERTIME_PHRASES = ["ot pay"] as const;
const BONUS_WORDS = ["bonus", "commission", "incentive", "13th", "14th", "gratuity", "award"] as const;

const ALLOWANCE_WORDS = [
  "allowance",
  "housing",
  "transport",
  "travel",
  "meal",
  "phone",
  "cola",
  "hra",
] as const;
const ALLOWANCE_PHRASES = ["per diem"] as const;

const BASE_WORDS = ["base", "basic"] as const;
const BASE_FOLLOWED_BY = ["salary", "pay", "wage"] as const;

const OTHER_DEDUCTION_WORDS = [
  "deduction",
  "loan",
  "advance",
  "garnishment",
  "garnish",
  "union",
  "recovery",
  "fine",
] as const;
const OTHER_DEDUCTION_PHRASES = ["health insurance"] as const;

export function classifyComponent(key: string): Category {
  const text = normalize(key);
  if (!text) return "uncategorised";

  const has = {
    word: (w: string) => hasWord(text, w),
    anyWord: (words: readonly string[]) => hasAnyWord(text, words),
    phrase: (p: string) => hasPhrase(text, p),
  };

  // 1. Quantities never count as money.
  if (has.anyWord(QUANTITY_WORDS)) {
    return has.anyWord(ABSENCE_WORDS) ? "absence_days" : "other_quantity";
  }

  // 2. Employer-side buckets (before employee social security).
  if (has.anyWord(EMPLOYER_WORDS)) {
    if (has.anyWord(EMPLOYER_SOCIAL_WORDS)) return "social_security_employer";
    if (has.anyWord(EMPLOYER_LEVY_WORDS)) return "other_employer_cost";
  }

  // 3. Absence penalty paid by employee.
  if (has.anyWord(ABSENCE_MONEY_WORDS) || ABSENCE_MONEY_PHRASES.some(has.phrase)) {
    return "absence_deduction";
  }

  // 4. Income tax (excluding taxable base / pre-tax / tax-free amounts).
  if (
    has.anyWord(TAX_WORDS) &&
    !TAX_EXCLUSIONS.some((e) => has.phrase(e) || has.word(e.replace(/ /g, "")))
  ) {
    return "income_tax";
  }

  // 5. Employee social security / retirement / provident.
  if (has.anyWord(EMPLOYEE_SOCIAL_WORDS) || EMPLOYEE_SOCIAL_PHRASES.some(has.phrase)) {
    return "social_security_employee";
  }

  // 6. Variable earnings.
  if (has.anyWord(OVERTIME_WORDS) || OVERTIME_PHRASES.some(has.phrase)) return "overtime";
  if (has.anyWord(BONUS_WORDS)) return "bonus_commission";

  // 7. Allowances.
  if (has.anyWord(ALLOWANCE_WORDS) || ALLOWANCE_PHRASES.some(has.phrase)) return "allowance";

  // 8. Base salary (base/basic immediately before salary/pay/wage).
  const baseIndex = Math.min(
    ...BASE_WORDS.map((w) => text.indexOf(w)).filter((i) => i >= 0),
    Infinity,
  );
  if (baseIndex !== Infinity) {
    const remainder = text.slice(baseIndex);
    if (BASE_FOLLOWED_BY.some((w) => remainder.includes(w)) && remainder !== "base schedule") {
      const after = text.slice(baseIndex);
      if (hasWord(after, "taxable") || hasPhrase(after, "pre tax")) {
        return "uncategorised";
      }
      return "base_salary";
    }
  }

  // 9. Other employee deductions.
  if (has.anyWord(OTHER_DEDUCTION_WORDS) || OTHER_DEDUCTION_PHRASES.some(has.phrase)) {
    return "other_deduction";
  }

  return "uncategorised";
}