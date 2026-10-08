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
  remaining: ExpectedSlot[];
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
  balance: Money;
  net: Money;
  categories: Partial<Record<Category, number>>;
}

export interface ForecastResult {
  method: ForecastMethod;
  methodsAvailable: ForecastMethod[];
  assumptions: string[];
  perPeriod: ForecastPeriod[];
  totals: Partial<Record<Category, Money>>;
  gross: Money;
  employeeDeductions: Money;
  employerCosts: Money;
  balance: Money;
  net: Money;
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

export function isPriorYearAvailable(prev?: PreviousYearForecast): boolean {
  if (!prev) return false;
  const remainingCount = Math.max(0, prev.expectedCount - prev.periods.length);
  return prev.periods.length >= 3 && remainingCount >= 1;
}

function computePerActual(
  actual: AnnualPeriodInput[],
  resolve: (key: string) => Category,
): { rows: Partial<Record<Category, number>>[]; balances: number[] } {
  const rows = actual.map((p) => buildCategoryTotals(p.components, resolve).byCategory);
  const balances = actual.map((p, i) => {
    const gross = p.gross;
    const net = p.net;
    const ded = employeeDeductionTotal(rows[i] ?? {});
    return gross - net - ded;
  });
  return { rows, balances };
}

export function buildForecast(opts: ForecastOptions): ForecastResult {
  const { actual, remaining, resolve } = opts;
  const { rows, balances } = computePerActual(actual, resolve);

  const methodsAvailable: ForecastMethod[] = ["run_rate", "average"];
  if (isPriorYearAvailable(opts.previousYear)) methodsAvailable.push("prior_year");

  let method: ForecastMethod = "run_rate";
  if (opts.method && methodsAvailable.includes(opts.method)) method = opts.method;

  const assumptions: string[] = [`Forecast: ${METHOD_NAMES[method]}.`];
  if (opts.method === "prior_year" && !methodsAvailable.includes("prior_year")) {
    assumptions.push("Prior-year data insufficient, fell back to run rate.");
  }

  const ytdByCategory = sumRows(rows);
  const ytdGross = actual.reduce((acc, p) => acc + p.gross, 0);
  const ytdRate = (cat: Category) => (ytdGross > 0 ? (ytdByCategory[cat] ?? 0) / ytdGross : 0);
  const avgActual = (cat: Category) => (rows.length > 0 ? (ytdByCategory[cat] ?? 0) / rows.length : 0);
  const lastActual = (cat: Category) =>
    (rows.length > 0 ? rows[rows.length - 1]?.[cat] ?? 0 : 0);

  const window = rows.slice(-3);
  const avgWindow = (cat: Category) => (window.length > 0 ? average(window.map((r) => r[cat] ?? 0)) : 0);
  const avgBalance = balances.length > 0 ? average(balances) : 0;
  const lastBalance = balances.length > 0 ? balances[balances.length - 1] ?? 0 : 0;

  let prevGrid: ExpectedSlot[] = [];
  let prevValues: (Partial<Record<Category, number>> | undefined)[] = [];
  let prevAverages: Partial<Record<Category, number>> = {};
  let growth: Partial<Record<Category, number>> = {};
  if (method === "prior_year" && opts.previousYear) {
    const py = opts.previousYear;
    prevGrid = generateExpectedPeriods(opts.periodType, opts.year - 1, py.periods[0]?.periodStart);
    const prevRows = py.periods.map((p) => buildCategoryTotals(p.components, resolve).byCategory);
    prevValues = prevGrid.map((slot) => {
      const idx = prevRows.findIndex((_, i) => py.periods[i]?.periodEnd === slot.end);
      return idx >= 0 ? prevRows[idx] : undefined;
    });
    prevAverages = divideCategories(sumRows(prevRows), Math.max(prevRows.length, 1));
    const prevElapsedTotal = (cat: Category) => {
      const total = sumRows(prevRows)[cat] ?? 0;
      return total;
    };
    for (const cat of [...EARNING_CATEGORIES, ...EMPLOYEE_DEDUCTION_CATEGORIES, ...EMPLOYER_COST_CATEGORIES]) {
      const prevTotal = prevElapsedTotal(cat);
      const currYtd = ytdByCategory[cat] ?? 0;
      growth[cat] = prevTotal > 0 ? clamp(currYtd / prevTotal, 0.5, 2) : 1;
    }
    assumptions.push("Prior-year trend applied per category and clamped to 50%–200%.");
  }

  const perPeriod: ForecastPeriod[] = remaining.map((slot) => {
    const categories: Partial<Record<Category, number>> = {};
    const prevIndex = prevGrid.findIndex((s) => s.end === slot.end);
    const prevRaw = prevIndex >= 0 ? prevValues[prevIndex] : undefined;
    const prevAvg = prevRaw ?? prevAverages;

    const baseAmountFor = (cat: Category): number => {
      if (method === "average") return avgWindow(cat);
      if (method === "prior_year") return (prevAvg[cat] ?? 0) * (growth[cat] ?? 1);
      if (STATUTORY.includes(cat)) return ytdRate(cat);
      if (RECURRING.includes(cat)) return lastActual(cat);
      return avgActual(cat);
    };

    for (const cat of EARNING_CATEGORIES) categories[cat] = baseAmountFor(cat);
    const gross = roundMoney(EARNING_CATEGORIES.reduce((acc, c) => acc + (categories[c] ?? 0), 0));

    for (const cat of STATUTORY) {
      categories[cat] =
        method === "run_rate" ? roundMoney(ytdRate(cat) * gross) : roundMoney(baseAmountFor(cat));
    }
    categories.other_deduction = roundMoney(baseAmountFor("other_deduction"));
    categories.absence_deduction = roundMoney(baseAmountFor("absence_deduction"));
    categories.other_employer_cost = roundMoney(baseAmountFor("other_employer_cost"));

    const employeeDeductions = roundMoney(employeeDeductionTotal(categories));
    const employerCosts = roundMoney(
      (categories.social_security_employer ?? 0) + (categories.other_employer_cost ?? 0),
    );
    const balance = roundMoney(method === "average" ? avgBalance : lastBalance);
    const net = roundMoney(gross - employeeDeductions - balance);

    return { slot, gross, employeeDeductions, employerCosts, balance, net, categories };
  });

  const totals = sumRows(perPeriod.map((p) => p.categories));
  const gross = roundMoney(perPeriod.reduce((a, p) => a + p.gross, 0));
  const employeeDeductions = roundMoney(perPeriod.reduce((a, p) => a + p.employeeDeductions, 0));
  const employerCosts = roundMoney(perPeriod.reduce((a, p) => a + p.employerCosts, 0));
  const balance = roundMoney(perPeriod.reduce((a, p) => a + p.balance, 0));
  const net = roundMoney(perPeriod.reduce((a, p) => a + p.net, 0));

  return { method, methodsAvailable, assumptions, perPeriod, totals, gross, employeeDeductions, employerCosts, balance, net };
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

function divideCategories(row: Partial<Record<Category, number>>, n: number): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number") out[k as Category] = v / n;
  }
  return out;
}