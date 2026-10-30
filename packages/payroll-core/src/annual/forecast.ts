import type {
  AnnualPeriodInput,
  Category,
  CategoryTotals,
  ExpectedSlot,
  ForecastMethod,
  Money,
  PeriodType,
} from "./types";
import {
  CATEGORY_LABELS,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  EARNING_CATEGORIES,
  EMPLOYER_COST_CATEGORIES,
} from "./types";
import { buildCategoryTotals } from "./categoryTotals";
import { generateExpectedPeriods } from "./periods";
import { groupBySlot } from "./slots";
import { clamp } from "./dates";
import { average, median, roundMoney, sum } from "./math";
import { DEFAULT_MINOR_UNITS } from "../money";

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

/**
 * A period's amount is a one-off when it exceeds this multiple of the median of
 * the *other* periods (step 6).
 *
 * The comparison is leave-one-out rather than against the median of the whole
 * series, because when a large share of the window is spiky the median sits
 * between the spikes and nothing clears the bar. At the four-month cut of
 * samples/2025, March and April both carry launch overtime: the median of all
 * four is 32,352.09, 3x of which is 97,056.27, and neither 57,739.36 nor
 * 64,942.33 reaches it — so the whole launch spike projected into every
 * remaining month (+108.8% against the run rate). Leave-one-out catches both.
 */
const ONE_OFF_SPIKE_MULTIPLE = 3;

/** Below three periods a spike cannot be told from a level, so none is called. */
const ONE_OFF_MIN_PERIODS = 3;

export interface RunRateSplit {
  /** The per-period recurring level, projected into each remaining slot. */
  recurring: number;
  /** Signed excess over `recurring` per actual period; 0 where there is none. */
  excess: number[];
  /** Sum of `excess` — what the forecast deliberately does not repeat. */
  oneOffTotal: number;
}

/**
 * Split a variable category's actual periods into a recurring floor and the
 * one-offs sitting on top of it (step 6 of docs/PAYROLL_AUDIT_FIX_PLAN.md).
 *
 * v1 projected `avgAll` — the year-to-date mean — for every category that was
 * neither statutory nor recurring, so a March annual bonus was smeared across
 * every remaining month. The error hid: at the March cut of samples/2025 the
 * fictional bonus (+33.0%) cancelled the understated base (-6.7%) and the gross
 * headline read 1.4% low, so a manager was told "gross is on plan" while the
 * bonus line was a third over and the base line 7% under.
 *
 * Magnitudes, not signed values, decide what is a spike, so a large negative
 * adjustment is treated the same way as a large payment. A median of zero — a
 * category that is normally nil, which is what retro pay and severance look
 * like — makes any non-zero period a one-off, which is the intended reading.
 */
export function splitRunRate(values: readonly number[]): RunRateSplit {
  if (values.length === 0) return { recurring: 0, excess: [], oneOffTotal: 0 };
  if (values.length < ONE_OFF_MIN_PERIODS) {
    return { recurring: median(values), excess: values.map(() => 0), oneOffTotal: 0 };
  }

  const isOneOff = values.map((value, i) => {
    const others = values.filter((_, j) => j !== i);
    return Math.abs(value) > Math.abs(median(others)) * ONE_OFF_SPIKE_MULTIPLE;
  });

  const ordinary = values.filter((_, i) => !isOneOff[i]);
  const recurring = ordinary.length > 0 ? average(ordinary) : median(values);
  const excess = values.map((value, i) => (isOneOff[i] ? value - recurring : 0));
  return { recurring, excess, oneOffTotal: sum(excess) };
}

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
  /** First month of the fiscal year (step 45); 1 = calendar year. */
  fiscalStartMonth?: number;
  /**
   * The currency's minor units (step 8a-ii). Defaults to 2, so a caller that
   * does not know its currency behaves exactly as this engine did before.
   *
   * Every projected figure is derived — a per-slot forecast is rounded and then
   * summed into the full year — so rounding the slots to a coarser quantum than
   * the actuals loses money twice: once in each slot, and again in the total it
   * is supposed to tie to.
   */
  decimals?: number;
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

/**
 * One-offs found in the actual periods that the forecast does not repeat
 * (step 6). The amounts are already inside the actual category totals; this is
 * what was withheld from the projection, reported so the exclusion is visible
 * rather than implied.
 */
export interface OneOffsExcluded {
  byCategory: Partial<Record<Category, number>>;
  total: Money;
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

/**
 * Step 12a: the roster the projection held, and how it moved getting there.
 *
 * Reported, never acted on. The projection is unchanged by this — holding the
 * latest headcount is an identity with the level already carried, and
 * extrapolating the roster was measured and is worse (see
 * `warnings.forecastHoldsHeadcount` and `forecast.backtest.test.ts`). What was
 * missing was any statement that 141 heads were being carried through a year
 * that closes at 151.
 */
export interface HeldHeadcount {
  /** The headcount projected across every remaining slot. */
  held: number;
  /** The first and last headcount in the actual window. */
  first: number;
  last: number;
  /** How many actual periods the movement is measured over. */
  periods: number;
  /** How many slots the held figure is carried across. */
  remainingSlots: number;
  /** `last - first`. */
  net: number;
  /** `net` as a percentage of `first`, 0 when `first` is 0. */
  pct: number;
  /**
   * True when the movement is large enough to be worth disclosing: at least 2
   * people and at least 5% of the opening roster, with something still to
   * forecast.
   *
   * A disclosure threshold, not an error estimate. A roster that has not moved
   * needs no warning, because holding it is then the best available assumption
   * and the assumption itself is always stated.
   */
  material: boolean;
}

export interface ForecastResult extends ForecastTotals {
  method: ForecastMethod;
  methodsAvailable: ForecastMethod[];
  assumptions: string[];
  /** Step 12a. `null` when there is nothing to forecast. */
  heldHeadcount: HeldHeadcount | null;
  perPeriod: ForecastPeriod[];
  /** Estimated past slots, and their totals, kept separate from the forecast. */
  perEstimated: ForecastPeriod[];
  estimated: ForecastTotals;
  /** True when no earnings component is mapped, so gross/net are projected directly. */
  directGrossNet: boolean;
  /** One-offs held out of the projection (step 6). Empty when nothing was held out. */
  oneOffs: OneOffsExcluded;
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

function totalsOf(periods: readonly ForecastPeriod[], decimals: number): ForecastTotals {
  const round = (value: number) => roundMoney(value, decimals);
  return {
    totals: sumRows(periods.map((p) => p.categories)),
    gross: round(periods.reduce((a, p) => a + p.gross, 0)),
    employeeDeductions: round(periods.reduce((a, p) => a + p.employeeDeductions, 0)),
    employerCosts: round(periods.reduce((a, p) => a + p.employerCosts, 0)),
    earningsBalance: round(periods.reduce((a, p) => a + p.earningsBalance, 0)),
    balance: round(periods.reduce((a, p) => a + p.balance, 0)),
    net: round(periods.reduce((a, p) => a + p.net, 0)),
  };
}

export function buildForecast(opts: ForecastOptions): ForecastResult {
  const { actual, remaining, resolve } = opts;
  const decimals = opts.decimals ?? DEFAULT_MINOR_UNITS;
  const round = (value: number) => roundMoney(value, decimals);
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
      opts.fiscalStartMonth,
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

  // Step 6: a run rate is the level that recurs, so each variable category is
  // split into a floor and the one-offs above it. `VARIABLE` was declared and
  // exported here from the start and never read, which is why nothing
  // distinguished a bonus from rent.
  const variableSplits: Partial<Record<Category, RunRateSplit>> = {};
  for (const cat of VARIABLE) {
    variableSplits[cat] = splitRunRate(rows.map((r) => r[cat] ?? 0));
  }

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
      // A variable category projects its recurring floor, never the smeared
      // average that carried a one-off into every remaining period (step 6).
      if (VARIABLE.includes(cat)) return variableSplits[cat]?.recurring ?? avgAll(cat);
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

    gross = round(gross);
    earningsBalance = round(earningsBalance);

    // --- deductions and employer costs ---
    for (const cat of STATUTORY) {
      categories[cat] =
        method === "run_rate" ? round(ytdRate(cat) * gross) : round(amountFor(cat));
    }
    categories.other_deduction = round(amountFor("other_deduction"));
    categories.absence_deduction = round(amountFor("absence_deduction"));
    categories.other_employer_cost = round(amountFor("other_employer_cost"));

    const employeeDeductions = round(employeeDeductionTotal(categories));
    const employerCosts = round(
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
      net = round(net);
      // Keep the bridge self-consistent: whatever gross minus net is, it is the
      // unreconciled balance.
      balance = round(gross - net - employeeDeductions);
    } else {
      if (method === "average") balance = round(windowBalance);
      else if (method === "prior_year") {
        const fromSlot = prevBalanceBySlot.get(slot.index);
        const prevAvg = average([...prevBalanceBySlot.values()]);
        balance = round((typeof fromSlot === "number" ? fromSlot : prevAvg) * growth);
      } else balance = round(runRateBalance);
      net = round(gross - employeeDeductions - balance);
    }

    return { slot, gross, employeeDeductions, employerCosts, earningsBalance, balance, net, categories };
  }

  const perPeriod = remaining.map(projectSlot);
  const perEstimated = missingPast.map(projectSlot);

  // Only the run-rate method holds one-offs back, so it is the only one that has
  // an exclusion to declare. `average` is the average of the last three periods
  // and `prior_year` aligns last year's figures by slot — both say what they do,
  // and a slot-aligned prior-year bonus belongs in the month it was paid.
  // Reporting an exclusion that was not applied would be a wrong number of its
  // own, so the line stays empty for them, and empty when nothing was projected.
  const oneOffs: OneOffsExcluded = { byCategory: {}, total: 0 };
  if (method === "run_rate" && perPeriod.length + perEstimated.length > 0) {
    for (const cat of VARIABLE) {
      const excluded = round(variableSplits[cat]?.oneOffTotal ?? 0);
      if (excluded === 0) continue;
      oneOffs.byCategory[cat] = excluded;
      oneOffs.total = round(oneOffs.total + excluded);
    }
  }
  if (oneOffs.total !== 0) {
    // No figure in the prose: payroll-core has no currency, and an unlabelled
    // amount on screen is the bug step 8 is about. The amount travels in
    // `oneOffs` for the UI to format.
    const names = Object.keys(oneOffs.byCategory)
      .map((c) => CATEGORY_LABELS[c as Category].toLowerCase())
      .join(", ");
    assumptions.push(
      `One-offs in ${names} are counted in the period they were paid and are not projected forward.`,
    );
  }

  /**
   * Step 12a: state the roster the projection assumed.
   *
   * Last, not an average: the recurring level carried forward is the last
   * actual period's total, so the headcount that level covers is that same
   * period's. Pushed after the one-off note so the forecast's own method and
   * exclusions read first, and the roster assumption last.
   */
  const heldHeadcount = measureHeldHeadcount(actual, remaining.length);
  if (heldHeadcount) {
    assumptions.push(
      `Headcount held at ${heldHeadcount.held} for the remaining ` +
        `${heldHeadcount.remainingSlots} ${heldHeadcount.remainingSlots === 1 ? "period" : "periods"}: ` +
        `no joiners or leavers are assumed.`,
    );
  }

  return {
    method,
    methodsAvailable,
    assumptions,
    heldHeadcount,
    perPeriod,
    perEstimated,
    estimated: perEstimated.length > 0 ? totalsOf(perEstimated, decimals) : emptyTotals(),
    directGrossNet,
    oneOffs,
    ...(perPeriod.length > 0 ? totalsOf(perPeriod, decimals) : emptyTotals()),
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

/** Step 12a: at least this many people, and this share of the opening roster. */
const MATERIAL_HEADS = 2;
const MATERIAL_SHARE = 0.05;

/**
 * Step 12a: the roster the projection held, and how it moved.
 *
 * `null` when there is nothing to forecast or no actual period to hold — there
 * is then no assumption to state.
 *
 * The movement is first-to-last across the actual window, which is a fact about
 * the uploaded periods. Deliberately not a projection of it: the net flow
 * applied forward was measured and is worse than holding (see
 * `forecast.backtest.test.ts`), so presenting it as "how far out the forecast
 * is" would be asserting the rule this step rejected.
 */
export function measureHeldHeadcount(
  actual: readonly AnnualPeriodInput[],
  remainingSlots: number,
): HeldHeadcount | null {
  if (actual.length === 0 || remainingSlots === 0) return null;

  const first = actual[0]?.headcount ?? 0;
  const last = actual[actual.length - 1]?.headcount ?? 0;
  const net = last - first;
  const pct = first > 0 ? (net / first) * 100 : 0;

  return {
    held: last,
    first,
    last,
    periods: actual.length,
    remainingSlots,
    net,
    pct,
    material:
      actual.length >= 2 &&
      Math.abs(net) >= MATERIAL_HEADS &&
      first > 0 &&
      Math.abs(net) / first >= MATERIAL_SHARE,
  };
}
