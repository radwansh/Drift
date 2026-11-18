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
 * `docs/AU_PAYROLL_SPEC.md` added the Australian vocabulary, and section 9.1 of
 * it lists what this file got wrong on a correct Australian register: every
 * `Salary Sacrifice` variant read as base salary, every leave and leave-loading
 * column read as an absence *deduction* (so each dollar moved twice — off the
 * earnings side and onto the deduction side), `Payroll Tax` and
 * `Fringe Benefits Tax` read as the employee's income tax, `Tax Exempt
 * Earnings` read as a tax, `Social Club` read as employee social security —
 * which does not exist in Australia — `Ordinary Hours` read as a quantity when
 * on a pay-item export it is the largest money column on the register, and
 * `Super`, `PAYG`, `STSL`, `SG`, `ETP`, `Lump Sum A` and twelve more not
 * recognised at all. Six arithmetically correct fixtures in `samples/au/` were
 * refused by `reconcileRegister` because of it.
 *
 * The vocabulary is **not** gated on the company being Australian (spec 1.1):
 * `Superannuation`, `PAYG Withholding`, `Annual Leave Loading` and `STSL` are
 * not words a French, Lebanese or Gulf register carries, so a country gate in
 * front of them buys nothing and adds a gate that can be wrong — and the proxy
 * for "is this company Australian" is the currency, which an Australian company
 * that never touched the setting has as `USD`. Only the Payday Super check is
 * gated; see `src/au/`.
 *
 * Rule order matters and is load-bearing:
 *   1.  total columns        never a component; mapping them double-counts
 *   1b. text columns         a cost centre code or a fund USI would store as 0.00
 *   1c. date columns         `Pay Period Start` stored 0.00 against every head
 *   1d. aggregate columns    `Taxable Earnings` is half of gross, not a component
 *   2.  superannuation       before every salary, sacrifice and levy rule
 *   2b. salary sacrifice     before bare "salary": the marker is `sacrifice`
 *   2c. ordinary earnings    before quantities: `Ordinary Hours` is money
 *   3.  quantities           days/hours are not money
 *   3b. FTE                  a count, but only when the header is nothing else
 *   4.  taxable-base guard   "Taxable Salary" is a base, not a tax or a salary
 *   5.  employer side        before employee social, so "NSSF ER" lands right
 *   5b. employer taxes       before income tax, so `Payroll Tax` is not the
 *                            employee's tax and `Fringe Benefits Tax` is not a
 *                            benefit
 *   6.  termination pay      before absence, loading and bare salary: unused
 *                            leave, an ETP and a redundancy are earnings
 *   6b. one-off earnings     before absence and bare salary: a payout is pay,
 *                            and retro pay is not a permanent raise
 *   6c. employer provisions  before allowance and bonus: an EOSB accrual is a
 *                            cost of employing, not something anyone was paid
 *   7.  leave taken          before absence: paid leave is pay for ordinary
 *                            hours, and a loading is never a deduction
 *   8.  absence              before tax, so "Unpaid Leave" is not read as a levy
 *   9.  income tax
 *   10. employee social security, then employee insurance
 *   11. variable earnings    overtime, bonus — an explicit allowance wins
 *   12. allowances
 *   13. directors' fees
 *   14. explicit base salary
 *   15. deductions           before bare "salary", so "Wage advance" is a deduction
 *   16. bare salary
 */

/** Strip accents, fold separators, lowercase. Arabic script is left intact. */
function normalize(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[_‑‒–—-]/g, " ")
    // The apostrophe goes the same way as the other punctuation: `Director's
    // Fees` and `Worker's Compensation` are the same headers as `Directors
    // Fees` and `Workers Compensation`, and leaving it in made `director s`
    // a token the vocabulary could never match. `normaliseHeader` in
    // `ingest.ts` has always stripped it, which is why role rules handled
    // `Date d'entrée` and this did not.
    .replace(/['’`]/g, " ")
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
    "absence", "absences", "absent", "leave", "leaves", "lateness", "late",
    "conge", "maladie", "maladies",
    "غياب", "اجازة",
  ],
  /**
   * Unpaid absence, split out of `absence` so paid leave can be told from it.
   *
   * `leave` alone cannot decide: `Annual Leave` is pay for ordinary hours and
   * `Unpaid Leave` is a deduction. These are the words that settle it, and the
   * rule that needs them is rule 7. Surfaces live in exactly one group —
   * `SURFACE_TO_CANON` is a map, so a surface listed twice silently belongs
   * only to whichever group was declared last.
   */
  unpaid: [
    "unpaid", "lwop", "no pay", "nopay", "without pay",
    "sans solde", "absent sans solde",
  ],
  /**
   * The kinds of leave that are *taken and paid* (spec 5.2). Only meaningful
   * next to an `absence` word, so "Annual Bonus" is untouched.
   */
  leave_type: [
    "annual", "holiday", "holidays", "personal", "carer", "carers",
    "compassionate", "bereavement", "long service", "lsl", "sick",
  ],
  /**
   * Leave whose payments regulation 12 of the Payday Superannuation
   * Regulations 2026 puts outside qualifying earnings: parental leave, and
   * community service or ADF service the employer pays. Still an earning —
   * only the super base differs, which `src/au/qualifying-earnings.ts` reads.
   */
  leave_excluded: [
    "parental", "maternity", "paternity", "adoption",
    "community service", "jury", "defence", "adf",
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
    // Australia. PAYG withholding is the employee's income tax withheld at
    // source; STSL and its predecessors are withheld as part of the same
    // amount and are not a separate levy (spec 5.2). `PAYG` and `PAYGW` alone
    // matched nothing, and on an Employment Hero export `PAYG` is the entire
    // withholding column.
    "payg", "paygw", "payg w", "paygwh", "payg withheld",
    "stsl", "help", "hecs", "hecs help", "sfss", "trsl", "ssl", "abstudy ssl",
    "study and training support loan", "student loan",
  ],
  /**
   * Employer taxes and premiums, which sit outside gross.
   *
   * Ahead of the tax rule, because `tax` as a word claimed all of these:
   * `Payroll Tax` is a state tax on the employer's wage bill and was read as
   * the employee's income tax, so net was understated by the whole amount, and
   * `Fringe Benefits Tax` was read the same way (spec 6.8). Multi-word
   * surfaces are consumed before single words are stemmed, so matching
   * "fringe benefits tax" also removes the `benefits` that would otherwise
   * reach the allowance rule.
   */
  employer_tax: [
    "payroll tax", "state payroll tax",
    "fbt", "fringe benefits tax", "fringe benefit tax",
    "workcover", "work cover",
    "workers compensation", "worker s compensation", "workers comp",
    "portable long service", "plsl", "long service levy",
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
  /**
   * Australian ordinary time earnings, which is money even when the header
   * says "hours".
   *
   * `Ordinary Hours` is Xero's standard AU earnings-rate name and is the money
   * column on a pay-item export. Read as a quantity it dropped the largest
   * earning on the register out of both reconciliation identities, and 7 of 7
   * rows breached (spec 9.1, 6.8). The word `ordinary` is the signal the
   * quantity rule lacked.
   */
  ordinary: ["ordinary", "ordinaries", "ote", "ordinary time earnings"],
  /**
   * Loadings and penalty rates: casual, shift and leave loading, and higher
   * duties. Never a deduction, in any register (spec 6.8).
   *
   * `penalties` on its own is deliberately **not** here. The spec lists it,
   * but outside Australia a bare `Penalties` column is more often a fine than
   * a weekend premium, and this vocabulary is global. Only the phrase is
   * claimed.
   */
  loading: ["loading", "loadings", "penalty rate", "penalty rates", "higher duties", "higher duty"],
  /**
   * Australian superannuation, in every spelling. `super` matches as a whole
   * token only — the stemmer never splits a word — so `Supervisor Allowance`,
   * `Supervision Allowance` and `Superintendent Allowance` are untouched. A
   * substring match would move an allowance from inside gross to the employer
   * side, which lowers gross and raises the on-cost rate at once (spec 6.8).
   *
   * The employer-side marker is **not** required: a bare `Superannuation`
   * column on a register is the guarantee, because the employee side of
   * Australian super is a deduction and is always named as a sacrifice or a
   * voluntary contribution (spec 6.1).
   */
  super: [
    "super", "supers", "superannuation", "superannuations", "superann",
    "sg", "sgc", "super guarantee", "superannuation guarantee", "super guarantee sg",
    "compulsory super", "ote super", "qe super",
  ],
  /** Salary sacrifice. The marker word is `sacrifice`, never `salary`. */
  sacrifice: ["sacrifice", "sacrifices", "sacrificed"],
  /**
   * Sacrifice that is **not** to superannuation — STP Phase 2 type O rather
   * than type S. Both are pre-tax deductions and the bridge balances either
   * way; only type S is added back into qualifying earnings, so getting this
   * wrong understates the super base silently (spec 6.3, 6.8).
   */
  packaging: ["packaging", "packaged", "novated", "novated lease", "device", "devices"],
  /**
   * Super beyond the guarantee. Employer additional, productivity, redundancy
   * and spouse contributions are an employer cost but **not** the guarantee,
   * so they must not count toward the 12%; a member voluntary contribution is
   * an employee deduction. The employer/employee marker decides which.
   */
  extra_contribution: [
    "additional", "voluntary", "productivity", "spouse", "co contribution", "member voluntary",
  ],
  /** Board and executive-body fees: qualifying earnings under s 10A(1)(c). */
  director: ["director", "directors", "board fee", "board fees", "executive body"],
  salary: [
    "salary", "salaries", "wage", "wages", "pay", "salaire", "paie",
    "rateb", "ratib", "raatib",
    "راتب", "الراتب", "اجر",
  ],
  // --- one-off earnings: money owed for an earlier period ---
  one_off: [
    "retro", "retros", "retroactive", "back pay", "backpay", "arrears", "arrear",
    "rappel", "rappels",
  ],
  /**
   * Money paid because the employment ended. An earning — it is paid to the
   * employee and sits inside gross — and **never** qualifying earnings, which
   * is the whole reason it has a group of its own rather than sharing
   * `one_off` (spec 5.2): `samples/au/`'s AU-0006 has a 4,120.00 gross of
   * which 1,880.00 is a termination payout, so a gross-based super test reads
   * 6.52% against a correct 12% and looks like fraud (spec 7.7).
   *
   * `termination` also names a *date* column, which `ingest.ts` claims first;
   * see the money-word veto there.
   */
  termination_pay: [
    "severance", "notice", "payout", "payouts", "encashment", "in lieu",
    "termination", "terminations", "terminated", "redundancy", "redundancies",
    "unused", "etp", "pilon", "employment termination payment",
    "lump sum", "lump sum a", "lump sum b", "lump sum d", "lump sum e", "lump sum w",
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
  garnishment: [
    "garnishment", "garnish", "garnishee", "attachment", "saisie", "fine", "fines",
    // Named as the thing, not as the word "Deduction": the same 180.00 landed
    // on opposite sides of the bridge depending on whether MYOB printed
    // `Child Support` or Xero printed `Child Support Deduction` (spec 6.8).
    "child support",
  ],
  union: ["union", "syndicat", "نقابة"],
  /**
   * A social club subscription is a post-tax deduction. It was reaching
   * `social_security_employee` on the word `social`, and there is no employee
   * social security in Australia at all, so that match is wrong by
   * construction on an AU register (spec 6.8). Matching the phrase consumes
   * the `social` with it.
   */
  club: ["club", "clubs", "social club", "sports club", "staff club"],
  levy: ["levy", "levies", "fund", "funds", "scheme", "schemes", "contribution", "contributions", "training", "formation"],
  /**
   * The employer's own cost lines, as a report heads them: `Employer
   * Liabilities`, `Employer Expenses`, `Employer On Costs` (spec 6.5). Only
   * ever read next to an employer marker, which is what keeps
   * `samples/2025`'s deliberately unplaced `Expense Reimbursement` unplaced.
   */
  burden: [
    "liability", "liabilities", "expense", "expenses",
    "on cost", "on costs", "oncost", "oncosts",
  ],
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
  // Australian registers carry a block of fund and account identifiers next to
  // the super amounts. `Super Fund Name` was `other_employer_cost` — the word
  // `fund` reached the levy group — so a text column was stored as 0.00 per
  // head on the employer line. These must be tested before the super rule,
  // which would otherwise claim every one of them (spec 6.8).
  /\bsuper(annuation)? fund\b/,
  /\bfund (name|usi|number|no)\b/,
  /\busi\b/,
  /\bspin\b/,
  /\bmember (number|no|id)\b/,
  /\babn\b/,
  /\btfn\b/,
  /\bbsb\b/,
  /\baccount (number|no|name)\b/,
  /\bpayslip (number|no|id)\b/,
];

/**
 * Columns that hold a date.
 *
 * The upload writes a component as `Number(val) || 0`, so `Pay Period Start`
 * classified as `base_salary` — which is what the bare-salary rule did to it —
 * stored **0.00 against every employee** and then sat in the gross-to-net
 * bridge as base pay (spec 9.1). A date is not money, and it is not merely
 * uncategorised either, because `uncategorised` money counts toward gross.
 *
 * This also keeps the termination-pay rule honest: `Termination Date` is a
 * date and `Employment Termination Payment` is money, and they share a word.
 */
const IGNORE_DATE_PATTERNS: readonly RegExp[] = [
  /\bdates?\b/,
  /\bpay period\b/,
  /\bperiod (start|end|from|to)\b/,
];

/**
 * Disaggregations of a total, and reporting-only figures.
 *
 * Not components, and `ignore` rather than `uncategorised` because
 * `uncategorised` is carried on the earnings side: Employment Hero's
 * `Taxable Earnings` and `Tax Exempt Earnings` are the two halves of gross, so
 * counting either toward identity 1 double-counts the register (spec 6.7).
 *
 * `RESC` is the case worth stating. It is not extra money — it is a reporting
 * figure for the employee's income statement covering super the employee can
 * influence, so on an ordinary register it is the **same dollars** as the
 * salary-sacrifice column. As an employer cost it double-counts the on-cost
 * rate; as a deduction it double-counts the deduction side. `ignore` is the
 * only answer that leaves the bridge intact (spec 5.3).
 */
const IGNORE_AGGREGATE_PATTERNS: readonly RegExp[] = [
  /\btaxable earnings?\b/,
  /\btax exempt earnings?\b/,
  /\btake home\b/,
  /\bresc\b/,
  /\breportable (employer )?super/,
];

/**
 * Which sacrifice this is: to superannuation, or to something else.
 *
 * The category is `other_deduction` either way and the bridge balances either
 * way, which is exactly why this has to be decided by a rule name rather than
 * left to the category — only the superannuation one is added back into
 * qualifying earnings, so getting it wrong understates the super base and
 * nothing in the reconciliation notices (spec 5.4, 6.3).
 *
 * The default is superannuation. `Salary Sacrifice` unqualified is MYOB's own
 * category name for the super one, and STP Phase 2 reports it as type S;
 * the non-super kinds are named — "(other)", a novated lease, a packaged
 * device.
 */
function sacrificeRule(text: string, has: (w: string) => boolean): string {
  if (has("super")) return "au-salary-sacrifice-super";
  if (has("packaging") || /\bother\b/.test(text)) return "au-salary-sacrifice-other";
  return "au-salary-sacrifice-super";
}

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
  "pretax",
  // Employment Hero's `Post Tax Deductions` was reaching the tax rule, so
  // post-tax employee deductions landed on the statutory income-tax line
  // (spec 9.1).
  "post tax",
  "posttax",
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

  // 1c. Date columns, for the same reason: `Number(val) || 0` is 0.00.
  if (IGNORE_DATE_PATTERNS.some((r) => r.test(text))) {
    return { category: "ignore", rule: "date-column", matched };
  }

  // 1d. Disaggregations of a total and reporting-only figures.
  if (IGNORE_AGGREGATE_PATTERNS.some((r) => r.test(text))) {
    return { category: "ignore", rule: "aggregate-column", matched };
  }

  const employerSide = has("employer") || hasEmployerToken(text);
  const employeeSide = has("employee") || hasEmployeeToken(text);
  const preOrPostTax = TAXABLE_BASE_PHRASES.some((p) => text.includes(p));

  // 2. Australian superannuation, in all of its shapes — before the salary,
  //    sacrifice, levy and tax rules, every one of which claimed part of it.
  //
  //    The order inside matters as much as the order outside:
  //      - the guarantee *charge* is a penalty payable to the ATO, not a
  //        contribution, and must never count toward the 12% (spec 6.8);
  //      - a sacrifice is an employee deduction, not the employer's cost;
  //      - `Employer Additional Superannuation` is an employer cost that is
  //        **not** the guarantee, so `samples/au/`'s 50.00 enterprise-agreement
  //        contribution does not inflate the 12% check's actual figure.
  if (has("super")) {
    if (/\b(charge|charges|penalty|penalties)\b/.test(text)) {
      return { category: "other_employer_cost", rule: "au-super-charge", matched };
    }
    if (has("sacrifice") || has("packaging")) {
      return { category: "other_deduction", rule: sacrificeRule(text, has), matched };
    }
    if (employeeSide || has("club")) {
      return { category: "other_deduction", rule: "au-employee-super", matched };
    }
    if (has("extra_contribution")) {
      return {
        category: "other_employer_cost",
        rule: "au-employer-super-additional",
        matched,
      };
    }
    // A pre-tax super column with no `sacrifice` word is a sacrifice by
    // another name, and it is the employee's money either way (spec 6.2).
    if (preOrPostTax) {
      return { category: "other_deduction", rule: "au-salary-sacrifice-super", matched };
    }
    return { category: "social_security_employer", rule: "au-employer-super", matched };
  }

  // 2b. Salary sacrifice with no super word on the header. `Salary Sacrifice`
  //     is MYOB's own category name for the superannuation one, and the
  //     bare-salary rule read every variant of it as **base salary** — so the
  //     deduction was added to earnings and never subtracted from net, and
  //     AU-0001 was out by 500.00 on both identities (spec 9.1).
  if (has("sacrifice") || has("packaging")) {
    return { category: "other_deduction", rule: sacrificeRule(text, has), matched };
  }

  // 2c. Ordinary time earnings, before the quantity rule.
  if (has("ordinary")) {
    return { category: "base_salary", rule: "au-ordinary-earnings", matched };
  }

  // 3. Quantities are not money.
  if (has("days") || has("hours")) {
    const isAbsence = has("absence");
    return {
      category: isAbsence ? "absence_days" : "other_quantity",
      rule: isAbsence ? "quantity-absence" : "quantity",
      matched,
    };
  }

  // 3b. An FTE column is a headcount quantity, and it unblocks cost per FTE.
  //     Only when it is the whole header: "FTE Salary" is money stated at
  //     full-time equivalent, and reading it as a count would drop it out of
  //     every money category.
  if (has("fte") && vocab.size === 1) {
    return { category: "other_quantity", rule: "quantity-fte", matched };
  }

  // The header names a line of its own, so a modifier word on it — "retro",
  // "unused", "accrued" — is describing that line rather than moving it.
  // `tax` only counts when it is the tax itself: `ETP Taxable Component` and
  // `ETP Tax Free Component` are the two halves of a termination payment, not
  // withholding, so the pre/post-tax phrase disarms the tax signal.
  const namesAnotherLine =
    has("deduction") || has("loan") || has("social") || (has("tax") && !preOrPostTax);

  // 4. A taxable-base or pre-tax column is a reporting basis, neither a tax nor
  //    a salary component. Must precede both the tax and the salary rules.
  if (preOrPostTax && !has("termination_pay")) {
    // Unless it names a deduction, in which case the basis word is only saying
    // *when* it was taken: `Pre Tax Deductions` and `Post Tax Deductions` are
    // both employee deductions, and reading them as a basis left Employment
    // Hero's 500.00 sacrifice unplaced while the post-tax 204.50 sat on the
    // income-tax line (spec 9.1).
    if (has("deduction")) {
      return { category: "other_deduction", rule: "taxable-base-deduction", matched };
    }
    return { category: "uncategorised", rule: "taxable-base", matched };
  }

  // 5. Employer side, before employee social security so "NSSF ER" is employer.
  //    Only fires with a social/insurance/levy signal: "Company bonus" is a bonus,
  //    not an employer cost.
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
    // `Employer Additional` with no super word on it, and `Employer
    // Liabilities` / `Employer On Costs`. MYOB prints the first and
    // Employment Hero the second, and with no rule for either the column was
    // `uncategorised` — carried toward gross as an unplaced earning.
    if (has("extra_contribution") || has("burden")) {
      return { category: "other_employer_cost", rule: "employer-additional", matched };
    }
  }

  // 5b. Employer taxes and premiums, before the income-tax rule.
  if (has("employer_tax")) {
    return { category: "other_employer_cost", rule: "employer-tax", matched };
  }

  // 6. Termination pay, before absence, loading, allowance and bare salary.
  //    Unused annual leave and its loading, a redundancy, a payment in lieu of
  //    notice and an ETP are all money paid to the employee inside gross — and
  //    none of them is qualifying earnings. The absence rule read the first two
  //    as deductions, which moves each dollar twice (spec 9.1), and the
  //    bare-salary rule read `Unused Holiday Pay` as the run rate.
  //
  //    Same guards as the one-off rule below: a header naming a deduction, a
  //    loan, a statutory contribution or a tax belongs on that line.
  if (!namesAnotherLine && has("termination_pay")) {
    return { category: "other_earning", rule: "termination-pay", matched };
  }

  // 6b. One-off money paid to the employee: retro and back pay, arrears,
  //     French paid leave. An earning, and `other_earning` rather than
  //     `base_salary` because none of it is the run rate.
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
  if (!namesAnotherLine) {
    if (has("paid_leave")) {
      return { category: "other_earning", rule: "paid-leave", matched };
    }
    if (has("one_off")) {
      return { category: "other_earning", rule: "one-off-earning", matched };
    }
  }

  // 6c. Employer provisions and burdens, which belong outside gross.
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

  // 7. Paid leave and loadings, before the absence rule.
  //
  //    This is the largest single defect section 9.1 reports. `Annual Leave`,
  //    `Annual Leave Taken`, `Long Service Leave`, `Personal Leave`,
  //    `Leave Loading` and `Holiday Leave Loading` were every one of them
  //    `absence_deduction`, because the absence vocabulary carries the bare
  //    word `leave`. Each amount then left the earnings side **and** landed on
  //    the deduction side, so every dollar was wrong by two: AU-0006 was out
  //    by 1,880.00 on both identities and AU-0005 by 2,033.65.
  //
  //    Paid leave taken is pay in respect of ordinary hours, so it is
  //    `base_salary` rather than `other_earning` — it is the run rate, taken
  //    as leave instead of worked.
  const unpaidLeave = has("unpaid");
  if (has("loading") && !unpaidLeave && !has("garnishment")) {
    // A loading is never a deduction, in any register (spec 6.8). Leave
    // loading is `other_earning` because it is not the run rate; a casual or
    // shift loading is paid for ordinary hours and is part of it.
    return has("absence")
      ? { category: "other_earning", rule: "leave-loading", matched }
      : { category: "base_salary", rule: "loading", matched };
  }
  if (has("absence") && !unpaidLeave) {
    if (has("leave_excluded")) {
      return { category: "other_earning", rule: "leave-excluded", matched };
    }
    if (has("leave_type")) {
      return { category: "base_salary", rule: "leave-taken", matched };
    }
  }

  // 8. Absence money (an unpaid-leave deduction, not a levy). Insurance wins:
  //    `maladie` joined the absence vocabulary for the bare "Maladie" column,
  //    which shares a word with "Assurance maladie" — French health cover, not
  //    sick leave.
  if ((has("absence") || unpaidLeave) && !has("insurance")) {
    return { category: "absence_deduction", rule: "absence-money", matched };
  }

  // 9. Income tax.
  if (has("tax")) {
    return { category: "income_tax", rule: "tax", matched };
  }

  // 10. Employee social security, then employee-side insurance.
  if (has("social")) {
    return { category: "social_security_employee", rule: "employee-social", matched };
  }
  if (has("insurance")) {
    // Health insurance withheld from the employee is a deduction, not a levy.
    return { category: "other_deduction", rule: "employee-insurance", matched };
  }

  // 11. Variable earnings. An explicit allowance word wins over `overtime`:
  //     `Meal Allowance (Overtime)` is an expense allowance paid because
  //     somebody worked overtime, not an overtime rate (spec 5.2), and reading
  //     it as overtime put it in the one category whose whole purpose is to be
  //     excluded from the super base for a different reason.
  if (has("overtime") && !has("allowance")) {
    return { category: "overtime", rule: "overtime", matched };
  }
  if (has("bonus")) return { category: "bonus_commission", rule: "bonus", matched };

  // 12. Allowances, including named ones ("Transportation", "Housing", "Per diem").
  if (has("allowance") || has("housing") || has("transport") || has("meal")) {
    return { category: "allowance", rule: "allowance", matched };
  }

  // 12b. A contribution beyond the guarantee with no employer marker on it.
  //      After the allowance rule, so "Additional Allowance" is an allowance:
  //      `additional` is a modifier, and claiming it earlier would move any
  //      column that merely says "more of this" onto the employer line.
  //      `voluntary` and `member` are the employee's own money (spec 6.8); the
  //      rest — productivity, spouse, redundancy contributions — are the
  //      employer's (spec 5.2, 6.5).
  if (has("extra_contribution")) {
    return /\b(voluntary|member)\b/.test(text)
      ? { category: "other_deduction", rule: "employee-contribution", matched }
      : { category: "other_employer_cost", rule: "employer-additional", matched };
  }

  // 13. Directors' and executive-body fees: an earning, and one a register does
  //     carry. Qualifying earnings under s 10A(1)(c), which the brief's
  //     "OTE plus commissions plus sacrifice" summary of the Act would miss.
  if (has("director")) {
    return { category: "other_earning", rule: "director-fee", matched };
  }

  // 14. Explicit base salary ("Base Salary", "Basic", "basic pay").
  if (has("base")) {
    return { category: "base_salary", rule: "base", matched };
  }

  // 15. Deductions, before the bare-salary rule: "Wage advance" is a deduction
  //     even though it contains a salary word.
  if (has("deduction") || has("loan") || has("garnishment") || has("union") || has("club")) {
    return { category: "other_deduction", rule: "other-deduction", matched };
  }

  // 16. A bare salary/pay/wage header is the base pay column in practice. This is
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
