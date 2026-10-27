/**
 * Step 4: the two sums that define a correct payroll register.
 *
 * They were computed nowhere. `validate.ts` checked a negative gross and a
 * negative net per row as *warnings*, and nothing compared net to gross or the
 * components to either. The repository's own `samples/payroll_july_2026.csv`
 * is 520.00 out across three rows — E001 by 300, E005 by 20, E017 by 200 — and
 * Clarivo ingested it, built a dashboard on it and wrote an AI narrative about
 * it without a word.
 *
 * Two identities, per employee:
 *
 *   1.  Σ earnings            = gross
 *   2.  gross − Σ deductions  = net
 *
 * Plus net ≤ gross and net ≥ 0, which are implied by the two above only when
 * both hold.
 *
 * **Which components are on which side comes from the classifier**, not from a
 * second vocabulary here: `classifyComponent` already decides earnings from
 * employee deductions from employer costs, and step 3b's fix to it (employer
 * health insurance is not social security) has to apply to this gate too.
 * Employer costs and quantity columns are on neither line — an employer's
 * social security contribution is a cost to the company that never passes
 * through gross, and absence *days* are not money.
 *
 * **Tolerance is absolute: the currency's own minor unit.** `summary.ts` fired
 * `RECONCILIATION_GAP` only above 2% of gross, which on a 20M payroll lets
 * 403,335.64 sit unexplained inside a green bridge. Rounding the difference to
 * the currency's minor units and testing it against zero gives both halves at
 * once — float noise of 1e-13 rounds away, and one fils does not.
 *
 * Pure, like the rest of this package. It reports; the caller decides whether
 * that blocks an upload.
 */

import {
  classifyComponent,
  isTotalColumn,
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  type Category,
} from "./annual";
import { roundToMinorUnits, DEFAULT_MINOR_UNITS } from "./money";

/** One employee's row, as the register has it. Signs exactly as uploaded. */
export interface ReconcileRow {
  employeeId: string;
  /** The register's own Gross column. */
  gross: number;
  /** The register's own Net column. */
  net: number;
  /** Mapped component key -> value. A missing or blank cell is absent, not 0. */
  components: Readonly<Record<string, number | null>>;
}

export type ReconciliationCode =
  /** Mapped earnings do not add up to the Gross column. */
  | "earnings_not_gross"
  /** Gross minus mapped deductions does not equal the Net column. */
  | "deductions_not_net"
  /** Net above gross. Possible on its own when a deduction is signed wrongly. */
  | "net_exceeds_gross"
  /** A negative net. Nobody is paid a negative amount. */
  | "negative_net";

export interface RowBreach {
  code: ReconciliationCode;
  employeeId: string;
  /** 1-based row in the uploaded file, when the caller supplied it. */
  row?: number;
  /** What the components imply. */
  expected: number;
  /** What the register's own column says. */
  actual: number;
  /** `actual - expected`, rounded to the currency's minor units. Never zero. */
  difference: number;
}

/**
 * A deduction column written both ways within one file.
 *
 * A register stores a deduction either as a positive magnitude or a negative
 * delta, and either is fine — but only consistently. A column holding both
 * cannot be read without guessing which rows reduce net, so it is reported and
 * the rows it touches get no verdict on identity 2. Same rule as an ambiguous
 * date column in `ingest.ts`, for the same reason: a wrong verdict is worse
 * than a declared gap.
 */
export interface MixedSignColumn {
  componentKey: string;
  category: Category;
  /** Up to three employee ids on each side, so the admin can find them. */
  positive: string[];
  negative: string[];
}

export interface ReconciliationTotals {
  gross: number;
  net: number;
  /** Placed earnings only. */
  earnings: number;
  /** Money the classifier has not placed. Carried on the earnings side. */
  unplaced: number;
  /** As a reduction: always the magnitude by which net falls below gross. */
  deductions: number;
  employerCosts: number;
}

/**
 * A money column the classifier left `uncategorised`.
 *
 * Not a breach. `samples/2025` carries `Expense Reimbursement` on purpose,
 * because real uploads have columns nobody has mapped, and the annual engine
 * already parks the residue in `other_earnings_balance` rather than dropping
 * it. Blocking on it would make the gate unusable on the first real register
 * and it would be switched off.
 *
 * It is declared instead, which is the distinction that matters: "your file
 * does not add up" is a different problem from "Clarivo does not know what this
 * column is", and only the first should stop an upload.
 */
export interface UnplacedColumn {
  componentKey: string;
  /** Signed total across the register, so the admin can see which side it is. */
  total: number;
}

/**
 * Which identities could be stated at all.
 *
 * An identity needs columns on its side. A register mapped as ID, Gross and Net
 * with no breakdown has nothing to compare gross against, and `gross − 0 = net`
 * would demand that net equal gross — which is false of every real payroll. So
 * an unmapped side is **not checked**, and says so, rather than failing.
 *
 * This is the same distinction `unplacedColumns` draws and the control total
 * draws: "not checked" is a third answer, and a panel that showed it as a tick
 * would be claiming something nobody verified.
 */
export interface ReconciliationCoverage {
  /** At least one earnings or unplaced column, so identity 1 was checked. */
  earnings: boolean;
  /** At least one employee-deduction column, so identity 2 was checked. */
  deductions: boolean;
}

export interface ReconciliationReport {
  breaches: RowBreach[];
  mixedSignColumns: MixedSignColumn[];
  unplacedColumns: UnplacedColumn[];
  coverage: ReconciliationCoverage;
  totals: ReconciliationTotals;
  /** Component keys counted on neither line, for the panel to show. */
  excludedKeys: string[];
  /**
   * No breaches and no unreadable column. The gate passes on this alone —
   * `unplacedColumns` is reported but does not block.
   */
  balanced: boolean;
}

export interface ReconcileInput {
  rows: readonly ReconcileRow[];
  /** The currency's minor units, from `minorUnits(currencyCode)`. */
  decimals?: number;
  /** File row per employee id, so a breach can name the line to look at. */
  rowNumbers?: ReadonlyMap<string, number>;
}

const EARNINGS = new Set<Category>(EARNING_CATEGORIES);
const DEDUCTIONS = new Set<Category>(EMPLOYEE_DEDUCTION_CATEGORIES);

const MAX_SAMPLES = 3;

/** Every component key in the input, in first-seen order. */
function keysOf(rows: readonly ReconcileRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.components)) seen.add(key);
  }
  return [...seen];
}

type Side = "earning" | "deduction" | "unplaced" | "excluded";

/**
 * Which side a column is on, and whether it counts at all.
 *
 * A column whose header is itself a total (`Gross Salary` mapped as a
 * component) is excluded, or identity 1 would compare gross against gross plus
 * its own parts. So are quantities, `ignore`d columns and the employer side.
 *
 * `uncategorised` is its own side rather than excluded, and it counts toward
 * identity 1. That matches the annual engine, where `other_earnings_balance` is
 * gross minus the *mapped* earnings — one model of where unplaced money sits,
 * not two. It also keeps the pair of identities honest: an unplaced column that
 * is really a deduction leaves identity 2 out by its amount, so the two
 * together still catch it.
 */
function sideOf(key: string): { category: Category; side: Side } {
  const category = classifyComponent(key);
  if (isTotalColumn(key)) return { category, side: "excluded" };
  if (EARNINGS.has(category)) return { category, side: "earning" };
  if (DEDUCTIONS.has(category)) return { category, side: "deduction" };
  if (category === "uncategorised") return { category, side: "unplaced" };
  return { category, side: "excluded" };
}

/**
 * Reconciles a register.
 *
 * Returns every breach it found rather than the first: a payroll admin fixing
 * a file wants the whole list, and three rows out of twenty is a different
 * problem from twenty out of twenty.
 */
export function reconcileRegister(input: ReconcileInput): ReconciliationReport {
  const decimals = input.decimals ?? DEFAULT_MINOR_UNITS;
  const round = (v: number) => roundToMinorUnits(v, decimals);

  const sides = new Map<string, ReturnType<typeof sideOf>>();
  for (const key of keysOf(input.rows)) sides.set(key, sideOf(key));

  // Deduction sign conventions, inferred per column across every row — the
  // same column-at-a-time reading `ingest.ts` uses for dates.
  const signs = new Map<string, { positive: string[]; negative: string[] }>();
  for (const [key, { side }] of sides) {
    if (side !== "deduction") continue;
    const positive: string[] = [];
    const negative: string[] = [];
    for (const row of input.rows) {
      const value = row.components[key];
      if (value === null || value === undefined || round(value) === 0) continue;
      (value > 0 ? positive : negative).push(row.employeeId);
    }
    signs.set(key, { positive, negative });
  }

  const mixedSignColumns: MixedSignColumn[] = [];
  const unreadable = new Set<string>();
  for (const [key, { positive, negative }] of signs) {
    if (positive.length > 0 && negative.length > 0) {
      unreadable.add(key);
      mixedSignColumns.push({
        componentKey: key,
        category: sides.get(key)?.category ?? "uncategorised",
        positive: positive.slice(0, MAX_SAMPLES),
        negative: negative.slice(0, MAX_SAMPLES),
      });
    }
  }

  const breaches: RowBreach[] = [];
  const totals: ReconciliationTotals = {
    gross: 0,
    net: 0,
    earnings: 0,
    unplaced: 0,
    deductions: 0,
    employerCosts: 0,
  };
  /** Signed total per unplaced column, so the panel can name each one. */
  const unplacedTotals = new Map<string, number>();

  const allSides = [...sides.values()].map((s) => s.side);
  const coverage: ReconciliationCoverage = {
    earnings: allSides.some((s) => s === "earning" || s === "unplaced"),
    deductions: allSides.some((s) => s === "deduction"),
  };

  for (const row of input.rows) {
    const rowNumber = input.rowNumbers?.get(row.employeeId);
    const named = <T extends object>(extra: T) =>
      rowNumber === undefined ? extra : { ...extra, row: rowNumber };

    let earnings = 0;
    let unplaced = 0;
    let deductions = 0;
    let employerCosts = 0;
    /** True when a deduction column this row depends on could not be read. */
    let deductionsReadable = true;

    for (const [key, { category, side }] of sides) {
      const raw = row.components[key];
      if (raw === null || raw === undefined) continue;
      const value = round(raw);

      if (side === "earning") {
        earnings += value;
      } else if (side === "unplaced") {
        unplaced += value;
        unplacedTotals.set(key, round((unplacedTotals.get(key) ?? 0) + value));
      } else if (side === "deduction") {
        if (unreadable.has(key)) {
          if (value !== 0) deductionsReadable = false;
          continue;
        }
        // Whichever way the column is written, a deduction reduces net, so the
        // reduction is its magnitude. The convention is a property of the
        // column and was settled above; `Math.abs` here is reading it, not
        // assuming it.
        deductions += Math.abs(value);
      } else if (category === "social_security_employer" || category === "other_employer_cost") {
        employerCosts += Math.abs(value);
      }
    }

    const gross = round(row.gross);
    const net = round(row.net);

    totals.gross = round(totals.gross + gross);
    totals.net = round(totals.net + net);
    totals.earnings = round(totals.earnings + earnings);
    totals.unplaced = round(totals.unplaced + unplaced);
    totals.deductions = round(totals.deductions + deductions);
    totals.employerCosts = round(totals.employerCosts + employerCosts);

    // Unplaced money counts here, so a register whose only problem is an
    // unmapped column reconciles and the admin is told about the column
    // instead of handed a mystery gap.
    const accountedFor = round(earnings + unplaced);
    const earningsDiff = round(gross - accountedFor);
    if (coverage.earnings && earningsDiff !== 0) {
      breaches.push(
        named({
          code: "earnings_not_gross" as const,
          employeeId: row.employeeId,
          expected: accountedFor,
          actual: gross,
          difference: earningsDiff,
        }),
      );
    }

    if (coverage.deductions && deductionsReadable) {
      const impliedNet = round(gross - deductions);
      const netDiff = round(net - impliedNet);
      if (netDiff !== 0) {
        breaches.push(
          named({
            code: "deductions_not_net" as const,
            employeeId: row.employeeId,
            expected: impliedNet,
            actual: net,
            difference: netDiff,
          }),
        );
      }
    }

    // Stated independently of the two identities above, because each can be
    // the only thing wrong: a register with no mapped components at all still
    // must not pay more net than gross.
    if (round(net - gross) > 0) {
      breaches.push(
        named({
          code: "net_exceeds_gross" as const,
          employeeId: row.employeeId,
          expected: gross,
          actual: net,
          difference: round(net - gross),
        }),
      );
    }

    if (net < 0) {
      breaches.push(
        named({
          code: "negative_net" as const,
          employeeId: row.employeeId,
          expected: 0,
          actual: net,
          difference: net,
        }),
      );
    }
  }

  const excludedKeys = [...sides]
    .filter(([, { side }]) => side === "excluded")
    .map(([key]) => key);

  const unplacedColumns: UnplacedColumn[] = [...unplacedTotals]
    .filter(([, total]) => total !== 0)
    .map(([componentKey, total]) => ({ componentKey, total }));

  return {
    breaches,
    mixedSignColumns,
    unplacedColumns,
    coverage,
    totals,
    excludedKeys,
    balanced: breaches.length === 0 && mixedSignColumns.length === 0,
  };
}

/** What the admin says the register's own export totalled. */
export interface ControlTotals {
  gross?: number | null;
  net?: number | null;
}

export interface ControlTotalCheck {
  line: "gross" | "net";
  /** What the admin typed. */
  stated: number;
  /** What Clarivo added up from the rows. */
  computed: number;
  /** `stated - computed`, rounded to the currency's minor units. Never zero. */
  difference: number;
}

/**
 * Ticks the computed totals against the ones printed on the export the admin
 * uploaded.
 *
 * A line the admin left blank is **not** a pass: it is absent, and reported as
 * such by the caller. Clarivo's own `totalGross` and `totalNet` can only ever
 * agree with themselves, so an unsupplied control total means the register was
 * never checked against anything outside Clarivo.
 */
export function checkControlTotals(
  stated: ControlTotals,
  computed: { gross: number; net: number },
  decimals: number = DEFAULT_MINOR_UNITS,
): ControlTotalCheck[] {
  const round = (v: number) => roundToMinorUnits(v, decimals);
  const checks: ControlTotalCheck[] = [];

  for (const line of ["gross", "net"] as const) {
    const value = stated[line];
    if (value === null || value === undefined) continue;
    const difference = round(value - computed[line]);
    if (difference !== 0) {
      checks.push({ line, stated: round(value), computed: round(computed[line]), difference });
    }
  }

  return checks;
}

/** A breach as a sentence a payroll admin can act on. */
export function describeBreach(breach: RowBreach, decimals: number = DEFAULT_MINOR_UNITS): string {
  const at = breach.row === undefined ? "" : ` (row ${breach.row})`;
  const fixed = (v: number) => v.toFixed(decimals);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${fixed(v)}`;

  switch (breach.code) {
    case "earnings_not_gross":
      return `${breach.employeeId}${at}: the earnings columns add up to ${fixed(breach.expected)}, but Gross says ${fixed(breach.actual)} — ${signed(breach.difference)}.`;
    case "deductions_not_net":
      return `${breach.employeeId}${at}: gross minus the deduction columns is ${fixed(breach.expected)}, but Net says ${fixed(breach.actual)} — ${signed(breach.difference)}.`;
    case "net_exceeds_gross":
      return `${breach.employeeId}${at}: net ${fixed(breach.actual)} is above gross ${fixed(breach.expected)}.`;
    case "negative_net":
      return `${breach.employeeId}${at}: net is ${fixed(breach.actual)}.`;
  }
}
