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
 * Step 7 of docs/PAYROLL_AUDIT_FIX_PLAN.md closed the next 22, of 46 real
 * register headers: retro and back pay, arrears, severance, notice and a leave
 * payout (all read as recurring base salary or as an absence deduction);
 * end-of-service, indemnity and gratuity provisions (read as employee
 * earnings inside gross); `Charges patronales`; `Congés payés` and `Maladie`;
 * the six transliterated Arabic headers, of which none was recognised although
 * their Arabic-script forms were; `FTE`; and `Cost Centre`. The architecture
 * was sound — the vocabulary had holes.
 *
 * Rule order matters and is load-bearing:
 *   1.  total columns        never a component; mapping them double-counts
 *   1b. text columns         a cost centre code would store as 0.00
 *   2.  quantities           days/hours are not money
 *   2b. FTE                  a count, but only when the header is nothing else
 *   3.  taxable-base guard   "Taxable Salary" is a base, not a tax or a salary
 *   4.  employer side        before employee social, so "NSSF ER" lands right
 *   4b. one-off earnings     before absence and bare salary: a payout is pay,
 *                            and retro pay is not a permanent raise
 *   4c. employer provisions  before allowance and bonus: an EOSB accrual is a
 *                            cost of employing, not something anyone was paid
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
  fte: ["fte", "ftes", "full time equivalent", "full time equivalents"],
  // --- absence ---
  absence: [
    "absence", "absences", "absent", "leave", "leaves", "unpaid", "lwop", "lateness", "late",
    "no pay", "nopay", "conge", "absent sans solde", "maladie", "maladies",
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
    "daman", "ijtimai", "ijtimaii",
    "ضمان", "تقاعد", "التقاعد",
  ],
  insurance: [
    "insurance", "insurances", "assurance", "mutuelle",
    "takmeen", "tameen", "taameen",
    "تأمين",
  ],
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
    "mukafaa", "mukafa", "mukafaat",
    "مكافأة", "علاوة", "حافز",
  ],
  allowance: [
    "allowance", "allowances", "indemnite", "indemnites", "indemnity", "benefit", "benefits",
    "per diem", "badal", "badl", "badalat", "بدل", "بدلات",
  ],
  housing: ["housing", "accommodation", "rent", "logement", "sakan", "سكن"],
  transport: ["transport", "transportation", "travel", "mileage", "fuel", "deplacement", "naql", "نقل", "مواصلات"],
  meal: ["meal", "meals", "canteen", "repas", "panier", "طعام"],
  base: ["base", "basic", "salaire de base", "fixe", "asasi", "assasi", "اساسي", "الاساسي"],
  salary: [
    "salary", "salaries", "wage", "wages", "pay", "salaire", "paie",
    "rateb", "ratib", "raatib",
    "راتب", "الراتب", "اجر",
  ],
  // --- one-off earnings: money owed for an earlier period, or on leaving ---
  one_off: [
    "retro", "retros", "retroactive", "back pay", "backpay", "arrears", "arrear",
    "rappel", "rappels", "severance", "notice", "payout", "payouts", "encashment", "in lieu",
  ],
  /** French paid leave: an earning, unlike every other `conge` form. */
  paid_leave: ["conges payes", "conge paye"],
  // --- employer provisions and burdens ---
  end_of_service: ["end of service", "eosb", "fin de service"],
  provision: ["provision", "provisions", "accrual", "accruals", "accrued"],
  /** The French employer burden, which carries both signals in one phrase. */
  employer_burden: ["charges patronales", "charge patronale"],
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

/**
 * Columns that hold text rather than money or a count.
 *
 * `ignore`, not `uncategorised`: the upload writes every mapped component as
 * `Number(val) || 0`, so a cost centre code becomes 0.00 for every employee —
 * a figure that then sits in the bridge, and a zero-valued component for the
 * anomaly detector to flag per head. Dimension columns belong to step 9, which
 * gives them somewhere to live; until then they are kept out of the money.
 */
const IGNORE_TEXT_PATTERNS: readonly RegExp[] = [
  /\bcost cent(re|er)\b/,
  /\bcostcent(re|er)\b/,
];

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

/**
 * A column the vocabulary cannot place, with the question to put to the user.
 *
 * Step 11. Some words mean different things on different registers, and no
 * synonym table settles that from the header alone. `Maladie` on a French
 * bulletin is usually the sick-absence deduction and sometimes the
 * health-insurance cotisation — and being right more often than not is the
 * problem, because a confident wrong answer is indistinguishable from a
 * confident right one.
 *
 * Note what the two readings of `Maladie` have in common: both are employee
 * deductions, so the bridge balances either way. The fix plan's first wording
 * said ambiguity mattered when candidates fell on "different sides of the
 * bridge", which would not have caught this case at all. What matters is that
 * the candidates are **reported separately** — one belongs in the absences
 * report and its percentage of gross, the other on the statutory line and in
 * the on-cost rate. It reconciles perfectly and misstates two reports.
 */
export interface AmbiguityNote {
  /** The categories it could reasonably be, for the user to choose between. */
  candidates: Category[];
  /** Specific enough that the user is not doing the classifier's thinking. */
  question: string;
}

interface AmbiguityRule {
  /** Words in the normalised header, any one of which raises the question. */
  readonly words: readonly string[];
  /**
   * Words that settle it. Only list a word where the rule cascade below
   * already reaches the right answer — a resolver silences the question and
   * hands the decision back to the cascade, so resolving to a wrong answer is
   * worse than asking.
   */
  readonly resolvedBy: readonly string[];
  readonly candidates: readonly Category[];
  readonly question: string;
}

/**
 * Deliberately a short, declared list rather than a heuristic over the rule
 * cascade. A classifier that asks about everything is as useless as one that
 * guesses, and an explicit table cannot flood the user or regress a header
 * that already classified confidently. It grows as real registers meet it,
 * the same way the synonym table does.
 */
const AMBIGUITIES: readonly AmbiguityRule[] = [
  {
    words: ["maladie", "maladies"],
    // `assurance`/`mutuelle` reach employee insurance through rule 7, a day or
    // hour count reaches a quantity through rule 2, and `sans solde` is
    // unambiguously unpaid absence. `cotisation` is NOT a resolver: it implies
    // a contribution, but the cascade would still answer absence, so silencing
    // the question there would bank the wrong answer.
    resolvedBy: ["assurance", "mutuelle", "jours", "jour", "days", "day", "sans solde", "heures"],
    // The two the engine would actually produce: `Assurance maladie` resolves
    // to `other_deduction`, which is where employee insurance goes here, not
    // to the statutory line. Offering a category the engine does not use for
    // insurance would be a worse question than no question.
    candidates: ["absence_deduction", "other_deduction"],
    question:
      'can be a sick-leave deduction or a health-insurance contribution. Both reduce net pay, ' +
      "so the totals balance either way, but one belongs in the absences report and the other " +
      "on the statutory line. Which is it on this register?",
  },
];

/**
 * The question a header raises, or undefined when the vocabulary can place it.
 *
 * Exported so a caller can ask without classifying, and so the suppression for
 * an already-answered column lives with the override rather than in here.
 */
export function ambiguityFor(key: string): AmbiguityNote | undefined {
  const text = normalize(key);
  if (!text) return undefined;

  const words = new Set(text.split(/\s+/).filter(Boolean));
  const present = (w: string) => (w.includes(" ") ? text.includes(w) : words.has(w));

  for (const rule of AMBIGUITIES) {
    if (!rule.words.some(present)) continue;
    if (rule.resolvedBy.some(present)) continue;
    return { candidates: [...rule.candidates], question: rule.question };
  }
  return undefined;
}

/** One column still waiting for an answer, with the question to put. */
export interface OpenQuestion extends AmbiguityNote {
  componentKey: string;
}

/**
 * Step 11b: which of these columns raise a question nobody has answered.
 *
 * `answered` is the company's saved categories — the same `component_categories`
 * rows the annual engine reads as `savedCategories`. A saved category *is* the
 * answer, so a column that has one is never asked about again, which is the
 * suppression `ambiguityOfFor` applies in `summary.ts`. The rule lives here so
 * the upload wizard and the annual dashboard cannot ask different questions, or
 * one keep asking after the other was answered.
 */
export function openQuestionsFor(
  keys: readonly string[],
  answered: Readonly<Record<string, Category>> = {},
): OpenQuestion[] {
  const seen = new Set<string>();
  const questions: OpenQuestion[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (answered[key]) continue;
    const note = ambiguityFor(key);
    if (note) questions.push({ componentKey: key, ...note });
  }
  return questions;
}

export interface ClassificationReason {
  category: Category;
  /** Which rule fired, surfaced in the category manager (step 40). */
  rule: string;
  /** The canonical vocabulary that triggered it. */
  matched: string[];
  /**
   * Set when the vocabulary cannot place the column and the user has to say.
   * The category is then `uncategorised`, which routes the money into the
   * balancing lines where it is visibly unreconciled — an honest gap rather
   * than a precise error on the wrong line.
   */
  ambiguity?: AmbiguityNote;
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

  // Before the cascade, because the cascade's job is to answer and this is the
  // case where answering is the mistake. An override set by the user never
  // reaches here — `resolveFor` in summary.ts short-circuits it — so a column
  // that has been decided is not asked about twice.
  const ambiguity = ambiguityFor(key);
  if (ambiguity) {
    return { category: "uncategorised", rule: "ambiguous", matched, ambiguity };
  }

  // 1. Total columns never become components.
  if (isTotalColumn(key)) {
    return { category: "ignore", rule: "total-column", matched: ["total"] };
  }

  // 1b. Text columns, which are not money and not merely uncategorised: the
  //     upload stores a component as `Number(val) || 0`, so a cost centre code
  //     lands as 0.00 against every employee — a real figure in the bridge, and
  //     one zero-valued component per head for the anomaly detector to flag.
  if (IGNORE_TEXT_PATTERNS.some((r) => r.test(text))) {
    return { category: "ignore", rule: "text-column", matched };
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

  // 2b. An FTE column is a headcount quantity, and it unblocks cost per FTE.
  //     Only when it is the whole header: "FTE Salary" is money stated at
  //     full-time equivalent, and reading it as a count would drop it out of
  //     every money category.
  if (has("fte") && vocab.size === 1) {
    return { category: "other_quantity", rule: "quantity-fte", matched };
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
    // "social" already resolves pension, provident, retirement, NSSF and GOSI
    // through the synonym group, so a statutory employer contribution matches
    // here under any of its names.
    if (has("social")) {
      return { category: "social_security_employer", rule: "employer-social", matched };
    }
    // Employer insurance with no social-security signal is private cover: a
    // genuine employer cost, but not a statutory contribution. It used to match
    // the rule above, which overstated the statutory line and the employer
    // on-cost rate — so anyone reconciling to a social security filing was out
    // by the whole medical premium.
    if (has("insurance")) {
      return { category: "other_employer_cost", rule: "employer-insurance", matched };
    }
    if (has("levy")) {
      return { category: "other_employer_cost", rule: "employer-levy", matched };
    }
  }

  // 4b. One-off money paid to the employee: retro and back pay, arrears, a
  //     severance or notice payment, a leave payout, French paid leave. An
  //     earning, and `other_earning` rather than `base_salary` because none of
  //     it is the run rate.
  //
  //     Ahead of three rules that each took one of these the wrong way:
  //       - the bare-salary rule read "Retro Pay" as base salary, so a one-off
  //         became permanent and the forecast carried it into every remaining
  //         period of the year;
  //       - the absence rule read "Accrued Leave Payout" as a deduction, which
  //         books money paid *to* the employee against pay and absolute-values
  //         it, moving the bridge the wrong way on both sides;
  //       - the provision rule below would read the same column as an employer
  //         accrual, and a payout is the opposite of an accrual.
  //
  //     Skipped when the header also names a deduction, a loan, a statutory
  //     contribution or a tax, so "Loan Arrears" stays a deduction and a
  //     "Rappel de cotisation" stays on the social security line rather than
  //     becoming an earning. A retro that names a line belongs on that line.
  if (!has("deduction") && !has("loan") && !has("social") && !has("tax")) {
    if (has("paid_leave")) {
      return { category: "other_earning", rule: "paid-leave", matched };
    }
    if (has("one_off")) {
      return { category: "other_earning", rule: "one-off-earning", matched };
    }
  }

  // 4c. Employer provisions and burdens, which belong outside gross.
  //     End-of-service benefit, indemnity and gratuity accruals are a
  //     top-three employer cost across the GCC and Lebanon, and they were
  //     landing inside gross as an allowance or a bonus — so gross, the
  //     net-to-gross bridge and the employer on-cost rate were wrong at once.
  //     Only an accrual or a provision qualifies: a bare "Gratuity" is pay.
  if (has("employer_burden")) {
    return { category: "other_employer_cost", rule: "employer-burden", matched };
  }
  if (has("end_of_service") || has("provision")) {
    return { category: "other_employer_cost", rule: "employer-provision", matched };
  }

  // 5. Absence money (an unpaid-leave deduction, not a levy). Insurance wins:
  //    `maladie` joined the absence vocabulary for the bare "Maladie" column,
  //    which shares a word with "Assurance maladie" — French health cover, not
  //    sick leave.
  if (has("absence") && !has("insurance")) {
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
