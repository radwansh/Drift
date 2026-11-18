import type { Category } from "../annual/types";
import { roundToMinorUnits, smallestUnit, minorUnits } from "../money";
import {
  AU_CURRENCY_CODE,
  australianBasis,
  isAustralianCompany,
  type JurisdictionCompany,
} from "./jurisdiction";
import {
  computeQualifyingEarnings,
  qeTreatmentFor,
  EMPLOYER_SUPER_RULE,
  type QeBreakdown,
  type QeRow,
} from "./qualifying-earnings";
import {
  MCB_SUPPRESSION_SHARE,
  PAYDAY_SUPER_START,
  superRatesFor,
  type SuperRates,
} from "./rates";

/**
 * The Payday Super check (`docs/AU_PAYROLL_SPEC.md` section 7).
 *
 * **What it reports is a figure from the file, never a legal conclusion.**
 * Section 8 draws the line and it is the most important thing in this module:
 *
 *   - "This file shows employer super below 12% of qualifying earnings" is a
 *     finding.
 *   - "This employer breached Payday Super" is a legal conclusion, and the
 *     product must not state it.
 *
 * Three sentences this module must never write, and the reason each is
 * impossible rather than merely unwise:
 *
 *   1. *"This employer has breached its Payday Super obligations."* Clarivo
 *      cannot see a contribution, a fund, or a date.
 *   2. *"Super was paid late."* The seven-business-day rule is about **receipt
 *      by the fund**, counted in business days from the day the employee was
 *      paid, excluding public holidays observed across a whole State, the ACT
 *      or the NT. A payroll export says what was *calculated*; it does not say
 *      what was paid, to whom, or when, and most exports do not even carry the
 *      payment date. There is no wording of this sentence Clarivo can support
 *      from any payroll file.
 *   3. *"Superannuation guarantee charge of $X is payable."* The charge is a
 *      base shortfall, plus notional earnings compounding daily at the general
 *      interest charge rate, plus a 60% administrative uplift, plus a choice
 *      loading, plus an administrative penalty. Quantifying it from a register
 *      would be a fabricated number attached to a legal exposure.
 *
 * Nor can the check see any of regulation 11's excluded employees (visa
 * subclass, executive status, "a part-time employee who is under 18"), most of
 * regulation 12's excluded earnings, whether an allowance is an expense
 * allowance, whether leave loading is referable to lost overtime, or whether a
 * contribution is RESC. Where one of those decides the answer, the answer is
 * `not_checkable` and says which column left it open.
 */

export type PaydaySuperOutcome =
  /** The register shows at least 12% of qualifying earnings. */
  | "at_or_above"
  /** The register shows less. A finding about the file, not a verdict. */
  | "below"
  /**
   * The answer flips depending on something the register cannot settle, so
   * neither a clean pass nor a clean shortfall is reported.
   */
  | "uncertain"
  /** The check could not be run, and says why. Never a breach. */
  | "not_checkable";

/** Why the check did not run at all. */
export type PaydaySuperStatus =
  | "ran"
  /** Gate 1: the company is not Australian, as far as Clarivo can tell. */
  | "not_australian"
  /** Gate 2: no column on this register is an AU employer-super column. */
  | "no_super_column"
  /** The period ends before Payday Super commenced on 1 July 2026. */
  | "before_commencement"
  /** No signed-off rate table for that financial year. */
  | "no_rate_table";

export type PaydaySuperWarningCode =
  /**
   * The register carries a superannuation column but the company currency is
   * not AUD. Section 1.1: a silent no-op here is the worse failure of the two
   * directions, because the employer with the real obligation gets nothing and
   * never learns why.
   */
  | "super_column_without_aud"
  /**
   * The company reports in AUD but nothing on the register is a super column,
   * so the check cannot run. Normal, and not a breach.
   */
  | "aud_without_super_column";

export interface PaydaySuperWarning {
  code: PaydaySuperWarningCode;
  message: string;
}

export interface PaydaySuperEmployeeResult {
  employeeId: string;
  outcome: PaydaySuperOutcome;
  severity: "info" | "warning";
  /** The base, with every uncertain component carried in it (spec 5.5). */
  qualifyingEarnings: number;
  /** The same base with every uncertain component excluded. */
  qualifyingEarningsLow: number;
  /** `qualifyingEarnings x charge percentage`, rounded to the minor unit. */
  expected: number;
  /** The same, on `qualifyingEarningsLow`. */
  expectedLow: number;
  /** What the register's AU employer-super columns add up to. */
  actual: number;
  /** `expected - actual`. Positive means the register shows less. */
  shortfall: number;
  /** Columns whose qualifying-earnings status the register cannot settle. */
  uncertainKeys: string[];
  /** The full audit trail: every component, its treatment and why. */
  breakdown: QeBreakdown;
  /** One sentence a payroll admin can act on. Never a legal conclusion. */
  message: string;
  /** Everything else worth saying about this employee. */
  notes: string[];
}

export interface PaydaySuperReport {
  status: PaydaySuperStatus;
  /** Why the company was, or was not, treated as Australian — in words. */
  basis: string;
  /** The charge percentage and thresholds used, when the check ran. */
  rates: SuperRates | null;
  warnings: PaydaySuperWarning[];
  employees: PaydaySuperEmployeeResult[];
  /**
   * Per-employee figures, summed. **Never 12% of a company total** (spec 7.5):
   * `22,766.46 x 0.12 = 2,731.98` while the seven per-employee amounts sum to
   * `2,731.97`, and a cent of rounding drift is not a finding.
   */
  totals: {
    qualifyingEarnings: number;
    expected: number;
    actual: number;
    /** The sum of the positive shortfalls only. */
    shortfall: number;
    below: number;
    uncertain: number;
    atOrAbove: number;
    notCheckable: number;
  };
  /** The headline, in the words section 8.3 prescribes. */
  message: string;
}

export interface PaydaySuperRow extends QeRow {
  /** From `employee_snapshots.hire_date`, when the register carried one. */
  hireDate?: string | null;
  /** From `employee_snapshots.termination_date`. */
  terminationDate?: string | null;
}

export interface PaydaySuperInput {
  company: JurisdictionCompany;
  /** The period's own dates, YYYY-MM-DD. */
  period: { start: string; end: string };
  rows: readonly PaydaySuperRow[];
  /** Saved `component_categories`, which win on the category. */
  answeredCategories?: Readonly<Record<string, Category>>;
  /**
   * Qualifying earnings already seen this financial year, per employee, for the
   * maximum contributions base. Absent means Clarivo has no earlier period —
   * which is itself worth saying, so the message says it.
   */
  priorQualifyingEarnings?: Readonly<Record<string, number>>;
}

/**
 * Share of the base that has to be bonus or other earnings before an
 * out-of-cycle payment is assumed (spec 7.8, s 18C(2) item 2): where the QE day
 * relates to earnings of a kind set by legislative instrument, the contribution
 * may be received by the end of the usual period for the **next** standard QE
 * day. So a bonus-only or commission-only run showing no super is not evidence
 * of a shortfall.
 */
const OUT_OF_CYCLE_SHARE = 0.5;

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function isWithin(date: string | null | undefined, start: string, end: string): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

/**
 * Runs the check.
 *
 * **Gate 1 is the currency proxy and gate 2 is the register** (spec 1.1):
 *
 *     runPaydaySuperCheck = isAustralianCompany(company)
 *                        && the register has at least one column classified
 *                           social_security_employer by an AU-super rule
 *
 * Gate 2 is what keeps the proxy's first weakness cheap. A New Zealand company
 * reporting in AUD has a `KiwiSaver Employer Contribution` column, not a
 * superannuation one; it matches no AU-super rule, the check does not run, and
 * nothing false is said. It also gives the "no super column" case for free,
 * because it is the same condition — and that case is **not** a breach: employer
 * super is frequently accrued and paid outside the payroll export, and several
 * report formats, Employment Hero's Gross to Net among them, simply do not
 * carry the employer side. Reporting that as a shortfall would report a finding
 * against every employer whose export happens to be the common kind.
 *
 * Both directions of a wrong-jurisdiction match are surfaced rather than
 * silent: the report always carries its `basis` in words, and a register with a
 * super column whose company is not on AUD gets a warning naming the fix.
 */
export function runPaydaySuperCheck(input: PaydaySuperInput): PaydaySuperReport {
  const { company, period, rows } = input;
  const answered = input.answeredCategories ?? {};
  const decimals = minorUnits(AU_CURRENCY_CODE);
  const round = (v: number) => roundToMinorUnits(v, decimals);
  const tolerance = smallestUnit(decimals);
  const basis = australianBasis(company);

  const componentKeys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.components)) componentKeys.add(key);

  /** Gate 2: the register's own AU employer-super columns. */
  const superKeys = [...componentKeys].filter(
    (key) => qeTreatmentFor(key, answered).rule === EMPLOYER_SUPER_RULE,
  );
  const australian = isAustralianCompany(company);
  const warnings: PaydaySuperWarning[] = [];

  const empty = (
    status: PaydaySuperStatus,
    message: string,
  ): PaydaySuperReport => ({
    status,
    basis,
    rates: null,
    warnings,
    employees: [],
    totals: {
      qualifyingEarnings: 0,
      expected: 0,
      actual: 0,
      shortfall: 0,
      below: 0,
      uncertain: 0,
      atOrAbove: 0,
      notCheckable: 0,
    },
    message,
  });

  if (!australian) {
    if (superKeys.length > 0) {
      // The worse of the two failures, so it is loud. Section 1.1.
      warnings.push({
        code: "super_column_without_aud",
        message:
          `This register has a superannuation column (${superKeys.join(", ")}), but the company currency ` +
          `is not ${AU_CURRENCY_CODE}. Set it to ${AU_CURRENCY_CODE} to enable the Payday Super check.`,
      });
    }
    return empty(
      "not_australian",
      "The Payday Super check did not run, because Clarivo does not read this company as Australian.",
    );
  }

  if (superKeys.length === 0) {
    warnings.push({
      code: "aud_without_super_column",
      message:
        "This register has no employer superannuation column, so the 12% check could not be run. " +
        "Employer super is often paid from a separate process and does not appear on the pay register.",
    });
    return empty(
      "no_super_column",
      "This register has no employer superannuation column, so the 12% check could not be run. " +
        "Employer super is often paid from a separate process and does not appear on the pay register.",
    );
  }

  if (period.end < PAYDAY_SUPER_START) {
    return empty(
      "before_commencement",
      `Payday Super commenced on ${PAYDAY_SUPER_START} and applies to qualifying earnings paid from that date, ` +
        "so this period is outside it.",
    );
  }

  const rates = superRatesFor(period.end);
  if (!rates) {
    return empty(
      "no_rate_table",
      "Clarivo has no signed-off superannuation rate table for the financial year this period falls in. " +
        "The charge percentage and the maximum contributions base are set each year and are not carried forward.",
    );
  }

  const rate = rates.chargePercentage / 100;
  const employees: PaydaySuperEmployeeResult[] = [];

  for (const row of rows) {
    const breakdown = computeQualifyingEarnings(row, {
      answeredCategories: answered,
      decimals,
    });

    const superAmounts = superKeys.map((key) => row.components[key]);
    const anyStated = superAmounts.some((v) => v !== null && v !== undefined);
    const actual = round(sum(superAmounts.map((v) => Math.abs(v ?? 0))));

    const expected = round(breakdown.qualifyingEarnings * rate);
    const expectedLow = round(breakdown.qualifyingEarningsLow * rate);
    const shortfall = round(expected - actual);
    const shortfallLow = round(expectedLow - actual);

    const notes: string[] = [];
    const base = {
      employeeId: row.employeeId,
      qualifyingEarnings: breakdown.qualifyingEarnings,
      qualifyingEarningsLow: breakdown.qualifyingEarningsLow,
      expected,
      expectedLow,
      actual,
      shortfall,
      uncertainKeys: breakdown.uncertainKeys,
      breakdown,
    };
    const fixed = (v: number) => v.toFixed(decimals);
    const notCheckable = (message: string): PaydaySuperEmployeeResult => ({
      ...base,
      outcome: "not_checkable",
      severity: "info",
      message,
      notes,
    });

    // Which branch the sacrifice took, always on the audit trail: the two give
    // answers 500.00 apart for `samples/au/`'s AU-0001 and nothing else in the
    // file distinguishes them afterwards (spec 7.3).
    if (breakdown.sacrifice.branch === "pre_sacrifice") {
      notes.push(
        `Earnings are stated before the ${fixed(breakdown.sacrifice.total)} salary sacrifice, which is already ` +
          "inside them, so nothing was added back.",
      );
    } else if (breakdown.sacrifice.branch === "post_sacrifice") {
      notes.push(
        `Earnings are stated net of the ${fixed(breakdown.sacrifice.total)} salary sacrifice, so it was added ` +
          "back under s 10A(1)(h).",
      );
    }

    // 7.6: an incomplete base producing a confident shortfall is worse than no
    // answer, so it is named rather than quietly left out.
    if (breakdown.unplacedKeys.length > 0) {
      employees.push(
        notCheckable(
          `Qualifying earnings could not be computed because ${breakdown.unplacedKeys
            .map((k) => `\`${k}\``)
            .join(", ")} ${breakdown.unplacedKeys.length === 1 ? "is" : "are"} not categorised.`,
        ),
      );
      continue;
    }

    if (breakdown.sacrifice.branch === "unreconciled") {
      employees.push(
        notCheckable(
          "This row does not reconcile, so Clarivo cannot tell whether the earnings columns are stated before " +
            "or after the salary sacrifice, and the two give different qualifying earnings.",
        ),
      );
      continue;
    }

    // Blank is not 0.00. A blank super cell says nothing; 0.00 is a figure and
    // is checkable.
    if (!anyStated) {
      employees.push(
        notCheckable(
          `The employer superannuation column is blank for this employee, so there is no figure to check. ` +
            "A blank cell is not the same as 0.00.",
        ),
      );
      continue;
    }

    if (breakdown.qualifyingEarnings === 0) {
      employees.push(
        notCheckable(
          "This employee has no qualifying earnings on this register, so there is no base to take 12% of. " +
            "A report that carries only totals — gross, taxable and net — has no pay items to build the base from.",
        ),
      );
      continue;
    }

    // 7.8.1: the maximum contributions base is annual, and Clarivo cannot see
    // year-to-date from before the first uploaded period.
    const prior = input.priorQualifyingEarnings?.[row.employeeId] ?? 0;
    const ytd = round(prior + breakdown.qualifyingEarnings);
    if (ytd > rates.maximumContributionsBase * MCB_SUPPRESSION_SHARE) {
      employees.push(
        notCheckable(
          `Qualifying earnings for this employee reach ${fixed(ytd)} across the periods Clarivo holds, which is ` +
            `close to the ${rates.financialYear} maximum contributions base of ${fixed(rates.maximumContributionsBase)}. ` +
            "Above it no further super is required, and Clarivo cannot see year-to-date earnings from before the " +
            "first uploaded period.",
        ),
      );
      continue;
    }

    if (shortfall > tolerance) {
      // 7.8.3: a new starter's first contribution to a particular fund has 20
      // business days (s 18C(2) item 1), which can cross a period boundary.
      if (isWithin(row.hireDate, period.start, period.end)) {
        employees.push(
          notCheckable(
            "This employee started during the period, and a first contribution to a fund has a longer window " +
              "that can fall in the next period, so this period alone shows nothing.",
          ),
        );
        continue;
      }

      // 7.8.2: an out-of-cycle payment's super may be in the next period.
      const variable = round(
        sum(
          breakdown.lines
            .filter(
              (l) =>
                (l.treatment === "in" || l.treatment === "uncertain") &&
                (l.category === "bonus_commission" || l.category === "other_earning"),
            )
            .map((l) => l.amount),
        ),
      );
      if (variable > breakdown.qualifyingEarnings * OUT_OF_CYCLE_SHARE) {
        employees.push(
          notCheckable(
            "Most of this employee's qualifying earnings in this period are a bonus, a commission or another " +
              "one-off, and super on an out-of-cycle payment can be made with the next regular pay run. " +
              "Check the following period before reading anything into this one.",
          ),
        );
        continue;
      }

      // 5.5 / 5.6: the answer turns on something the register cannot settle.
      if (shortfallLow <= tolerance) {
        employees.push({
          ...base,
          outcome: "uncertain",
          severity: "info",
          message:
            `Whether employer super of ${fixed(actual)} reaches 12% for this employee depends on ` +
            `${breakdown.uncertainKeys.map((k) => `\`${k}\``).join(", ")}: with it in the base 12% is ` +
            `${fixed(expected)}, and without it ${fixed(expectedLow)}. Clarivo cannot settle that from the register.`,
          notes,
        });
        continue;
      }

      employees.push({
        ...base,
        outcome: "below",
        severity: "warning",
        message:
          `Employer super of ${fixed(actual)} is below 12% of this employee's qualifying earnings of ` +
          `${fixed(breakdown.qualifyingEarnings)}, which is ${fixed(expected)} — ${fixed(shortfall)} less.`,
        notes,
      });
      continue;
    }

    if (breakdown.uncertain !== 0 && breakdown.uncertainKeys.length > 0) {
      notes.push(
        `This result depends on ${breakdown.uncertainKeys
          .map((k) => `\`${k}\``)
          .join(", ")} being treated as qualifying earnings, which the ATO's draft guidance has not finalised.`,
      );
    }

    employees.push({
      ...base,
      outcome: "at_or_above",
      severity: "info",
      message:
        `Employer super of ${fixed(actual)} is at or above 12% of this employee's qualifying earnings of ` +
        `${fixed(breakdown.qualifyingEarnings)}, which is ${fixed(expected)}.`,
      notes,
    });
  }

  const counted = employees.filter((e) => e.outcome !== "not_checkable");
  const below = employees.filter((e) => e.outcome === "below");
  const uncertain = employees.filter((e) => e.outcome === "uncertain");
  const notCheckableCount = employees.filter((e) => e.outcome === "not_checkable").length;

  const totals = {
    qualifyingEarnings: round(sum(counted.map((e) => e.qualifyingEarnings))),
    expected: round(sum(counted.map((e) => e.expected))),
    actual: round(sum(counted.map((e) => e.actual))),
    shortfall: round(sum(below.map((e) => e.shortfall))),
    below: below.length,
    uncertain: uncertain.length,
    atOrAbove: employees.filter((e) => e.outcome === "at_or_above").length,
    notCheckable: notCheckableCount,
  };

  const parts: string[] = [];
  if (below.length > 0) {
    // The exact replacement wording section 8.3 gives for the sentence the
    // product must not write.
    parts.push(
      `Employer super for ${below.length} ${below.length === 1 ? "employee" : "employees"} is below 12% of ` +
        "their qualifying earnings in this period.",
    );
  }
  if (uncertain.length > 0) {
    parts.push(
      `For ${uncertain.length} ${uncertain.length === 1 ? "employee" : "employees"} the answer depends on a ` +
        "column the register cannot settle.",
    );
  }
  if (notCheckableCount > 0) {
    parts.push(
      `${notCheckableCount} ${notCheckableCount === 1 ? "employee" : "employees"} could not be checked, with a ` +
        "reason given for each.",
    );
  }
  if (parts.length === 0) {
    parts.push(
      "Every employee on this register shows employer super at or above 12% of their qualifying earnings.",
    );
  }

  return {
    status: "ran",
    basis,
    rates,
    warnings,
    employees,
    totals,
    message: parts.join(" "),
  };
}
