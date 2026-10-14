import type {
  AnnualPeriodInput,
  Category,
  CategoryTotals,
  ExpectedSlot,
  ForecastMethod,
  Money,
  PeriodKind,
  PeriodType,
} from "./types";
import { EMPLOYEE_DEDUCTION_CATEGORIES, EMPLOYER_COST_CATEGORIES, QUANTITY_CATEGORIES } from "./types";
import { classifyComponent } from "./classify";
import { buildCategoryTotals, sumCategories } from "./categoryTotals";
import { buildForecast } from "./forecast";
import { computeHeadcountFlows, type HeadcountFlows } from "./headcount";
import { computeYoY, type YoYResult } from "./yoy";
import { countSupersededUploads, dedupePeriods, generateExpectedPeriods } from "./periods";
import { normaliseFiscalStartMonth } from "./fiscal";
import { splitCoverage } from "./slots";
import * as warn from "./warnings";
import type { AnnualWarning } from "./warnings";
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
  /**
   * Department gross and net straight from SQL (step 15). Without these the
   * department cost has to be reconstructed from components, which is what led
   * to employee deductions being added on top of earnings (finding C6).
   */
  gross?: number;
  net?: number;
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
  /** Gross not accounted for by mapped earnings (step 11). */
  earningsBalance: Money;
  /** Gross minus net minus mapped deductions. */
  balance: Money;
  net: Money;
}

export interface Coverage {
  expected: number;
  uploaded: number;
  percent: number | null;
  lastPeriodEnd: string | null;
  missing: ExpectedSlot[];
  /** Past slots whose figures were estimated rather than uploaded (step 14). */
  estimatedLabels: string[];
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
  /**
   * Estimate missing past slots so "full year" means a whole year (step 14,
   * finding A7). On by default: with June missing, a 12-month budget was being
   * compared against an 11-month actual, hiding roughly USD 390K of variance.
   */
  estimateMissing?: boolean;
  /**
   * First month of the company's fiscal year, 1-12 (step 45). 1 is the calendar
   * year and the default. Every year boundary in the engine derives from this
   * through fiscal.ts.
   */
  fiscalStartMonth?: number;
}

export interface AnnualPeriodRow {
  label: string;
  kind: PeriodKind;
  gross: Money;
  net: Money;
  /** Gross plus employer costs (step 16, finding C7). */
  totalEmploymentCost: Money;
  /** Employer on-costs alone, for the statutory chart. */
  employerCosts: Money;
  headcount: number | null;
  joiners: number | null;
  leavers: number | null;
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
  warnings: AnnualWarning[];
  coverage: Coverage;
  missingLabels: string[];
  categories: CategoryTotals;
  /**
   * Per-category forecast (estimated gaps plus the future) and full year, so the
   * components table can show To date / Forecast / Full year side by side
   * (step 36, KPI 5).
   */
  categoryForecast: Partial<Record<Category, number>>;
  categoryFullYear: Partial<Record<Category, number>>;
  quantities: Partial<Record<"absence_days" | "other_quantity", number>>;
  bridge: { actual: BridgeLine; forecast: BridgeLine; fullYear: BridgeLine };
  forecastPerPeriod: { label: string; gross: Money; employeeDeductions: Money; employerCosts: Money; net: Money }[];
  periods: AnnualPeriodRow[];
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
  earningsBalance: Money,
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
    earningsBalance: roundMoney(earningsBalance),
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
  const estimateMissing = opts.estimateMissing ?? true;
  const fiscalStartMonth = normaliseFiscalStartMonth(opts.fiscalStartMonth);

  const warnings: AnnualWarning[] = [];
  if (allPeriodTypes.length > 1) warnings.push(warn.mixedCadence(allPeriodTypes));
  if (allCurrencies.length > 1) warnings.push(warn.mixedCurrency(allCurrencies));

  const superseded = countSupersededUploads(opts.periods);
  if (superseded > 0) warnings.push(warn.duplicatesIgnored(superseded));

  const deduped = dedupePeriods(opts.periods);
  let expected: ExpectedSlot[] = generateExpectedPeriods(
    periodType,
    year,
    deduped[0]?.periodStart,
    fiscalStartMonth,
  );
  if (expected.length === 0) {
    expected = generateExpectedPeriods(periodType, year, undefined, fiscalStartMonth);
  }

  // One slot model drives coverage, labels, merging and alignment (step 10).
  const coverageSplit = splitCoverage(deduped, periodType, expected);
  const actual = coverageSplit.covered.map((c) => c.period);
  const actualSlots = coverageSplit.covered.map((c) => c.slot);
  const missing = coverageSplit.missingPast;
  const remaining = coverageSplit.remaining;

  if (actual.length === 0) {
    warnings.push(warn.noData());
  } else {
    if (missing.length > 0) warnings.push(warn.missingPeriods(missing));
    if (actual.length < 3) warnings.push(warn.lowHistory(actual.length));
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
  const actualEarnings = sumEarnings(periodRows);
  const actualEarningsBalance = ytdGross - actualEarnings;

  // RECONCILIATION_GAP now covers both balancing lines (step 19).
  if (actual.length > 0 && ytdGross > 0) {
    if (Math.abs(actualBalance) / ytdGross > 0.02) {
      warnings.push(
        warn.reconciliationGap("unreconciled_deductions", actualBalance, pct(Math.abs(actualBalance), ytdGross)),
      );
    }
    if (Math.abs(actualEarningsBalance) / ytdGross > 0.02) {
      warnings.push(
        warn.reconciliationGap("other_earnings_balance", actualEarningsBalance, pct(Math.abs(actualEarningsBalance), ytdGross)),
      );
    }
  }

  const headcount = computeHeadcountFlows({
    periods: actual,
    previousYearLastEmployeeIds,
    slotIndexes: actualSlots.map((s) => s.index),
    periodsPerYear: expected.length,
  });
  const avgHeadcountYtd = headcount.avgHeadcount;
  const lastHeadcount = actual.length > 0 ? actual[actual.length - 1]?.headcount ?? 0 : 0;

  const forecastAvailable = remaining.length > 0 && actual.length > 0;
  const previousYearForForecast = previousYear
    ? {
        periods: previousYear.periods,
        expectedCount: generateExpectedPeriods(
          periodType,
          year - 1,
          previousYear.periods[0]?.periodStart,
          fiscalStartMonth,
        ).length,
      }
    : undefined;

  const forecast = buildForecast({
    year,
    periodType,
    method: forecastMethod,
    actual,
    remaining: forecastAvailable ? remaining : [],
    missingPast: estimateMissing && actual.length > 0 ? missing : [],
    elapsedSlotIndexes: actualSlots.map((s) => s.index),
    previousYear: previousYearForForecast,
    resolve,
    fiscalStartMonth,
  });

  // Full year = uploaded + estimated past gaps + forecast future (step 14).
  const est = forecast.estimated;
  const fullYearGross = roundMoney(ytdGross + est.gross + forecast.gross);
  const fullYearNet = roundMoney(ytdNet + est.net + forecast.net);
  const fullYearEmployerCosts = roundMoney(actualEmployerCosts + est.employerCosts + forecast.employerCosts);
  const fullYearDeductions = roundMoney(actualEmployeeDeductions + est.employeeDeductions + forecast.employeeDeductions);
  const fullYearBalance = roundMoney(actualBalance + est.balance + forecast.balance);
  const fullYearEarningsBalance = roundMoney(actualEarningsBalance + est.earningsBalance + forecast.earningsBalance);

  // Forecast covers both the estimated past gaps and the future, so the
  // components table's "Full year" column reconciles with the bridge.
  const categoryForecast = sumCategories([est.totals, forecast.totals]);
  const categoryFullYear = sumCategories([ytdCategories, categoryForecast]);

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
  if (mixedKeys.length > 0) warnings.push(warn.mixedSign(mixedKeys));

  const uncategorisedKeys = Array.from(new Set(periodRows.flatMap((r) => r.uncategorisedKeys)));
  if (uncategorisedKeys.length > 0) warnings.push(warn.uncategorised(uncategorisedKeys));

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

  const employerCostForPeriod = (p: AnnualPeriodInput): number => {
    const row = buildCategoryTotals(p.components, resolve).byCategory;
    return (row.social_security_employer ?? 0) + (row.other_employer_cost ?? 0);
  };

  const yoy = computeYoY({
    current: actual,
    previous: previousYear?.periods ?? [],
    forecastFullYearGross: forecastAvailable ? fullYearGross : undefined,
    employerCostFor: employerCostForPeriod,
    fiscalStartMonth,
  });

  // ---- departments (step 15, finding C6) ----
  const companyGrowth = ytdGross > 0 ? fullYearGross / ytdGross : 1;
  const departments: DepartmentView[] = (opts.departments ?? []).map((d) => {
    const components = d.components.map((c) => ({ key: c.key, total: c.total, negRows: c.negRows ?? 0, posRows: c.posRows ?? 0 }));
    const row = buildCategoryTotals(components, resolve);
    const employerCosts = EMPLOYER_COST_CATEGORIES.reduce((acc, c) => acc + (row.byCategory[c] ?? 0), 0);
    // Cost = gross + employer costs. Employee deductions are already *inside*
    // gross, so adding them (as v1 did) inflated every department by its own
    // withholdings and pushed cost per head above the company average.
    const deptGross = typeof d.gross === "number" ? d.gross : sumEarnings([row]);
    const actualDep = roundMoney(deptGross + employerCosts);
    const avgHeadcount = average(d.headcounts);
    return {
      department: d.department,
      avgHeadcount: roundMoney(avgHeadcount),
      actual: actualDep,
      forecast: roundMoney(actualDep * companyGrowth),
      shareOfTotal: null,
      costPerHead: avgHeadcount > 0 ? roundMoney(actualDep / avgHeadcount) : 0,
      absencesDays: roundMoney(row.quantities.absence_days ?? 0),
      absencesAmount: roundMoney(row.byCategory.absence_deduction ?? 0),
    };
  });
  const totalDeptActual = departments.reduce((a, d) => a + d.actual, 0);
  for (const d of departments) d.shareOfTotal = pct(d.actual, totalDeptActual);

  // ---- period series (step 16, finding C7) ----
  const slotLabelByIndex = new Map(expected.map((s) => [s.index, s.label]));
  const rows: AnnualPeriodRow[] = actual.map((p, i) => {
    const employerCosts = roundMoney(
      (periodRows[i]?.byCategory.social_security_employer ?? 0) +
        (periodRows[i]?.byCategory.other_employer_cost ?? 0),
    );
    return {
      label: slotLabelByIndex.get(actualSlots[i]?.index ?? -1) ?? p.periodEnd,
      kind: "actual" as PeriodKind,
      gross: p.gross,
      net: p.net,
      totalEmploymentCost: roundMoney(p.gross + employerCosts),
      employerCosts,
      headcount: p.headcount,
      joiners: headcount.perPeriod[i]?.joiners ?? null,
      leavers: headcount.perPeriod[i]?.leavers ?? null,
    };
  });

  for (const ep of forecast.perEstimated) {
    rows.push({
      label: ep.slot.label,
      kind: "estimated",
      gross: ep.gross,
      net: ep.net,
      totalEmploymentCost: roundMoney(ep.gross + ep.employerCosts),
      employerCosts: ep.employerCosts,
      headcount: lastHeadcount,
      joiners: null,
      leavers: null,
    });
  }
  // Any gap left unestimated is still drawn, so a missing month never silently
  // disappears from the chart (finding U8).
  if (!estimateMissing) {
    for (const slot of missing) {
      rows.push({
        label: slot.label,
        kind: "missing",
        gross: 0,
        net: 0,
        totalEmploymentCost: 0,
        employerCosts: 0,
        headcount: null,
        joiners: null,
        leavers: null,
      });
    }
  }
  for (const fp of forecast.perPeriod) {
    rows.push({
      label: fp.slot.label,
      kind: "forecast",
      gross: fp.gross,
      net: fp.net,
      totalEmploymentCost: roundMoney(fp.gross + fp.employerCosts),
      employerCosts: fp.employerCosts,
      headcount: lastHeadcount,
      joiners: null,
      leavers: null,
    });
  }
  rows.sort((a, b) => {
    const ia = expected.findIndex((s) => s.label === a.label);
    const ib = expected.findIndex((s) => s.label === b.label);
    return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
  });

  const coverage: Coverage = {
    expected: expected.length === 0 && actual.length === 0 ? 0 : expected.length,
    uploaded: actual.length,
    percent: expected.length > 0 ? pct(actual.length, expected.length) : null,
    lastPeriodEnd: actual.length > 0 ? actual[actual.length - 1]?.periodEnd ?? null : null,
    missing,
    estimatedLabels: forecast.perEstimated.map((e) => e.slot.label),
  };

  const headcountFullYearCounts = [
    ...headcount.perPeriod.map((p) => p.headcount),
    ...forecast.perEstimated.map(() => lastHeadcount),
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
    categoryForecast: categoryForecast,
    categoryFullYear: categoryFullYear,
    quantities: quantityTotals,
    bridge: {
      actual: buildBridge(ytdGross, actualEmployerCosts, actualEmployeeDeductions, actualEarningsBalance, actualBalance, ytdNet),
      forecast: buildBridge(
        roundMoney(est.gross + forecast.gross),
        roundMoney(est.employerCosts + forecast.employerCosts),
        roundMoney(est.employeeDeductions + forecast.employeeDeductions),
        roundMoney(est.earningsBalance + forecast.earningsBalance),
        roundMoney(est.balance + forecast.balance),
        roundMoney(est.net + forecast.net),
      ),
      fullYear: buildBridge(
        fullYearGross,
        fullYearEmployerCosts,
        fullYearDeductions,
        fullYearEarningsBalance,
        fullYearBalance,
        fullYearNet,
      ),
    },
    forecastPerPeriod: forecast.perPeriod.map((fp) => ({
      label: fp.slot.label,
      gross: fp.gross,
      employeeDeductions: fp.employeeDeductions,
      employerCosts: fp.employerCosts,
      net: fp.net,
    })),
    periods: rows,
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
  return rows.reduce(
    (acc, r) =>
      acc +
      (r.byCategory.income_tax ?? 0) +
      (r.byCategory.social_security_employee ?? 0) +
      (r.byCategory.other_deduction ?? 0) +
      (r.byCategory.absence_deduction ?? 0),
    0,
  );
}

function sumEmployerCosts(rows: readonly CategoryTotals[]): number {
  return rows.reduce(
    (acc, r) => acc + (r.byCategory.social_security_employer ?? 0) + (r.byCategory.other_employer_cost ?? 0),
    0,
  );
}

function sumEarnings(rows: readonly CategoryTotals[]): number {
  return rows.reduce(
    (acc, r) =>
      acc +
      (r.byCategory.base_salary ?? 0) +
      (r.byCategory.allowance ?? 0) +
      (r.byCategory.bonus_commission ?? 0) +
      (r.byCategory.overtime ?? 0) +
      (r.byCategory.other_earning ?? 0),
    0,
  );
}
