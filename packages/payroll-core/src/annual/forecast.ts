import type {
  AnnualPeriodInput,
  Category,
  CategoryTotals,
  ExpectedSlot,
  ForecastMethod,
  Money,
  PeriodType,
} from "./types";
import { EMPLOYEE_DEDUCTION_CATEGORIES, EARNING_CATEGORIES, EMPLOYER_COST_CATEGORIES } from "./types";
import { buildCategoryTotals } from "./categoryTotals";
import { generateExpectedPeriods } from "./periods";
import { groupBySlot } from "./slots";
import { clamp } from "./dates";
import { average, roundMoney } from "./math";

const RECURRING: readonly Category[] = [
  "base_salary",
  "allowance",
  "other_deduction",
  "other_employer_cost",
];
const VARIABLE: readonly Category[] = [
  "bonus_commission",
  "overtime",
  "other_earning",
  "absence_deduction",
];
const STATUTORY: readonly Category[] = [
  "income_tax",
  "social_security_employee",
  "social_security_employer",
];

export interface ForecastOptions {
  year: number;
  periodType: PeriodType;
  method: ForecastMethod | undefined;
  actual: AnnualPeriodInput[];
  /** Future slots to forecast. */
  remaining: ExpectedSlot[];
  /** Past slots with no upload, to estimate (step 14). */
  missingPast?: ExpectedSlot[];
  /** Slot indexes this year's uploads occupy, for prior-year alignment. */
  elapsedSlotIndexes?: readonly number[];
  previousYear?: PreviousYearForecast;
  resolve: (key: string) => Category;
}

export interface PreviousYearForecast {
  periods: AnnualPeriodInput[];
  expectedCount: number;
}

export interface ForecastPeriod {
  slot: ExpectedSlot;
  gross: Money;
  employeeDeductions: Money;
  employerCosts: Money;
  /** Gross minus mapped earnings: the earnings that exist but aren't categorised. */
  earningsBalance: Money;
  /** Gross minus net minus mapped deductions: deductions that don't reconcile. */
  balance: Money;
  net: Money;
  categories: Partial<Record<Category, number>>;
}

export interface ForecastTotals {
  totals: Partial<Record<Category, Money>>;
  gross: Money;
  employeeDeductions: Money;
  employerCosts: Money;
  earningsBalance: Money;
  balance: Money;
  net: Money;
}

export interface ForecastResult extends ForecastTotals {
  method: ForecastMethod;
  methodsAvailable: ForecastMethod[];
  assumptions: string[];
  perPeriod: ForecastPeriod[];
  /** Estimated past slots, and their totals, kept separate from the forecast. */
  perEstimated: ForecastPeriod[];
  estimated: ForecastTotals;
  /** True when no earnings component is mapped, so gross/net are projected directly. */
  directGrossNet: boolean;
}

const METHOD_NAMES: Record<ForecastMethod, string> = {
  run_rate: "run rate",
  average: "average of the last 3 actual periods",
  prior_year: "prior-year trend",
};

export type { Category, CategoryTotals };

function employeeDeductionTotal(row: Partial<Record<Category, number>>): number {
  return EMPLOYEE_DEDUCTION_CATEGORIES.reduce((acc, c) => acc + (row[c] ?? 0), 0);
}

function earningsTotal(row: Partial<Record<Category, number>>): number {
  return EARNING_CATEGORIES.reduce((acc, c) => acc + (row[c] ?? 0), 0);
}

export interface PriorYearAvailability {
  available: boolean;
  /** How many of this year's elapsed slots last year also has. */
  elapsedOverlap: number;
  /** How many of this year's remaining slots last year has. */
  remainingOverlap: number;
}

/**
 * Spec rule (step 13): usable when last year covers at least 3 of this year's
 * elapsed slots and at least 1 of the slots still to forecast.
 *
 * v1 asked whether last year was *incomplete* (`expectedCount - periods.length
 * >= 1`), so a complete 2025 disabled the method and a half-empty Jan–Jun 2025
 * enabled it — exactly backwards (findings C3, P3, P4). The shipped test asserted
 * the inverted rule, which is why it went unnoticed.
 */
export function priorYearAvailability(
  prevBySlot: ReadonlySet<number>,
  elapsedSlotIndexes: readonly number[],
  remainingSlotIndexes: readonly number[],
): PriorYearAvailability {
  let elapsedOverlap = 0;
  for (const i of elapsedSlotIndexes) if (prevBySlot.has(i)) elapsedOverlap += 1;
  let remainingOverlap = 0;
  for (const i of remainingSlotIndexes) if (prevBySlot.has(i)) remainingOverlap += 1;
  return {
    available: elapsedOverlap >= 3 && remainingOverlap >= 1,
    elapsedOverlap,
    remainingOverlap,
  };
}

function emptyTotals(): ForecastTotals {
  return {
    totals: {},
    gross: 0,
    employeeDeductions: 0,
    employerCosts: 0,
    earningsBalance: 0,
    balance: 0,
    net: 0,
  };
}

function totalsOf(periods: readonly ForecastPeriod[]): ForecastTotals {
  return {
    totals: sumRows(periods.map((p) => p.categories)),
    gross: roundMoney(periods.reduce((a, p) => a + p.gross, 0)),
    employeeDeductions: roundMoney(periods.reduce((a, p) => a + p.employeeDeductions, 0)),
    employerCosts: roundMoney(periods.reduce((a, p) => a + p.employerCosts, 0)),
    earningsBalance: roundMoney(periods.reduce((a, p) => a + p.earningsBalance, 0)),
    balance: roundMoney(periods.reduce((a, p) => a + p.balance, 0)),
    net: roundMoney(periods.reduce((a, p) => a + p.net, 0)),
  };
}

export function buildForecast(opts: ForecastOptions): ForecastResult {
  const { actual, remaining, resolve } = opts;
  const missingPast = opts.missingPast ?? [];

  const rows = actual.map((p) => buildCategoryTotals(p.components, resolve).byCategory);

  // Per-period balancing lines (step 11, finding C2).
  //  earningsBalance: gross that no mapped earning accounts for. v1 ignored it, so
  //  a payroll whose only earning column was uncategorised forecast a gross of
  //  zero while reporting a real gross for the periods already uploaded.
  //  balance: the gross-minus-net residue after mapped employee deductions.
  const earningsBalances = actual.map((p, i) => p.gross - earningsTotal(rows[i] ?? {}));
  const balances = actual.map((p, i) => p.gross - p.net - employeeDeductionTotal(rows[i] ?? {}));

  const mappedEarnings = rows.reduce((acc, r) => acc + Math.abs(earningsTotal(r)), 0);
  const directGrossNet = mappedEarnings === 0 && actual.length > 0;

  const elapsedSlotIndexes = opts.elapsedSlotIndexes ?? [];
  const remainingSlotIndexes = remaining.map((s) => s.index);

  // ---- prior-year alignment, by slot index rather than end date (finding C4) ----
  let prevBySlot = new Map<number, Partial<Record<Category, number>>>();
  let prevGrossBySlot = new Map<number, number>();
  let prevNetBySlot = new Map<number, number>();
  let prevBalanceBySlot = new Map<number, number>();
  let prevEarningsBalanceBySlot = new Map<number, number>();
  let availability: PriorYearAvailability = { available: false, elapsedOverlap: 0, remainingOverlap: 0 };

  if (opts.previousYear && opts.previousYear.periods.length > 0) {
    const prevExpected = generateExpectedPeriods(
      opts.periodType,
      opts.year - 1,
      opts.previousYear.periods[0]?.periodStart,
    );
    for (const { slot, period } of groupBySlot(opts.previousYear.periods, opts.periodType, prevExpected)) {
      const row = buildCategoryTotals(period.components, resolve).byCategory;
      prevBySlot.set(slot.index, row);
      prevGrossBySlot.set(slot.index, period.gross);
      prevNetBySlot.set(slot.index, period.net);
      prevBalanceBySlot.set(slot.index, period.gross - period.net - employeeDeductionTotal(row));
      prevEarningsBalanceBySlot.set(slot.index, period.gross - earningsTotal(row));
    }
    availability = priorYearAvailability(
      new Set(prevBySlot.keys()),
      elapsedSlotIndexes,
      remainingSlotIndexes,
    );
  }

  const methodsAvailable: ForecastMethod[] = ["run_rate", "average"];
  if (availability.available) methodsAvailable.push("prior_year");

  let method: ForecastMethod = "run_rate";
  if (opts.method && methodsAvailable.includes(opts.method)) method = opts.method;

  const assumptions: string[] = [`Forecast: ${METHOD_NAMES[method]}.`];
  if (opts.method === "prior_year" && !methodsAvailable.includes("prior_year")) {
    assumptions.push("Prior-year data insufficient, fell back to run rate.");
  }

  // Growth over the slots both years share, clamped so one freak month cannot
  // double or halve the year (step 13).
  let growth = 1;
  if (method === "prior_year") {
    const sharedElapsed = elapsedSlotIndexes.filter((i) => prevBySlot.has(i));
    const currTotal = sharedElapsed.reduce((acc, i) => {
      const idx = elapsedSlotIndexes.indexOf(i);
      return acc + (actual[idx]?.gross ?? 0);
    }, 0);
    const prevTotal = sharedElapsed.reduce((acc, i) => acc + (prevGrossBySlot.get(i) ?? 0), 0);
    growth = prevTotal > 0 ? clamp(currTotal / prevTotal, 0.5, 2) : 1;
    assumptions.push(
      `Prior-year trend applied per slot at ${(growth * 100).toFixed(0)}% of last year, clamped to 50%-200%.`,
    );
  }

  const ytdByCategory = sumRows(rows);
  const ytdGross = actual.reduce((acc, p) => acc + p.gross, 0);
  const ytdRate = (cat: Category) => (ytdGross > 0 ? (ytdByCategory[cat] ?? 0) / ytdGross : 0);
  const avgAll = (cat: Category) => (rows.length > 0 ? (ytdByCategory[cat] ?? 0) / rows.length : 0);
  const lastActual = (cat: Category) => (rows.length > 0 ? rows[rows.length - 1]?.[cat] ?? 0 : 0);

  const windowRows = rows.slice(-3);
  const avgWindow = (cat: Category) =>
    windowRows.length > 0 ? average(windowRows.map((r) => r[cat] ?? 0)) : 0;

  // Step 12 (finding C5): run rate spreads the balance evenly across the actual
  // periods instead of carrying the last period's figure into every remaining
  // one. A single 400 correction in month 8 of 8 becomes 50 a period, not 400.
  const runRateBalance = balances.length > 0 ? average(balances) : 0;
  const windowBalance = balances.length > 0 ? average(balances.slice(-3)) : 0;
  const runRateEarningsBalance = earningsBalances.length > 0 ? average(earningsBalances) : 0;
  const windowEarningsBalance =
    earningsBalances.length > 0 ? average(earningsBalances.slice(-3)) : 0;

  const lastGross = actual.length > 0 ? actual[actual.length - 1]?.gross ?? 0 : 0;
  const lastNet = actual.length > 0 ? actual[actual.length - 1]?.net ?? 0 : 0;
  const avgGrossWindow = average(actual.slice(-3).map((p) => p.gross));
  const avgNetWindow = average(actual.slice(-3).map((p) => p.net));

  function projectSlot(slot: ExpectedSlot): ForecastPeriod {
    const prevRow = prevBySlot.get(slot.index);
    const categories: Partial<Record<Category, number>> = {};

    const amountFor = (cat: Category): number => {
      if (method === "average") return avgWindow(cat);
      if (method === "prior_year") {
        // Fall back to the prior-year average when that slot was never uploaded.
        const fromSlot = prevRow?.[cat];
        if (typeof fromSlot === "number") return fromSlot * growth;
        const prevRows = [...prevBySlot.values()];
        const prevAvg = prevRows.length > 0 ? average(prevRows.map((r) => r[cat] ?? 0)) : 0;
        return prevAvg * growth;
      }
      if (STATUTORY.includes(cat)) return ytdRate(cat);
      if (RECURRING.includes(cat)) return lastActual(cat);
      return avgAll(cat);
    };

    // --- gross ---
    let earningsBalance: number;
    let gross: number;

    if (directGrossNet) {
      // No earning component is mapped at all (an upload carrying only gross and
      // net). Projecting the categories would yield zero, so project gross
      // directly and treat the whole of it as the earnings balance (step 11, P2).
      if (method === "average") gross = avgGrossWindow;
      else if (method === "prior_year") {
        const fromSlot = prevGrossBySlot.get(slot.index);
        const prevAvg = average([...prevGrossBySlot.values()]);
        gross = (typeof fromSlot === "number" ? fromSlot : prevAvg) * growth;
      } else gross = lastGross;
      earningsBalance = gross;
      for (const cat of EARNING_CATEGORIES) categories[cat] = 0;
    } else {
      for (const cat of EARNING_CATEGORIES) categories[cat] = amountFor(cat);
      if (method === "average") earningsBalance = windowEarningsBalance;
      else if (method === "prior_year") {
        const fromSlot = prevEarningsBalanceBySlot.get(slot.index);
        const prevAvg = average([...prevEarningsBalanceBySlot.values()]);
        earningsBalance = (typeof fromSlot === "number" ? fromSlot : prevAvg) * growth;
      } else earningsBalance = runRateEarningsBalance;
      gross = EARNING_CATEGORIES.reduce((acc, c) => acc + (categories[c] ?? 0), 0) + earningsBalance;
    }

    gross = roundMoney(gross);
    earningsBalance = roundMoney(earningsBalance);

    // --- deductions and employer costs ---
    for (const cat of STATUTORY) {
      categories[cat] =
        method === "run_rate" ? roundMoney(ytdRate(cat) * gross) : roundMoney(amountFor(cat));
    }
    categories.other_deduction = roundMoney(amountFor("other_deduction"));
    categories.absence_deduction = roundMoney(amountFor("absence_deduction"));
    categories.other_employer_cost = roundMoney(amountFor("other_employer_cost"));

    const employeeDeductions = roundMoney(employeeDeductionTotal(categories));
    const employerCosts = roundMoney(
      (categories.social_security_employer ?? 0) + (categories.other_employer_cost ?? 0),
    );

    // --- net ---
    let net: number;
    let balance: number;
    if (directGrossNet) {
      if (method === "average") net = avgNetWindow;
      else if (method === "prior_year") {
        const fromSlot = prevNetBySlot.get(slot.index);
        const prevAvg = average([...prevNetBySlot.values()]);
        net = (typeof fromSlot === "number" ? fromSlot : prevAvg) * growth;
      } else net = lastNet;
      net = roundMoney(net);
      // Keep the bridge self-consistent: whatever gross minus net is, it is the
      // unreconciled balance.
      balance = roundMoney(gross - net - employeeDeductions);
    } else {
      if (method === "average") balance = roundMoney(windowBalance);
      else if (method === "prior_year") {
        const fromSlot = prevBalanceBySlot.get(slot.index);
        const prevAvg = average([...prevBalanceBySlot.values()]);
        balance = roundMoney((typeof fromSlot === "number" ? fromSlot : prevAvg) * growth);
      } else balance = roundMoney(runRateBalance);
      net = roundMoney(gross - employeeDeductions - balance);
    }

    return { slot, gross, employeeDeductions, employerCosts, earningsBalance, balance, net, categories };
  }

  const perPeriod = remaining.map(projectSlot);
  const perEstimated = missingPast.map(projectSlot);

  return {
    method,
    methodsAvailable,
    assumptions,
    perPeriod,
    perEstimated,
    estimated: perEstimated.length > 0 ? totalsOf(perEstimated) : emptyTotals(),
    directGrossNet,
    ...(perPeriod.length > 0 ? totalsOf(perPeriod) : emptyTotals()),
  };
}

export function sumRows(rows: readonly Partial<Record<Category, number>>[]): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "number") out[k as Category] = (out[k as Category] ?? 0) + v;
    }
  }
  return out;
}

export { EARNING_CATEGORIES, EMPLOYER_COST_CATEGORIES, VARIABLE as VARIABLE_CATEGORIES };
