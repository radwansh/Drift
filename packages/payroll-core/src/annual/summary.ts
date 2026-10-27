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
import { classifyComponent, ambiguityFor } from "./classify";
import { buildCategoryTotals, sumCategories } from "./categoryTotals";
import { buildForecast, type OneOffsExcluded } from "./forecast";
import { computeHeadcountFlows, type HeadcountFlows } from "./headcount";
import { computeYoY, type YoYResult } from "./yoy";
import { countSupersededUploads, dedupePeriods, generateExpectedPeriods } from "./periods";
import { normaliseFiscalStartMonth } from "./fiscal";
import { splitCoverage } from "./slots";
import * as warn from "./warnings";
import type { AnnualWarning } from "./warnings";
import { average, pct, roundMoney } from "./math";
import { minorUnits, smallestUnit } from "../money";

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
  /**
   * One-offs inside the uploaded periods that the forecast does not repeat
   * (step 6). Already counted in `categories.byCategory` and in the actual
   * bridge; reported separately so the exclusion is named on screen rather than
   * left for the reader to notice.
   */
  oneOffsExcluded: OneOffsExcluded;
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

/**
 * The question a column raises, unless the user has already answered it
 * (step 11).
 *
 * The suppression belongs here rather than in the classifier, beside the
 * override it depends on: a saved category is the answer, so a column that has
 * one is never asked about again. Asked once per company per column.
 */
function ambiguityOfFor(saved?: Record<string, Category>) {
  return (key: string) => (saved?.[key] ? undefined : ambiguityFor(key));
}

/**
 * `decimals` is the currency's minor units (step 8a-ii). Both balancing lines
 * are rounded to the same quantum as the two sides they reconcile, which is
 * what keeps the bridge honest at three decimals: round gross to a cent and
 * `balance` to a cent, and three fils vanish with `balance` still reading zero.
 */
function buildBridge(
  gross: Money,
  employerCosts: Money,
  employeeDeductions: Money,
  earningsBalance: Money,
  balance: Money,
  net: Money,
  decimals: number,
): BridgeLine {
  const round = (value: number) => roundMoney(value, decimals);
  const g = round(gross);
  const ec = round(employerCosts);
  return {
    gross: g,
    employerCosts: ec,
    totalEmploymentCost: round(g + ec),
    employeeDeductions: round(employeeDeductions),
    earningsBalance: round(earningsBalance),
    balance: round(balance),
    net: round(net),
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
  // Derived once here and threaded down (step 8a-ii): every money figure in
  // this engine rounds to the company currency's own minor units. An unknown
  // code falls back to 2, which is what the whole engine did before.
  const decimals = minorUnits(currency);
  const round = (value: number) => roundMoney(value, decimals);
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

  const periodRows = actual.map((p) =>
    buildCategoryTotals(p.components, resolve, ambiguityOfFor(savedCategories)),
  );
  const ytdCategories = sumCategories(periodRows.map((r) => r.byCategory));
  const ytdGross = round(actual.reduce((a, p) => a + p.gross, 0));
  const ytdNet = round(actual.reduce((a, p) => a + p.net, 0));

  const quantityTotals: Partial<Record<"absence_days" | "other_quantity", number>> = {};
  for (const row of periodRows) {
    for (const q of QUANTITY_CATEGORIES) {
      const v = row.quantities[q];
      // Days, not money, so `roundMoney` keeps its two-decimal default here on
      // purpose: a JPY company's absence days must not round to whole days.
      if (typeof v === "number") quantityTotals[q] = roundMoney((quantityTotals[q] ?? 0) + v);
    }
  }

  const actualEmployeeDeductions = sumDeductions(periodRows);
  const actualEmployerCosts = sumEmployerCosts(periodRows);
  const actualBalance = ytdGross - ytdNet - actualEmployeeDeductions;
  const actualEarnings = sumEarnings(periodRows);
  const actualEarningsBalance = ytdGross - actualEarnings;

  // RECONCILIATION_GAP now covers both balancing lines (step 19).
  //
  // Step 4 adds the absolute floor beside the percentage. The percentage alone
  // let 403,335.64 sit unexplained inside a green bridge on a 20M payroll:
  // 2% of gross is money, not noise. The floor is the currency's own minor
  // unit, so anything that survives `roundMoney` is reported and float residue
  // is not — at three decimals a KWD fils counts and a tenth of one does not.
  //
  // The percentage trigger stays, because it is what the *severity* of a gap is
  // judged on and the plan asks for both.
  if (actual.length > 0 && ytdGross > 0) {
    const floor = smallestUnit(decimals);
    /**
     * Tested on the **rounded** balance, which is the figure `round()` puts in
     * the bridge a few lines down. The raw subtraction of two eight-digit
     * figures carries residue of its own — 20,000,000 − 19,999,999.999 is
     * 0.000999998 as doubles — so testing the raw value would let the bridge
     * print a fils while the warning list stayed empty. Rounding first makes
     * the two agree by construction.
     */
    const gapped = (amount: number) => {
      const rounded = Math.abs(round(amount));
      return rounded >= floor || rounded / ytdGross > 0.02;
    };

    if (gapped(actualBalance)) {
      warnings.push(
        warn.reconciliationGap("unreconciled_deductions", actualBalance, pct(Math.abs(actualBalance), ytdGross)),
      );
    }
    if (gapped(actualEarningsBalance)) {
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
    decimals,
  });

  // Full year = uploaded + estimated past gaps + forecast future (step 14).
  const est = forecast.estimated;
  const fullYearGross = round(ytdGross + est.gross + forecast.gross);
  const fullYearNet = round(ytdNet + est.net + forecast.net);
  const fullYearEmployerCosts = round(actualEmployerCosts + est.employerCosts + forecast.employerCosts);
  const fullYearDeductions = round(actualEmployeeDeductions + est.employeeDeductions + forecast.employeeDeductions);
  const fullYearBalance = round(actualBalance + est.balance + forecast.balance);
  const fullYearEarningsBalance = round(actualEarningsBalance + est.earningsBalance + forecast.earningsBalance);

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

  // An ambiguous column is uncategorised, so it would otherwise appear in both
  // warnings with two different explanations. It gets the specific question and
  // is taken out of the generic notice.
  const ambiguousByKey = new Map<string, string>();
  for (const row of periodRows) {
    for (const a of row.ambiguousKeys) ambiguousByKey.set(a.key, a.question);
  }
  const ambiguousEntries = [...ambiguousByKey].map(([key, question]) => ({ key, question }));
  if (ambiguousEntries.length > 0) warnings.push(warn.ambiguousComponents(ambiguousEntries));

  const unmatchedKeys = uncategorisedKeys.filter((k) => !ambiguousByKey.has(k));
  if (unmatchedKeys.length > 0) warnings.push(warn.uncategorised(unmatchedKeys));

  const statutory = {
    effectiveTaxRate: pct(ytdCategories.income_tax ?? 0, ytdGross),
    employeeSocialSecurityRate: pct(ytdCategories.social_security_employee ?? 0, ytdGross),
    employerOnCostRate: pct(ytdCategories.social_security_employer ?? 0, ytdGross),
    employerOnCostTotal: round(actualEmployerCosts),
  };

  const fixedMoney = round((ytdCategories.base_salary ?? 0) + (ytdCategories.allowance ?? 0) + (ytdCategories.other_earning ?? 0));
  const variableMoneyValue = (c: Category) => ytdCategories[c] ?? 0;
  const variableMoney = round(variableMoneyValue("bonus_commission") + variableMoneyValue("overtime"));
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
    decimals,
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
    const actualDep = round(deptGross + employerCosts);
    const avgHeadcount = average(d.headcounts);
    return {
      department: d.department,
      // People, not money: two decimals whatever the currency is.
      avgHeadcount: roundMoney(avgHeadcount),
      actual: actualDep,
      forecast: round(actualDep * companyGrowth),
      shareOfTotal: null,
      costPerHead: avgHeadcount > 0 ? round(actualDep / avgHeadcount) : 0,
      // Days, not money: likewise kept at the two-decimal default.
      absencesDays: roundMoney(row.quantities.absence_days ?? 0),
      absencesAmount: round(row.byCategory.absence_deduction ?? 0),
    };
  });
  const totalDeptActual = departments.reduce((a, d) => a + d.actual, 0);
  for (const d of departments) d.shareOfTotal = pct(d.actual, totalDeptActual);

  // ---- period series (step 16, finding C7) ----
  const slotLabelByIndex = new Map(expected.map((s) => [s.index, s.label]));
  const rows: AnnualPeriodRow[] = actual.map((p, i) => {
    const employerCosts = round(
      (periodRows[i]?.byCategory.social_security_employer ?? 0) +
        (periodRows[i]?.byCategory.other_employer_cost ?? 0),
    );
    return {
      label: slotLabelByIndex.get(actualSlots[i]?.index ?? -1) ?? p.periodEnd,
      kind: "actual" as PeriodKind,
      gross: p.gross,
      net: p.net,
      totalEmploymentCost: round(p.gross + employerCosts),
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
      totalEmploymentCost: round(ep.gross + ep.employerCosts),
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
      totalEmploymentCost: round(fp.gross + fp.employerCosts),
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
      // Sum across periods, not overwrite. `acc[k] = v` left byKey holding the
      // last period alone, so expanding a category showed one month under a
      // year's label, the "Uncategorised components" row contradicted the
      // "Earnings not categorised" row three lines above it in the same table,
      // and the Excel Components sheet headed "Total to date" was December.
      byKey: periodRows.reduce<Record<string, { category: Category; total: number }>>((acc, r) => {
        for (const [k, v] of Object.entries(r.byKey)) {
          const running = acc[k];
          acc[k] = { category: v.category, total: (running?.total ?? 0) + v.total };
        }
        return acc;
      }, {}),
      quantities: quantityTotals,
      mixedSignKeys: mixedKeys,
      uncategorisedKeys,
      // Carried on the summary as well as in the warning, so the category
      // manager can put the question beside the column it is about.
      ambiguousKeys: ambiguousEntries,
    },
    categoryForecast: categoryForecast,
    categoryFullYear: categoryFullYear,
    oneOffsExcluded: forecast.oneOffs,
    quantities: quantityTotals,
    bridge: {
      actual: buildBridge(
        ytdGross,
        actualEmployerCosts,
        actualEmployeeDeductions,
        actualEarningsBalance,
        actualBalance,
        ytdNet,
        decimals,
      ),
      forecast: buildBridge(
        round(est.gross + forecast.gross),
        round(est.employerCosts + forecast.employerCosts),
        round(est.employeeDeductions + forecast.employeeDeductions),
        round(est.earningsBalance + forecast.earningsBalance),
        round(est.balance + forecast.balance),
        round(est.net + forecast.net),
        decimals,
      ),
      fullYear: buildBridge(
        fullYearGross,
        fullYearEmployerCosts,
        fullYearDeductions,
        fullYearEarningsBalance,
        fullYearBalance,
        fullYearNet,
        decimals,
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
