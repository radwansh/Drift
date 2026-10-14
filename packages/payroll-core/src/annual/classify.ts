import type { Category } from "./types";

/**
 * Deterministic classifier for payroll component keys (spec 4.2, step 20).
 *
 * v1 missed 26 of 30 common column names (finding C12): bare "Basic" and
 * "Salary", the abbreviation "OT", plurals such as "Other Deductions",
 * "Transportation" (it only knew "transport"), employer-side markers written as
 * an "ER"/"EE" token rather than the word "employer", total columns like
 * "Gross Pay" and "Total Deductions" — which double-count if mapped as
 * components — and French and Arabic headers.
 *
 * Rule order matters and is load-bearing:
 *   1.  total columns        never a component; mapping them double-counts
 *   2.  quantities           days/hours are not money
 *   3.  taxable-base guard   "Taxable Salary" is a base, not a tax or a salary
 *   4.  employer side        before employee social, so "NSSF ER" lands right
 *   5.  absence              before tax, so "Unpaid Leave" is not read as a levy
 *   6.  income tax
 *   7.  employee social security, then employee insurance
 *   8.  variable earnings    overtime, bonus
 *   9.  allowances
 *   10. explicit base salary
 *   11. deductions           before bare "salary", so "Wage advance" is a deduction
 *   12. bare salary
 */

/** Strip accents, fold separators, lowercase. Arabic script is left intact. */
function normalize(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[_‑‒–—-]/g, " ")
    .replace(/[()[\]{}.,;:/\\]/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Crude English plural stemming, enough for column headers: "Deductions" ->
 * "deduction", "Allowances" -> "allowance", "Taxes" -> "tax". Applied per word so
 * a multi-word header still matches singular vocabulary.
 */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (
    word.endsWith("ses") ||
    word.endsWith("xes") ||
    word.endsWith("zes") ||
    word.endsWith("ches") ||
    word.endsWith("shes")
  ) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.split(" ").filter(Boolean)) {
    out.add(w);
    out.add(singularize(w));
  }
  return out;
}

/**
 * Synonym table: surface forms -> the canonical vocabulary the rules test.
 * Declarative so a new language pack or abbreviation needs no rule changes.
 */
const SYNONYMS: Record<string, readonly string[]> = {
  // --- quantities ---
  days: ["days", "day", "jours", "jour", "ايام", "يوم"],
  hours: ["hours", "hour", "hrs", "hr", "heures", "heure", "ساعات", "ساعة"],
  // --- absence ---
  absence: [
    "absence", "absences", "absent", "leave", "leaves", "unpaid", "lwop", "lateness", "late",
    "no pay", "nopay", "conge", "absent sans solde",
    "غياب", "اجازة",
  ],
  // --- side markers ---
  employer: [
    "employer", "employers", "company", "patronal", "patronale", "employeur", "part patronale",
    "صاحب العمل", "حصة الشركة",
  ],
  employee: ["employee", "employees", "salarial", "salariale", "part salariale", "حصة الموظف"],
  // --- social security ---
  social: [
    "social", "socials", "pension", "pensions", "retirement", "provident", "nssf", "gosi",
    "pifss", "cnps", "cnaps", "inss", "cnss", "ssn", "national insurance",
    "securite sociale", "retraite", "cotisation", "cotisations",
    "ضمان", "تقاعد", "التقاعد",
  ],
  insurance: ["insurance", "insurances", "assurance", "mutuelle", "تأمين"],
  // --- tax ---
  tax: [
    "tax", "taxes", "paye", "withholding", "wht", "impot", "impots", "ir", "irpp", "irpef",
    "steuer", "ضريبة", "الضريبة",
  ],
  // --- earnings ---
  overtime: [
    "overtime", "ot", "heures supplementaires", "heure supplementaire", "supplementaire", "hs",
    "اضافي", "عمل اضافي",
  ],
  bonus: [
    "bonus", "bonuses", "commission", "commissions", "incentive", "incentives", "gratuity",
    "award", "awards", "prime", "primes", "13th", "14th",
    "مكافأة", "علاوة", "حافز",
  ],
  allowance: [
    "allowance", "allowances", "indemnite", "indemnites", "indemnity", "benefit", "benefits",
    "per diem", "بدل", "بدلات",
  ],
  housing: ["housing", "accommodation", "rent", "logement", "سكن"],
  transport: ["transport", "transportation", "travel", "mileage", "fuel", "deplacement", "نقل", "مواصلات"],
  meal: ["meal", "meals", "canteen", "repas", "panier", "طعام"],
  base: ["base", "basic", "salaire de base", "fixe", "اساسي", "الاساسي"],
  salary: ["salary", "salaries", "wage", "wages", "pay", "salaire", "paie", "راتب", "الراتب", "اجر"],
  // --- deductions ---
  deduction: ["deduction", "deductions", "retenue", "retenues", "خصم", "خصومات", "استقطاع"],
  loan: ["loan", "loans", "advance", "advances", "pret", "avance", "recovery", "سلفة", "قرض"],
  garnishment: ["garnishment", "garnish", "attachment", "saisie", "fine", "fines"],
  union: ["union", "syndicat", "نقابة"],
  levy: ["levy", "levies", "fund", "funds", "scheme", "schemes", "contribution", "contributions", "training", "formation"],
};

/**
 * Reverse index: surface form -> canonical vocabulary word.
 *
 * Surfaces are passed through the same `normalize()` as the input. Without that,
 * Arabic forms carrying hamza (مكافأة) never matched: normalize() NFD-decomposes
 * the input while the literals here are NFC, so the two strings differ even
 * though they render identically.
 */
const SURFACE_TO_CANON = new Map<string, string>();
for (const [canon, surfaces] of Object.entries(SYNONYMS)) {
  for (const s of surfaces) SURFACE_TO_CANON.set(normalize(s), canon);
}

/** Longest first, so "heures supplementaires" is consumed before "heures". */
const MULTI_WORD_SURFACES = [...SURFACE_TO_CANON.keys()]
  .filter((s) => s.includes(" "))
  .sort((a, b) => b.length - a.length);

/**
 * The canonical vocabulary present in a key.
 *
 * Multi-word phrases are matched first and then *removed* from the text before
 * single words are stemmed. That ordering is load-bearing: "Heures
 * supplémentaires" is overtime, but leaving "heures" in the remainder would also
 * match the `hours` quantity vocabulary and the quantity rule — which runs first —
 * would classify French overtime as a quantity. "Overtime Hours", where the unit
 * word stands alone, still resolves to a quantity as it should.
 */
function vocabulary(text: string): Set<string> {
  const found = new Set<string>();
  let remainder = text;
  for (const surface of MULTI_WORD_SURFACES) {
    if (remainder.includes(surface)) {
      found.add(SURFACE_TO_CANON.get(surface)!);
      remainder = remainder.split(surface).join(" ");
    }
  }
  for (const stem of stems(remainder)) {
    const canon = SURFACE_TO_CANON.get(stem);
    if (canon) found.add(canon);
  }
  return found;
}

/**
 * Total/summary columns. These are outputs of a payroll run, not components of
 * it — mapping "Gross Pay" as an earning and "Total Deductions" as a deduction
 * double-counts the whole payroll.
 */
const TOTAL_PATTERNS: readonly RegExp[] = [
  /\bgross\b/,
  /\bnet\b/,
  /\btotal\b/,
  /\btotals\b/,
  /\bsubtotal\b/,
  /\bgrand\b/,
  /\btotaux\b/,
  /\bcumulative\b/,
  /net a payer/,
  /salaire net/,
  /salaire brut/,
  /اجمالي/,
  /المجموع/,
  /الصافي/,
];

/** "Gross Salary Adjustment" is a component, not the gross total. */
const TOTAL_EXCLUSIONS: readonly RegExp[] = [/\badjust/, /\barrear/, /\bcorrection\b/];

export function isTotalColumn(key: string): boolean {
  const text = normalize(key);
  if (!text) return false;
  if (TOTAL_EXCLUSIONS.some((r) => r.test(text))) return false;
  return TOTAL_PATTERNS.some((r) => r.test(text));
}

/** Side markers written as a standalone token rather than a word. */
function hasEmployerToken(text: string): boolean {
  return /\b(er|empr)\b/.test(text);
}

function hasEmployeeToken(text: string): boolean {
  return /\b(ee|empe)\b/.test(text);
}

const TAXABLE_BASE_PHRASES: readonly string[] = [
  "taxable",
  "pre tax",
  "tax base",
  "tax free",
  "non taxable",
];

export interface ClassificationReason {
  category: Category;
  /** Which rule fired, surfaced in the category manager (step 40). */
  rule: string;
  /** The canonical vocabulary that triggered it. */
  matched: string[];
}

/**
 * Classify and explain. The reason is shown in the category manager so a user can
 * see why a component landed where it did rather than guessing.
 */
export function classifyComponentWithReason(key: string): ClassificationReason {
  const text = normalize(key);
  if (!text) return { category: "uncategorised", rule: "empty-key", matched: [] };

  const vocab = vocabulary(text);
  const has = (w: string) => vocab.has(w);
  const matched = [...vocab];

  // 1. Total columns never become components.
  if (isTotalColumn(key)) {
    return { category: "ignore", rule: "total-column", matched: ["total"] };
  }

  // 2. Quantities are not money.
  if (has("days") || has("hours")) {
    const isAbsence = has("absence");
    return {
      category: isAbsence ? "absence_days" : "other_quantity",
      rule: isAbsence ? "quantity-absence" : "quantity",
      matched,
    };
  }

  // 3. A taxable-base or pre-tax column is a reporting basis, neither a tax nor
  //    a salary component. Must precede both the tax and the salary rules.
  if (TAXABLE_BASE_PHRASES.some((p) => text.includes(p))) {
    return { category: "uncategorised", rule: "taxable-base", matched };
  }

  // 4. Employer side, before employee social security so "NSSF ER" is employer.
  //    Only fires with a social/insurance/levy signal: "Company bonus" is a bonus,
  //    not an employer cost.
  const employerSide = has("employer") || hasEmployerToken(text);
  const employeeSide = has("employee") || hasEmployeeToken(text);
  if (employerSide && !employeeSide) {
    if (has("social") || has("insurance")) {
      return { category: "social_security_employer", rule: "employer-social", matched };
    }
    if (has("levy")) {
      return { category: "other_employer_cost", rule: "employer-levy", matched };
    }
  }

  // 5. Absence money (an unpaid-leave deduction, not a levy).
  if (has("absence")) {
    return { category: "absence_deduction", rule: "absence-money", matched };
  }

  // 6. Income tax.
  if (has("tax")) {
    return { category: "income_tax", rule: "tax", matched };
  }

  // 7. Employee social security, then employee-side insurance.
  if (has("social")) {
    return { category: "social_security_employee", rule: "employee-social", matched };
  }
  if (has("insurance")) {
    // Health insurance withheld from the employee is a deduction, not a levy.
    return { category: "other_deduction", rule: "employee-insurance", matched };
  }

  // 8. Variable earnings.
  if (has("overtime")) return { category: "overtime", rule: "overtime", matched };
  if (has("bonus")) return { category: "bonus_commission", rule: "bonus", matched };

  // 9. Allowances, including named ones ("Transportation", "Housing", "Per diem").
  if (has("allowance") || has("housing") || has("transport") || has("meal")) {
    return { category: "allowance", rule: "allowance", matched };
  }

  // 10. Explicit base salary ("Base Salary", "Basic", "basic pay").
  if (has("base")) {
    return { category: "base_salary", rule: "base", matched };
  }

  // 11. Deductions, before the bare-salary rule: "Wage advance" is a deduction
  //     even though it contains a salary word.
  if (has("deduction") || has("loan") || has("garnishment") || has("union")) {
    return { category: "other_deduction", rule: "other-deduction", matched };
  }

  // 12. A bare salary/pay/wage header is the base pay column in practice. This is
  //     the single biggest source of v1's misses.
  if (has("salary")) {
    return { category: "base_salary", rule: "salary-bare", matched };
  }

  // A levy with no side marker is an employer cost in practice.
  if (has("levy")) {
    return { category: "other_employer_cost", rule: "levy-unmarked", matched };
  }

  return { category: "uncategorised", rule: "no-match", matched };
}

export function classifyComponent(key: string): Category {
  return classifyComponentWithReason(key).category;
}
