import { classifyComponentWithReason } from "../annual/classify";
import {
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  type Category,
} from "../annual/types";
import { roundToMinorUnits, DEFAULT_MINOR_UNITS } from "../money";

/**
 * Qualifying earnings — the base the 12% applies to from 1 July 2026.
 *
 * Section 10A of the *Superannuation Guarantee (Administration) Act 1992*,
 * inserted by the *Treasury Laws Amendment (Payday Superannuation) Act 2025*.
 * It replaced ordinary time earnings and "salary or wages" as the single
 * earnings base, and it is **not** gross:
 *
 *   10A(1)(a)  ordinary time earnings
 *   10A(1)(b)  all commissions — all of them, even for work wholly outside
 *              ordinary hours, which is the asymmetry that makes commission
 *              different from overtime
 *   10A(1)(c)  payments for duties as a member of the executive body —
 *              directors' fees
 *   10A(1)(d)  payments under a labour-only contract, s 12(3)
 *   10A(1)(e)  parliamentary remuneration
 *   10A(1)(f)  payments for work referred to in s 12(8)
 *   10A(1)(g)  remuneration in the s 12(9) or (10) circumstances
 *   10A(1)(h)  **salary sacrifice**: the reductions the employee agreed to in
 *              return for the employer making a super contribution
 *   10A(2)     an amount covered by more than one paragraph is counted once
 *   10A(3)(a)  a payment reversing a sacrificed contribution is out
 *   10A(3)(b)  and whatever the regulations exclude
 *
 * Out: overtime where ordinary hours are identifiable, expense allowances and
 * fringe benefits, and every termination payment — unused leave and its
 * loading, redundancy, payment in lieu of notice and an ETP.
 *
 * **Why the base is never gross**, made concrete by `samples/au/`: employer
 * super is 10.92% of gross in period 1 and 11.65% in period 2 and the employer
 * is exactly compliant in both, and per employee gross is wrong in both
 * directions at once. AU-0002's super is 10.64% of gross and exactly 12% of
 * qualifying earnings, the gap being overtime and an overtime meal allowance.
 * AU-0006's is 6.52% of gross and exactly 12% of qualifying earnings, the gap
 * being a termination payout — far enough out to look like fraud. And where
 * earnings are stated net of a sacrifice, gross *understates* the base, so a
 * gross-based test clears an employer who is short.
 *
 * Three things are **not** inputs here: `gross`, `net`, and the annual engine's
 * `other_earnings_balance` line. The base is built from classified components
 * and nothing else.
 */

/** What one component contributes to the base. */
export type QeTreatment =
  /** Inside qualifying earnings. */
  | "in"
  /** Outside it — overtime, a termination payment, an employer cost, a deduction. */
  | "out"
  /**
   * The register cannot say, and the law or the header leaves it open. Carried
   * **in** the headline base (spec 5.5) and reported, with the verdict
   * suppressed where excluding it would change the answer.
   */
  | "uncertain"
  /**
   * Money the classifier has not placed. Not merely absent from the base — it
   * makes the base **incomplete**, which is a different answer from a
   * shortfall (spec 7.6).
   */
  | "unplaced";

export interface QeComponentTreatment {
  key: string;
  category: Category;
  /** The classifier rule, which is what the treatment is decided from. */
  rule: string;
  treatment: QeTreatment;
  /** Why, in words, for the audit trail. */
  reason: string;
}

const EARNINGS = new Set<Category>(EARNING_CATEGORIES);
const DEDUCTIONS = new Set<Category>(EMPLOYEE_DEDUCTION_CATEGORIES);

/** The rule that marks a sacrifice to superannuation — s 10A(1)(h)'s subject. */
export const SACRIFICE_SUPER_RULE = "au-salary-sacrifice-super";
/** The rule that marks the employer's guarantee contribution. */
export const EMPLOYER_SUPER_RULE = "au-employer-super";

/**
 * Allowances an Australian register names that are **not** ordinary time
 * earnings: an expense allowance, or one paid because somebody worked
 * overtime. A meal allowance is the common case, and `samples/au/` carries it
 * as 32.50 for AU-0002 under two different headings.
 */
const ALLOWANCE_OUT = /\b(meal|meals|expense|expenses|reimburse\w*|overtime|ot)\b/;

/**
 * Allowances whose status turns on a fact the header does not carry: a true
 * expense reimbursement is out, a flat non-accountable allowance is in, and
 * nothing in `Travel Allowance` says which (spec 5.2).
 */
const ALLOWANCE_UNCERTAIN = /\b(travel|transport\w*|mileage|motor|vehicle|car|km|fuel|kilometre|kilometer)\b/;

function normalise(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * How one component is treated, from its classification.
 *
 * **It reads the classifier's rule name, not just the category** (spec 5.4).
 * That is deliberate and it is the reason Australia needs no sixteenth
 * `Category`: `other_deduction` covers a sacrifice to super, a novated lease
 * and a union fee, and only the first is added back under 10A(1)(h). A
 * sixteenth category would push a country-specific concept into a type the
 * French, Lebanese and Gulf engines share and give every `Record<Category, …>`
 * in the repo a member that is meaningless for fourteen-fifteenths of
 * customers.
 *
 * A saved category from `component_categories` still wins on the **category**,
 * and the rule stays visible — so an admin who moves a column off the earnings
 * side takes it out of the base, which is what they asked for.
 */
export function qeTreatmentFor(
  key: string,
  answered: Readonly<Record<string, Category>> = {},
): QeComponentTreatment {
  const reason = classifyComponentWithReason(key);
  const override = answered[key];
  const category = override ?? reason.category;
  const rule = reason.rule;
  const text = normalise(key);
  const at = (treatment: QeTreatment, why: string): QeComponentTreatment => ({
    key,
    category,
    rule,
    treatment,
    reason: why,
  });

  // s 10A(1)(h). The amount is a deduction on the register, so it is not an
  // earning — but it is still qualifying earnings, and whether it has to be
  // added back depends on which side of the bridge the register puts it. See
  // `splitSacrifice` below; this only marks it.
  if (rule === SACRIFICE_SUPER_RULE && !override) {
    return at("in", "Salary sacrificed to superannuation is qualifying earnings under s 10A(1)(h).");
  }

  if (category === "uncategorised") {
    return at("unplaced", "Clarivo cannot place this column, so the base is incomplete.");
  }

  if (!EARNINGS.has(category)) {
    if (DEDUCTIONS.has(category)) {
      return at("out", "An employee deduction is not an earning.");
    }
    if (category === "social_security_employer" || category === "other_employer_cost") {
      return at("out", "An employer cost sits outside gross and is not an earning.");
    }
    return at("out", "Not money paid to the employee.");
  }

  if (category === "overtime") {
    return at(
      "out",
      "Overtime is not ordinary time earnings, and no other paragraph of s 10A(1) picks it up.",
    );
  }

  if (rule === "termination-pay") {
    // s 10A(1) reaches none of these, and 5.2 lists each. Lump Sum W is the
    // one the spec marks "to verify" against the final ruling, so it is the
    // one that stays open rather than being decided here.
    if (/\blump sum w\b/.test(text)) {
      return at(
        "uncertain",
        "A Lump Sum W return-to-work payment is read as qualifying earnings, which draft LCR 2026/D1 has not finalised.",
      );
    }
    return at(
      "out",
      "A termination payment — unused leave, redundancy, payment in lieu of notice or an ETP — is not ordinary time earnings.",
    );
  }

  if (rule === "leave-excluded") {
    return at(
      "out",
      "Regulation 12 of the Payday Superannuation Regulations 2026 excludes payments for parental leave, and for community service or ADF service the employer pays.",
    );
  }

  if (rule === "leave-loading") {
    // Spec 5.5. The ATO's position is that annual leave loading is ordinary
    // time earnings *unless* the employer can show it compensates for a lost
    // opportunity to work overtime — and a payroll file cannot show the
    // exception, because it turns on the industrial instrument. Assuming the
    // loading is in is the assumption whose failure mode is an over-stated
    // expectation and a question, rather than a false clearance.
    //
    // It is also unsettled law: on 10 July 2026 the Federal Court held in
    // Department of Education v Commissioner of Taxation [2026] FCA 898 that a
    // salary loading allowance was not ordinary time earnings, and
    // finalisation of draft LCR 2026/D1 is on hold for the outcome.
    //
    // And where a register carries **one** leave-loading column, as MYOB's
    // does, loading on leave taken and loading on a termination payout are the
    // same column: 280.00 for a leaver and 302.88 for somebody on annual
    // leave. The first is not qualifying earnings and the second is, and the
    // header cannot split them. Where the system does not split it, Clarivo
    // cannot either.
    return at(
      "uncertain",
      "Annual leave loading is read as qualifying earnings. The ATO treats it as ordinary time earnings unless it compensates for a lost opportunity to work overtime, which a payroll file cannot show, and draft LCR 2026/D1 is on hold pending Department of Education v Commissioner of Taxation [2026] FCA 898.",
    );
  }

  if (category === "allowance") {
    if (ALLOWANCE_OUT.test(text)) {
      return at(
        "out",
        "An expense allowance, or an allowance paid for overtime, is not ordinary time earnings.",
      );
    }
    if (ALLOWANCE_UNCERTAIN.test(text)) {
      return at(
        "uncertain",
        "A flat, non-accountable travel allowance is qualifying earnings and a true expense reimbursement is not. The header cannot say which this is.",
      );
    }
    return at("in", "An allowance paid for ordinary hours is ordinary time earnings.");
  }

  if (category === "bonus_commission") {
    return at(
      "in",
      "All commission is qualifying earnings under s 10A(1)(b), and a bonus paid for ordinary hours is ordinary time earnings.",
    );
  }

  if (rule === "director-fee") {
    return at("in", "Payments for duties as a member of the executive body are qualifying earnings under s 10A(1)(c).");
  }

  return at("in", "Pay for ordinary hours is ordinary time earnings under s 10A(1)(a).");
}

/** One component's treatment with this employee's amount on it. */
export interface QeLine extends QeComponentTreatment {
  amount: number;
}

/**
 * Which side of the bridge the register puts the sacrifice on, and therefore
 * whether the sacrificed amount has to be added back (spec 7.3).
 */
export type SacrificeBranch =
  /** No sacrifice column, or nothing in it for this employee. */
  | "none"
  /**
   * The earnings columns are stated **before** the sacrifice, so they already
   * contain the sacrificed money. Adding it again double-counts. This is the
   * normal shape and it is every file in `samples/au/`, because STP Phase 2
   * requires pre-sacrifice gross and the sacrificed amount separately.
   */
  | "pre_sacrifice"
  /**
   * The earnings are stated net of the sacrifice — salary packaging written as
   * a reduced base — so the sacrificed amount is missing from them and **must**
   * be added back. This is the case where a gross-based test would clear an
   * employer who is short.
   */
  | "post_sacrifice"
  /** Neither identity holds, so the branch cannot be decided from the file. */
  | "unreconciled";

export interface SacrificeSplit {
  branch: SacrificeBranch;
  /** The sacrificed amount on the register. */
  total: number;
  /** What is added to the base: `total` on the post-sacrifice branch, else 0. */
  addBack: number;
  keys: string[];
}

export interface QeRow {
  employeeId: string;
  /** The register's own Gross column. */
  gross: number;
  /** The register's own Net column. */
  net: number;
  components: Readonly<Record<string, number | null>>;
}

export interface QeBreakdown {
  /**
   * The base the check reports on: certain qualifying earnings plus every
   * uncertain component, because the spec's instruction is to carry the
   * loading in the base and say so.
   */
  qualifyingEarnings: number;
  /** The same base with every uncertain component excluded. */
  qualifyingEarningsLow: number;
  /** The uncertain total, `qualifyingEarnings - qualifyingEarningsLow`. */
  uncertain: number;
  /** Uncertain columns this employee has a non-zero amount in. */
  uncertainKeys: string[];
  /** Unplaced money columns this employee has a non-zero amount in. */
  unplacedKeys: string[];
  sacrifice: SacrificeSplit;
  /** Every component, with its amount and why it was treated as it was. */
  lines: QeLine[];
}

/**
 * Decides the sacrifice branch by running the two reconciliation identities.
 *
 * **This is decidable from the file**, which is why it is a rule and not a
 * guess — and the two branches give answers 500.00 apart for `samples/au/`'s
 * AU-0001 with nothing else in the file to distinguish them afterwards, which
 * is why the branch is recorded on the result.
 */
function splitSacrifice(
  row: QeRow,
  lines: readonly QeLine[],
  round: (v: number) => number,
): SacrificeSplit {
  const sacrificeLines = lines.filter((l) => l.rule === SACRIFICE_SUPER_RULE);
  const total = round(sacrificeLines.reduce((sum, l) => sum + Math.abs(l.amount), 0));
  const keys = sacrificeLines.filter((l) => round(Math.abs(l.amount)) !== 0).map((l) => l.key);

  if (total === 0) return { branch: "none", total: 0, addBack: 0, keys };

  const deductions = round(
    lines
      .filter((l) => DEDUCTIONS.has(l.category))
      .reduce((sum, l) => sum + Math.abs(l.amount), 0),
  );
  const earnings = round(
    lines
      .filter((l) => EARNINGS.has(l.category) || l.category === "uncategorised")
      .reduce((sum, l) => sum + l.amount, 0),
  );

  const gross = round(row.gross);
  const net = round(row.net);
  const sacrificeIsADeduction = sacrificeLines.some((l) => DEDUCTIONS.has(l.category));

  if (sacrificeIsADeduction && round(gross - deductions) === net) {
    return { branch: "pre_sacrifice", total, addBack: 0, keys };
  }
  if (round(earnings + total) === gross) {
    return { branch: "post_sacrifice", total, addBack: total, keys };
  }
  return { branch: "unreconciled", total, addBack: 0, keys };
}

/**
 * One employee's qualifying earnings for one period.
 *
 * The sacrifice is counted exactly once: `qeTreatmentFor` marks it `in` so it
 * shows on the audit trail as qualifying earnings, but it is a deduction on the
 * register and contributes nothing to the sum directly — only the add-back,
 * and only on the branch that needs it. 10A(2): an amount covered by more than
 * one paragraph is counted once.
 */
export function computeQualifyingEarnings(
  row: QeRow,
  options: {
    answeredCategories?: Readonly<Record<string, Category>>;
    decimals?: number;
  } = {},
): QeBreakdown {
  const decimals = options.decimals ?? DEFAULT_MINOR_UNITS;
  const round = (v: number) => roundToMinorUnits(v, decimals);
  const answered = options.answeredCategories ?? {};

  const lines: QeLine[] = Object.keys(row.components).map((key) => {
    const raw = row.components[key];
    return { ...qeTreatmentFor(key, answered), amount: round(raw ?? 0) };
  });

  /** Earnings only: a deduction marked `in` is handled by the add-back. */
  const sumWhere = (predicate: (l: QeLine) => boolean) =>
    round(
      lines
        .filter((l) => EARNINGS.has(l.category) && predicate(l))
        .reduce((sum, l) => sum + l.amount, 0),
    );

  const certain = sumWhere((l) => l.treatment === "in");
  const uncertain = sumWhere((l) => l.treatment === "uncertain");
  const sacrifice = splitSacrifice(row, lines, round);

  const low = round(certain + sacrifice.addBack);

  return {
    qualifyingEarnings: round(low + uncertain),
    qualifyingEarningsLow: low,
    uncertain,
    uncertainKeys: lines
      .filter((l) => l.treatment === "uncertain" && round(l.amount) !== 0)
      .map((l) => l.key),
    unplacedKeys: lines
      .filter((l) => l.treatment === "unplaced" && round(l.amount) !== 0)
      .map((l) => l.key),
    sacrifice,
    lines,
  };
}
