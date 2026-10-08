import type {
  AnnualPeriodInput,
  Category,
  CategoryTotals,
  ExpectedSlot,
  ForecastMethod,
  Money,
  PeriodType,
} from "./types";
import { EMPLOYEE_DEDUCTION_CATEGORIES, EMPLOYER_COST_CATEGORIES, MONEY_CATEGORIES, QUANTITY_CATEGORIES } from "./types";
import { classifyComponent } from "./classify";
import { buildCategoryTotals, sumCategories } from "./categoryTotals";
import { buildForecast } from "./forecast";
import { computeHeadcountFlows, type HeadcountFlows } from "./headcount";
import { computeYoY, type YoYResult } from "./yoy";
import { detectMissingPeriods, dedupePeriods, futureExpectedPeriods, generateExpectedPeriods } from "./periods";
import { average, pct, roundMoney } from "./math";

export interface DepartmentTotalsInput {
  department: string;
  components: readonly {
    key: string;
    total: number;
    negRows?: number;
    posRows?: number;
  }[];
  headcounts: readonly number[];
}

export interface DepartmentView {
  department: string;
  avgHeadcount: number;
  actual: Money;
  forecast: Money;
  shareOfTotal: number | null;
  costPerHead: Money;
  absencesDays: number;
  absencesAmount: Money;
}

export interface BridgeLine {
  gross: Money;
  employerCosts: Money;
  totalEmploymentCost: Money;
  employeeDeductions: Money;
  balance: Money;
  net: Money;
}

export interface Coverage {
  expected: number;
  uploaded: number;
  percent: number | null;
  lastPeriodEnd: string | null;
  missing: ExpectedSlot[];
}

export interface AnnualSummaryOptions {
  year: number;
  periodType: PeriodType;
  currency: string;
  allPeriodTypes: PeriodType[];
  allCurrencies: string[];
  periods: AnnualPeriodInput[];
  forecastMethod: ForecastMethod | undefined;
  previousYear?: { periods: AnnualPeriodInput[] };
  previousYearLastEmployeeIds?: string[];
  savedCategories?: Record<string, Category>;
  departments?: DepartmentTotalsInput[];
}

export interface AnnualSummary {
  year: number;
  periodType: PeriodType;
  currency: string;
  allPeriodTypes: PeriodType[];
  allCurrencies: string[];
  forecastMethod: ForecastMethod;
  methodsAvailable: ForecastMethod[];
  assumptions: string[];
  warnings: string[];
  coverage: Coverage;
  missingLabels: string[];
  categories: CategoryTotals;
  quantities: Partial<Record<"absence_days" | "other_quantity", number>>;
  bridge: { actual: BridgeLine; forecast: BridgeLine; fullYear: BridgeLine };
  forecastPerPeriod: { label: string; gross: Money; employeeDeductions: Money; employerCosts: Money; net: Money }[];
  periods: { label: string; kind: "actual" | "forecast"; gross: Money; net: Money; employerCosts: Money; headcount: number | null; joiners: number | null; leavers: number | null }[];
  headcount: HeadcountFlows;
  avgHeadcountYtd: number;
  avgHeadcountFullYear: number;
  statutory: { effectiveTaxRate: number | null; employeeSocialSecurityRate: number | null; employerOnCostRate: number | null; employerOnCostTotal: Money };
  mix: { fixed: Money; variable: Money; variablePayShare: number | null; overtimePctOfBase: number | null };
  yoy: YoYResult;
  departments: DepartmentView[];
}

function resolveFor(saved?: Record<string, Category>) {
  return (key: string): Category => saved?.[key] ?? classifyComponent(key);
}

function buildBridge(
  gross: Money,
  employerCosts: Money,
  employeeDeductions: Money,
  balance: Money,
  net: Money,
): BridgeLine {
  const g = roundMoney(gross);
  const ec = roundMoney(employerCosts);
  return {
    gross: g,
    employerCosts: ec,
    totalEmploymentCost: roundMoney(g + ec),
    employeeDeductions: roundMoney(employeeDeductions),
    balance: roundMoney(balance),
    net: roundMoney(net),
  };
}

export function computeSummary(opts: AnnualSummaryOptions): AnnualSummary {
  const {
    year,
    periodType,
    currency,
    allPeriodTypes,
    allCurrencies,
    forecastMethod,
    savedCategories,
    previousYear,
    previousYearLastEmployeeIds,
  } = opts;
  const resolve = resolveFor(savedCategories);

  const warnings: string[] = [];
  if (allPeriodTypes.length > 1) warnings.push("MIXED_CADENCE: multiple pay cadences detected in the year.");
  if (allCurrencies.length > 1) warnings.push("MULTI_CURRENCY: multiple currencies detected in the year.");

  let actual = dedupePeriods(opts.periods);
  let expected: ExpectedSlot[] = generateExpectedPeriods(periodType, year, actual[0]?.periodStart);
  if (expected.length === 0) expected = generateExpectedPeriods(periodType, year);
  let missing: ExpectedSlot[] = [];
  let remaining: ExpectedSlot[] = [];

  if (actual.length === 0) {
    warnings.push("NO_DATA: no ready payroll periods found for this year and cadence.");
  } else {
    missing = detectMissingPeriods(actual, expected);
    remaining = futureExpectedPeriods(actual, expected);
    if (missing.length > 0) {
      warnings.push(`MISSING_PERIODS: ${missing.map((m) => m.label).join(", ")}`);
    }
  }

  const periodRows = actual.map((p) => buildCategoryTotals(p.components, resolve));
  const ytdCategories = sumCategories(periodRows.map((r) => r.byCategory));
  const ytdGross = roundMoney(actual.reduce((a, p) => a + p.gross, 0));
  const ytdNet = roundMoney(actual.reduce((a, p) => a + p.net, 0));
  const quantityTotals: Partial<Record<"absence_days" | "other_quantity", number>> = {};
  for (const row of periodRows) {
    for (const q of QUANTITY_CATEGORIES) {
      const v = row.quantities[q];
      if (typeof v === "number") quantityTotals[q] = roundMoney((quantityTotals[q] ?? 0) + v);
    }
  }

  const actualEmployeeDeductions = sumDeductions(periodRows);
  const actualEmployerCosts = sumEmployerCosts(periodRows);
  const actualBalance = ytdGross - ytdNet - actualEmployeeDeductions;

  if (actual.length > 0 && ytdGross > 0 && Math.abs(actualBalance) / ytdGross > 0.02) {
    warnings.push(
      `RECONCILIATION_GAP: gross minus net does not fully reconcile with the mapped employee deductions (unreconciled balance ${pct(Math.abs(actualBalance), ytdGross)?.toFixed(1) ?? "0.0"}% of gross).`,
    );
  }

  const headcount = computeHeadcountFlows(actual, previousYearLastEmployeeIds);
  const avgHeadcountYtd = headcount.avgHeadcount;
  const lastHeadcount = actual.length > 0 ? actual[actual.length - 1]?.headcount ?? 0 : 0;

  const forecastAvailable = remaining.length > 0 && actual.length > 0;
  const previousYearForForecast = previousYear
    ? {
        periods: previousYear.periods,
        expectedCount: generateExpectedPeriods(periodType, year - 1, previousYear.periods[0]?.periodStart).length,
      }
    : undefined;
  const forecast = buildForecast({
    year,
    periodType,
    method: forecastMethod,
    actual,
    remaining: forecastAvailable ? remaining : [],
    previousYear: previousYearForForecast,
    resolve,
  });

  const forecastGross = forecast.gross;
  const forecastDeductions = forecast.employeeDeductions;
  const forecastEmployerCosts = forecast.employerCosts;
  const forecastBalance = forecast.balance;
  const forecastNet = forecast.net;

  const fullYearGross = roundMoney(ytdGross + forecastGross);
  const fullYearNet = roundMoney(ytdNet + forecastNet);
  const fullYearEmployerCosts = roundMoney(actualEmployerCosts + forecastEmployerCosts);
  const fullYearDeductions = roundMoney(actualEmployeeDeductions + forecastDeductions);
  const fullYearBalance = roundMoney(actualBalance + forecastBalance);

  const signState = new Map<string, { neg: boolean; pos: boolean }>();
  for (const p of actual) {
    for (const c of p.components) {
      const s = signState.get(c.key) ?? { neg: false, pos: false };
      if (c.negRows > 0) s.neg = true;
      if (c.posRows > 0) s.pos = true;
      signState.set(c.key, s);
    }
  }
  const mixedKeys = [...signState.entries()]
    .filter(([key, s]) => s.neg && s.pos && isDedOrEmployer(resolve(key)))
    .map(([key]) => key);
  if (mixedKeys.length > 0) warnings.push(`MIXED_SIGN: ${mixedKeys.join(", ")}`);

  const uncategorisedKeys = Array.from(new Set(periodRows.flatMap((r) => r.uncategorisedKeys)));
  if (uncategorisedKeys.length > 0) warnings.push(`UNCATEGORISED: ${uncategorisedKeys.join(", ")}`);

  const statutory = {
    effectiveTaxRate: pct(ytdCategories.income_tax ?? 0, ytdGross),
    employeeSocialSecurityRate: pct(ytdCategories.social_security_employee ?? 0, ytdGross),
    employerOnCostRate: pct(ytdCategories.social_security_employer ?? 0, ytdGross),
    employerOnCostTotal: roundMoney(actualEmployerCosts),
  };

  const fixedMoney = roundMoney((ytdCategories.base_salary ?? 0) + (ytdCategories.allowance ?? 0) + (ytdCategories.other_earning ?? 0));
  const variableMoneyValue = (c: Category) => ytdCategories[c] ?? 0;
  const variableMoney = roundMoney(variableMoneyValue("bonus_commission") + variableMoneyValue("overtime"));
  const mix = {
    fixed: fixedMoney,
    variable: variableMoney,
    variablePayShare: pct(variableMoney, ytdGross),
    overtimePctOfBase: pct(variableMoneyValue("overtime"), variableMoneyValue("base_salary")),
  };

  const yoy = computeYoY(actual, previousYear?.periods ?? [], forecastAvailable ? fullYearGross : undefined);

  const departments: DepartmentView[] = (opts.departments ?? []).map((d) => {
    const components = d.components.map((c) => ({ key: c.key, total: c.total, negRows: c.negRows ?? 0, posRows: c.posRows ?? 0 }));
    const row = buildCategoryTotals(components, resolve);
    const money = MONEY_CATEGORIES.reduce((acc, c) => acc + (row.byCategory[c] ?? 0), 0);
    const avgHeadcount = average(d.headcounts);
    const actualDep = roundMoney(money);
    const growth = ytdGross > 0 ? fullYearGross / ytdGross : 1;
    return {
      department: d.department,
      avgHeadcount: roundMoney(avgHeadcount),
      actual: actualDep,
      forecast: roundMoney(actualDep * growth),
      shareOfTotal: null,
      costPerHead: avgHeadcount > 0 ? roundMoney(actualDep / avgHeadcount) : 0,
      absencesDays: row.quantities.absence_days ?? 0,
      absencesAmount: row.byCategory.absence_deduction ?? 0,
    };
  });
  const totalDeptActual = departments.reduce((a, d) => a + d.actual, 0);
  for (const d of departments) d.shareOfTotal = pct(d.actual, totalDeptActual);

  const absencesByDepartment = [...departments]
    .sort((a, b) => b.absencesDays - a.absencesDays || b.absencesAmount - a.absencesAmount)
    .slice(0, 5);

  const periodLabelFor = (end: string): string => {
    const slot = expected.find((s) => s.end === end);
    return slot ? slot.label : end;
  };

  const periods: {
    label: string;
    kind: "actual" | "forecast";
    gross: Money;
    net: Money;
    employerCosts: Money;
    headcount: number | null;
    joiners: number | null;
    leavers: number | null;
  }[] = actual.map((p, i) => ({
    label: periodLabelFor(p.periodEnd),
    kind: "actual",
    gross: p.gross,
    net: p.net,
    employerCosts: roundMoney(
      (periodRows[i]?.byCategory.social_security_employer ?? 0) +
        (periodRows[i]?.byCategory.other_employer_cost ?? 0),
    ),
    headcount: p.headcount,
    joiners: headcount.perPeriod[i]?.joiners ?? null,
    leavers: headcount.perPeriod[i]?.leavers ?? null,
  }));
  for (const fp of forecast.perPeriod) {
    periods.push({
      label: fp.slot.label,
      kind: "forecast",
      gross: fp.gross,
      net: fp.net,
      employerCosts: fp.employerCosts,
      headcount: lastHeadcount,
      joiners: null,
      leavers: null,
    });
  }

  const coverage: Coverage = {
    expected: expected.length === 0 && actual.length === 0 ? 0 : expected.length,
    uploaded: actual.length,
    percent: expected.length > 0 ? pct(actual.length, expected.length) : null,
    lastPeriodEnd: actual.length > 0 ? actual[actual.length - 1]?.periodEnd ?? null : null,
    missing,
  };

  const headcountFullYearCounts = [
    ...headcount.perPeriod.map((p) => p.headcount),
    ...forecast.perPeriod.map(() => lastHeadcount),
  ];

  return {
    year,
    periodType,
    currency,
    allPeriodTypes,
    allCurrencies,
    forecastMethod: forecast.method,
    methodsAvailable: forecast.methodsAvailable,
    assumptions: forecast.assumptions,
    warnings,
    coverage,
    missingLabels: missing.map((m) => m.label),
    categories: {
      byCategory: ytdCategories,
      byKey: periodRows.reduce<Record<string, { category: Category; total: number }>>((acc, r) => {
        for (const [k, v] of Object.entries(r.byKey)) acc[k] = v;
        return acc;
      }, {}),
      quantities: quantityTotals,
      mixedSignKeys: mixedKeys,
      uncategorisedKeys,
    },
    quantities: quantityTotals,
    bridge: {
      actual: buildBridge(ytdGross, actualEmployerCosts, actualEmployeeDeductions, actualBalance, ytdNet),
      forecast: buildBridge(forecastGross, forecastEmployerCosts, forecastDeductions, forecastBalance, forecastNet),
      fullYear: buildBridge(fullYearGross, fullYearEmployerCosts, fullYearDeductions, fullYearBalance, fullYearNet),
    },
    forecastPerPeriod: forecast.perPeriod.map((fp) => ({
      label: fp.slot.label,
      gross: fp.gross,
      employeeDeductions: fp.employeeDeductions,
      employerCosts: fp.employerCosts,
      net: fp.net,
    })),
    periods,
    headcount,
    avgHeadcountYtd,
    avgHeadcountFullYear: headcountFullYearCounts.length > 0 ? average(headcountFullYearCounts) : 0,
    statutory,
    mix,
    yoy,
    departments: [...departments].sort((a, b) => b.actual - a.actual),
  };
}

function isDedOrEmployer(category: Category): boolean {
  return EMPLOYEE_DEDUCTION_CATEGORIES.includes(category) || EMPLOYER_COST_CATEGORIES.includes(category);
}

function sumDeductions(rows: readonly CategoryTotals[]): number {
  return rows.reduce((acc, r) => {
    return (
      acc +
      (r.byCategory.income_tax ?? 0) +
      (r.byCategory.social_security_employee ?? 0) +
      (r.byCategory.other_deduction ?? 0) +
      (r.byCategory.absence_deduction ?? 0)
    );
  }, 0);
}

function sumEmployerCosts(rows: readonly CategoryTotals[]): number {
  return rows.reduce((acc, r) => {
    return acc + (r.byCategory.social_security_employer ?? 0) + (r.byCategory.other_employer_cost ?? 0);
  }, 0);
}