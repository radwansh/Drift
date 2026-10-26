import { describe, it, expect } from "vitest";
import { buildForecast, splitRunRate, VARIABLE_CATEGORIES } from "./forecast";
import { computeSummary } from "./summary";
import { applyScenario } from "./scenario";
import { classifyComponent } from "./classify";
import { generateExpectedPeriods, futureExpectedPeriods, coveredSlotIndexes } from "./periods";
import { period, monthStart } from "./test-utils";
import { endOfMonth } from "./dates";
import type { AnnualPeriodInput, Category } from "./types";

/**
 * Step 6's backtest: every cut of a real year, at category level.
 *
 * The plan asks for the variance per category rather than on gross, because the
 * defect it fixes is one that gross hides. At the March cut of samples/2025 the
 * old forecast smeared the March annual bonus across the remaining nine months
 * and read bonus +33.0% and base -6.7%, while the gross headline read only 1.4%
 * off — the two errors cancelled, so a manager was told "gross is on plan" while
 * approving a bonus line a third over.
 *
 * The figures below are the twelve samples/2025 registers, summed per column.
 * They are embedded rather than read from disk so the package keeps no file or
 * repo-layout dependency; regenerate with `pnpm samples:annual-2025` plus a
 * per-column sum. The first test asserts the year's gross against the figure the
 * audit tied out by hand, so a stale fixture fails rather than drifts.
 */
const COLUMNS = [
  "Base Salary",
  "Housing Allowance",
  "Transport Allowance",
  "Meal Allowance",
  "Performance Bonus",
  "Sales Commission",
  "Overtime Pay",
  "Expense Reimbursement",
  "Overtime Hours",
  "Absence Days",
  "Income Tax",
  "Social Security Employee",
  "Loan Repayment",
  "Unpaid Leave Deduction",
  "Social Security Employer",
  "Health Insurance Employer",
] as const;

/** [gross, net, headcount, ...one total per column, in COLUMNS order]. */
const MONTHS_2025: readonly (readonly number[])[] = [
  // jan
  [1366252.57, 1064564.09, 132, 1023763.18, 184277.38, 41800.0, 19800.0, 0.0, 54926.22, 6964.81, 34720.98, 99.0, 61.5, 215302.63, 75413.14, 9133.25, 1839.46, 117732.74, 34460.0],
  // feb
  [1393179.78, 1085545.56, 136, 1051195.36, 189215.17, 43000.0, 20400.0, 0.0, 51400.32, 5236.9, 32732.03, 97.5, 62.5, 218318.16, 77470.56, 9133.25, 2712.25, 120887.43, 35420.0],
  // mar
  [2110082.88, 1637088.78, 141, 1090830.13, 196349.43, 44700.0, 21150.0, 588886.06, 83614.21, 57739.36, 26813.69, 908.5, 34.0, 381001.19, 80443.16, 9753.87, 1795.88, 125445.43, 36800.0],
  // apr
  [1586867.14, 1237662.83, 147, 1129272.27, 203269.02, 46400.0, 22050.0, 0.0, 109447.83, 64942.33, 11485.69, 871.0, 34.0, 254119.83, 83326.33, 10177.32, 1580.83, 129866.29, 38180.0],
  // may
  [1585830.23, 1234361.08, 152, 1175411.79, 211574.12, 48000.0, 22800.0, 0.0, 112349.77, 5639.63, 10054.92, 80.5, 35.0, 250758.2, 86558.31, 10515.21, 3637.43, 135172.34, 39540.0],
  // jun
  [1621842.66, 1266042.55, 158, 1206299.69, 217133.93, 49400.0, 23700.0, 0.0, 105392.06, 5660.9, 14256.08, 105.5, 28.0, 255591.59, 88667.59, 10515.21, 1025.72, 138724.44, 40760.0],
  // jul
  [1658951.23, 1282779.49, 157, 1245972.61, 224275.11, 49100.0, 23550.0, 0.0, 106668.92, 7770.6, 1613.99, 95.5, 860.5, 264385.74, 90800.95, 10515.21, 10469.84, 143286.83, 40520.0],
  // aug
  [1564450.51, 1214262.91, 143, 1163899.37, 209501.92, 45400.0, 21450.0, 0.0, 114616.39, 8846.13, 736.7, 108.0, 831.5, 252379.85, 84645.45, 11119.25, 2043.05, 133848.4, 37460.0],
  // sep
  [1614976.96, 1256361.97, 146, 1175873.69, 211657.29, 46000.0, 21900.0, 0.0, 99736.64, 3846.15, 55963.19, 65.0, 31.5, 261242.04, 85543.52, 11119.25, 710.18, 135225.44, 38000.0],
  // oct
  [1645044.7, 1276773.61, 149, 1193017.27, 214743.14, 46800.0, 22350.0, 0.0, 114195.44, 8895.7, 45043.15, 130.5, 31.5, 266287.83, 86829.28, 11119.25, 4034.73, 137196.96, 38660.0],
  // nov
  [1867412.31, 1446572.6, 151, 1222655.97, 220078.1, 47800.0, 22650.0, 0.0, 231056.66, 81352.76, 41818.82, 1377.0, 30.5, 317148.65, 88899.52, 11076.06, 3715.48, 140605.41, 39480.0],
  // dec
  [2151891.03, 1661701.11, 151, 1231960.6, 221752.94, 48100.0, 22650.0, 344665.24, 225297.38, 11165.33, 46299.54, 178.0, 400.0, 383253.99, 89597.37, 11076.06, 6262.5, 141675.45, 39720.0],
];

const EXPECTED_2025 = generateExpectedPeriods("monthly", 2025);

function monthInput(index: number): AnnualPeriodInput {
  const row = MONTHS_2025[index]!;
  const month = index + 1;
  return period({
    periodType: "monthly",
    periodStart: monthStart(2025, month),
    periodEnd: endOfMonth(2025, month),
    gross: row[0]!,
    net: row[1]!,
    headcount: row[2]!,
    components: COLUMNS.map((key, i) => ({
      key,
      total: row[3 + i]!,
      // Every figure in these registers is positive, deductions included.
      negRows: 0,
      posRows: 1,
    })),
  });
}

const ALL_MONTHS = MONTHS_2025.map((_, i) => monthInput(i));

/** One category's twelve monthly totals, through the production classifier. */
function categorySeries(cat: Category): number[] {
  return ALL_MONTHS.map((p) => {
    let total = 0;
    for (const c of p.components) {
      if (classifyComponent(c.key) !== cat) continue;
      // Deduction categories carry the absolute value, as buildCategoryTotals does.
      total += cat === "absence_deduction" ? Math.abs(c.total) : c.total;
    }
    return total;
  });
}

function forecastAt(cut: number) {
  const actual = ALL_MONTHS.slice(0, cut);
  return buildForecast({
    year: 2025,
    periodType: "monthly",
    method: "run_rate",
    actual,
    remaining: futureExpectedPeriods(actual, EXPECTED_2025, "monthly"),
    elapsedSlotIndexes: [...coveredSlotIndexes(actual, EXPECTED_2025, "monthly")].sort((a, b) => a - b),
    resolve: classifyComponent,
  });
}

function summaryAt(cut: number) {
  return computeSummary({
    year: 2025,
    periodType: "monthly",
    currency: "USD",
    allPeriodTypes: ["monthly"],
    allCurrencies: ["USD"],
    periods: ALL_MONTHS.slice(0, cut),
    forecastMethod: "run_rate",
  });
}

/** What amountFor produced before step 6: the year-to-date mean per period. */
function smearedFullYear(series: readonly number[], cut: number): number {
  const seen = series.slice(0, cut);
  const ytd = seen.reduce((a, b) => a + b, 0);
  return ytd + (ytd / cut) * (12 - cut);
}

function fullYearAt(cat: Category, cut: number): number {
  return summaryAt(cut).categoryFullYear[cat] ?? 0;
}

const CUTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const ACTUAL_GROSS = 20_166_782.0;
const ACTUAL_BONUS = 2_342_253.14;
const ACTUAL_BASE = 13_910_151.93;

describe("step 6 backtest: samples/2025, every cut, per category", () => {
  it("the embedded fixture is the year the audit tied out", () => {
    const full = summaryAt(12);
    // The audit's figures, confirmed there by independent arithmetic over 1,763 rows.
    expect(full.bridge.actual.gross).toBeCloseTo(ACTUAL_GROSS, 2);
    expect(full.bridge.actual.net).toBeCloseTo(15_663_716.58, 2);
    expect(full.categories.byCategory.bonus_commission).toBeCloseTo(ACTUAL_BONUS, 2);
    expect(full.categories.byCategory.overtime).toBeCloseTo(268_060.6, 2);
    expect(full.categories.byCategory.base_salary).toBeCloseTo(ACTUAL_BASE, 2);
  });

  it("reproduces the error the plan recorded, and no longer produces it", () => {
    const bonus = categorySeries("bonus_commission");

    // The "before": the smeared year-to-date average at the March cut.
    expect(smearedFullYear(bonus, 3)).toBeCloseTo(3_115_307.24, 2);
    expect(((smearedFullYear(bonus, 3) - ACTUAL_BONUS) / ACTUAL_BONUS) * 100).toBeCloseTo(33.0, 1);

    // Base was 6.7% under at the same cut, and gross only 1.4% off, because the
    // fictional bonus offset the understated base. That cancellation is what
    // this step exists to stop, and why the check is per category.
    //
    // Base is a RECURRING category, held at the last actual period rather than
    // averaged, so step 6 does not touch it: its -6.7% was and remains the
    // honest run-rate reading of a year whose July merit review has not
    // happened yet. What changed is that gross no longer conceals it.
    const projectedBase = fullYearAt("base_salary", 3);
    expect(projectedBase).toBeCloseTo(12_983_259.84, 2);
    expect(((projectedBase - ACTUAL_BASE) / ACTUAL_BASE) * 100).toBeCloseTo(-6.7, 1);

    // The "after": March's bonus is held back, so the bonus line no longer
    // carries nine months of a payment nobody decided to make.
    const projectedBonus = fullYearAt("bonus_commission", 3);
    expect(projectedBonus).toBeCloseTo(1_257_296.24, 2);
    expect(projectedBonus).toBeLessThan(smearedFullYear(bonus, 3));

    // Gross is now uniformly low rather than accidentally on plan, which is the
    // honest reading of a run rate that has seen neither the July merit review
    // nor the December bonus.
    const projectedGross = summaryAt(3).bridge.fullYear.gross;
    expect(((projectedGross - ACTUAL_GROSS) / ACTUAL_GROSS) * 100).toBeCloseTo(-11.4, 1);
  });

  it("names the amount it held back at the March cut", () => {
    const f = forecastAt(3);
    // March bonus 672,500.27 less the Jan/Feb floor of 53,163.27.
    expect(f.oneOffs.byCategory.bonus_commission).toBeCloseTo(619_337.0, 2);
    // March overtime 57,739.36 less the Jan/Feb floor of 6,100.855, rounded.
    expect(f.oneOffs.byCategory.overtime).toBeCloseTo(51_638.51, 2);
    expect(f.oneOffs.total).toBeCloseTo(619_337.0 + 51_638.51, 2);
    // Absence has no spike in Jan-Mar, so nothing is held back there.
    expect(f.oneOffs.byCategory.absence_deduction).toBeUndefined();
  });

  it("projects no one-off content into any remaining period, at any cut", () => {
    for (const cut of CUTS) {
      const f = forecastAt(cut);
      for (const cat of VARIABLE_CATEGORIES) {
        const seen = categorySeries(cat).slice(0, cut);
        const split = splitRunRate(seen);
        for (const p of f.perPeriod) {
          // Precision 1: deduction categories are rounded to the minor unit on
          // the way out, so a floor of 2,275.855 is projected as 2,275.86.
          expect(p.categories[cat] ?? 0, `${cat} at cut ${cut}`).toBeCloseTo(split.recurring, 1);
        }
        // Where a one-off was found, the floor must be strictly below the mean
        // that used to be projected — otherwise nothing was actually held back.
        if (split.oneOffTotal > 0) {
          expect(split.recurring, `${cat} floor at cut ${cut}`).toBeLessThan(mean(seen));
        }
      }
    }
  });

  it("is closer to the run rate it claims to project, on mean and on worst cut", () => {
    // A within-year run rate cannot know about a December bonus it has never
    // seen, so scoring it against the full-year actual scores it on something it
    // does not claim. The target here is the level that recurred: the same split
    // applied to all twelve months, with the one-offs removed from the months
    // the forecast had not yet seen.
    const report: Partial<Record<Category, { before: number[]; after: number[] }>> = {};

    for (const cat of ["bonus_commission", "overtime", "absence_deduction"] as const) {
      const series = categorySeries(cat);
      const hindsight = splitRunRate(series);
      const before: number[] = [];
      const after: number[] = [];
      for (const cut of CUTS) {
        const ytd = series.slice(0, cut).reduce((a, b) => a + b, 0);
        const unseenRecurring = series
          .slice(cut)
          .reduce((acc, v, i) => acc + (v - (hindsight.excess[cut + i] ?? 0)), 0);
        const target = ytd + unseenRecurring;
        before.push(Math.abs((smearedFullYear(series, cut) - target) / target) * 100);
        after.push(Math.abs((fullYearAt(cat, cut) - target) / target) * 100);
      }
      report[cat] = { before, after };
    }

    // Both categories carrying one-offs in this year improve, on the average
    // across the cuts and on the single worst cut.
    for (const cat of ["bonus_commission", "overtime"] as const) {
      const r = report[cat]!;
      expect(mean(r.after), `${cat} mean error`).toBeLessThan(mean(r.before));
      expect(Math.max(...r.after), `${cat} worst cut`).toBeLessThan(Math.max(...r.before));
    }

    // Measured, not assumed. Overtime is the large win: the March-April launch
    // and the November peak were being projected into every quiet month.
    expect(mean(report.overtime!.before)).toBeCloseTo(40.5, 0);
    expect(mean(report.overtime!.after)).toBeCloseTo(5.2, 0);
    expect(mean(report.bonus_commission!.before)).toBeCloseTo(25.1, 0);
    expect(mean(report.bonus_commission!.after)).toBeCloseTo(20.5, 0);

    // Absence is a declared trade-off, not a win: its July and December peaks
    // are seasonal rather than one-off, and holding them back costs about 0.8pp
    // of mean accuracy. Asserted so the cost is on the record.
    expect(mean(report.absence_deduction!.before)).toBeCloseTo(6.8, 0);
    expect(mean(report.absence_deduction!.after)).toBeCloseTo(7.6, 0);
  });

  it("surfaces the exclusion on the summary for the UI to name", () => {
    const s = summaryAt(3);
    expect(s.oneOffsExcluded.total).toBeCloseTo(670_975.51, 2);
    expect(s.oneOffsExcluded.byCategory.bonus_commission).toBeCloseTo(619_337.0, 2);
    // The held-back amounts are still inside the actuals; the exclusion is only
    // about what gets projected forward.
    expect(s.categories.byCategory.bonus_commission).toBeCloseTo(778_826.81, 2);
    // A complete year has nothing left to forecast, so there is no exclusion.
    expect(summaryAt(12).oneOffsExcluded.total).toBe(0);
  });
});

/**
 * Step 12 asked for a recurring category to be projected per head and multiplied
 * by the headcount expected in each remaining slot, rather than carrying its
 * total, and said to prefer holding the latest headcount over extrapolating its
 * growth. Both halves were measured against this fixture before any code was
 * written, and neither is an improvement the engine can make:
 *
 *  - **Holding the latest headcount is the identity.** The level carried forward
 *    today is the last actual period's total, and the headcount being held is
 *    that same period's headcount, so `(total / heads) x heads` is the number
 *    already projected — at every cut, for every recurring category, to the cent.
 *    Nothing improves because nothing moves.
 *  - **Extrapolating the roster swaps the error's sign rather than removing it.**
 *    Base at the March cut goes from -6.7% to +4.6%, and mean absolute error gets
 *    worse on three of the four recurring categories.
 *
 * The decomposition says why: 70.9% of the March base error is heads that had not
 * been hired by March. No rule that holds the latest level can see them, and a
 * rule that guesses them is a hiring plan Clarivo does not have. See step 12 in
 * docs/PAYROLL_AUDIT_FIX_PLAN.md for what was specified in its place.
 *
 * These tests exist so the measurement is not re-litigated from the prose: if the
 * recurring projection ever moves, they fail and name the figure that moved.
 */
describe("step 12: headcount and the recurring forecast", () => {
  const HEADS = MONTHS_2025.map((r) => r[2]!);
  const RECURRING_CATS = [
    "base_salary",
    "allowance",
    "other_deduction",
    "other_employer_cost",
  ] as const satisfies readonly Category[];

  /** The engine's own recurring rule: the last actual period's total, per slot. */
  function heldTotal(cat: Category, cut: number): number {
    return categorySeries(cat)[cut - 1] ?? 0;
  }

  /** Step 12's preferred rule: per head, times the headcount held at the latest. */
  function perHeadTimesHeldHeads(cat: Category, cut: number): number {
    const heads = HEADS[cut - 1] ?? 0;
    return heads === 0 ? 0 : (heldTotal(cat, cut) / heads) * heads;
  }

  function fullYearFrom(cat: Category, cut: number, level: number): number {
    const ytd = categorySeries(cat)
      .slice(0, cut)
      .reduce((a, b) => a + b, 0);
    return ytd + (12 - cut) * level;
  }

  const actualOf = (cat: Category) => categorySeries(cat).reduce((a, b) => a + b, 0);
  const errPct = (projected: number, actual: number) => ((projected - actual) / actual) * 100;

  it("already holds the latest headcount: per head times heads is the same number", () => {
    // The two formulations are compared as levels, and the engine is checked
    // against both, so this fails if either the rule or the identity changes.
    for (const cat of RECURRING_CATS) {
      for (const cut of CUTS) {
        const held = heldTotal(cat, cut);
        const perHead = perHeadTimesHeldHeads(cat, cut);
        // Half a cent is the general claim; on this fixture the two are exact.
        expect(Math.abs(perHead - held), `${cat} level at cut ${cut}`).toBeLessThan(0.005);

        const engine = summaryAt(cut).categoryFullYear[cat] ?? 0;
        expect(engine, `${cat} engine vs held total at cut ${cut}`).toBeCloseTo(
          fullYearFrom(cat, cut, held),
          2,
        );
        expect(engine, `${cat} engine vs per head x heads at cut ${cut}`).toBeCloseTo(
          fullYearFrom(cat, cut, perHead),
          2,
        );
      }
    }

    // The headcount it holds is on the rows the dashboard draws, and the year it
    // projects ends above it: 141 heads carried through a year that closes at 151.
    const march = summaryAt(3);
    for (const row of march.periods.filter((p) => p.kind === "forecast")) {
      expect(row.headcount, `${row.label} headcount`).toBe(141);
    }
    expect(HEADS[11]).toBe(151);
  });

  it("the March base error is 71% heads not yet hired, 29% pay rate", () => {
    const base = categorySeries("base_salary");
    const ytd = base.slice(0, 3).reduce((a, b) => a + b, 0);
    const actualRest = base.slice(3).reduce((a, b) => a + b, 0);
    const headsRest = HEADS.slice(3).reduce((a, b) => a + b, 0);
    const projectedRest = 9 * heldTotal("base_salary", 3);

    expect(ytd).toBeCloseTo(3_165_788.67, 2);
    expect(actualRest).toBeCloseTo(10_744_363.26, 2);
    expect(projectedRest).toBeCloseTo(9_817_471.17, 2);
    expect(ytd + actualRest).toBeCloseTo(ACTUAL_BASE, 2);

    const shortfall = actualRest - projectedRest;
    expect(shortfall).toBeCloseTo(926_892.09, 2);

    // Apr-Dec is paid over 1,354 head-months where March's roster would have
    // been 9 x 141 = 1,269, at 7,935.28 a head against March's 7,736.38.
    expect(headsRest).toBe(1_354);
    const perHeadMarch = heldTotal("base_salary", 3) / HEADS[2]!;
    const perHeadRest = actualRest / headsRest;
    expect(perHeadMarch).toBeCloseTo(7_736.38, 2);
    expect(perHeadRest).toBeCloseTo(7_935.28, 2);

    // A payroll variance bridge over head-months and rate per head-month.
    const headcountEffect = (headsRest - 9 * HEADS[2]!) * perHeadMarch;
    const rateEffect = (perHeadRest - perHeadMarch) * headsRest;
    expect(headcountEffect).toBeCloseTo(657_592.63, 2);
    expect(rateEffect).toBeCloseTo(269_299.46, 2);
    expect(headcountEffect + rateEffect).toBeCloseTo(shortfall, 2);
    expect((headcountEffect / shortfall) * 100).toBeCloseTo(70.9, 1);

    // The ceiling on any rule that holds the latest headcount: even taking the
    // highest per-head level Jan-Mar shows (January's 7,755.78) moves the
    // full-year base error only from -6.66% to -6.49%.
    const bestPerHead = Math.max(...base.slice(0, 3).map((v, i) => v / HEADS[i]!));
    expect(bestPerHead).toBeCloseTo(7_755.78, 2);
    const ceiling = fullYearFrom("base_salary", 3, bestPerHead * HEADS[2]!);
    expect(errPct(ceiling, ACTUAL_BASE)).toBeCloseTo(-6.49, 2);
    expect(errPct(fullYearAt("base_salary", 3), ACTUAL_BASE)).toBeCloseTo(-6.66, 2);
  });

  it("extrapolating the roster swaps the error's sign and is worse on average", () => {
    // The rejected option, written out so its figures are on the record rather
    // than argued: the net flow per slot over the actual window, applied to each
    // remaining slot in turn.
    function extrapolated(cat: Category, cut: number): number {
      const heads = HEADS.slice(0, cut);
      const last = heads[cut - 1] ?? 0;
      const flow = cut > 1 ? (last - (heads[0] ?? 0)) / (cut - 1) : 0;
      const ahead = Array.from({ length: 12 - cut }, (_, i) => last + flow * (i + 1));
      const perHead = last === 0 ? 0 : heldTotal(cat, cut) / last;
      const ytd = categorySeries(cat)
        .slice(0, cut)
        .reduce((a, b) => a + b, 0);
      return ytd + perHead * ahead.reduce((a, b) => a + b, 0);
    }

    // March, the cut the audit reported: -6.66% becomes +4.60%. The same size of
    // error with the opposite sign is a compensating error, not a correction.
    expect(errPct(extrapolated("base_salary", 3), ACTUAL_BASE)).toBeCloseTo(4.6, 1);

    // Mean absolute error across every cut, per category. Worse on three of the
    // four; better only on other deductions, a loan-repayment column that does
    // not scale with headcount at all.
    const measured: Partial<Record<Category, { today: number; trend: number }>> = {};
    for (const cat of RECURRING_CATS) {
      const actual = actualOf(cat);
      measured[cat] = {
        today: mean(CUTS.map((cut) => Math.abs(errPct(fullYearAt(cat, cut), actual)))),
        trend: mean(CUTS.map((cut) => Math.abs(errPct(extrapolated(cat, cut), actual)))),
      };
    }

    expect(measured.base_salary!.today).toBeCloseTo(3.45, 1);
    expect(measured.base_salary!.trend).toBeCloseTo(3.92, 1);
    expect(measured.allowance!.today).toBeCloseTo(3.28, 1);
    expect(measured.allowance!.trend).toBeCloseTo(4.16, 1);
    expect(measured.other_employer_cost!.today).toBeCloseTo(2.86, 1);
    expect(measured.other_employer_cost!.trend).toBeCloseTo(4.84, 1);
    expect(measured.other_deduction!.today).toBeCloseTo(4.02, 1);
    expect(measured.other_deduction!.trend).toBeCloseTo(3.13, 1);

    const worse = RECURRING_CATS.filter((c) => measured[c]!.trend > measured[c]!.today);
    expect(worse).toHaveLength(3);
  });

  it("the scenario layer counts a hire once, because the forecast adds none", () => {
    // Trap 1 of step 12. The forecast holds one roster flat, so a scenario that
    // hires ten people from April adds exactly ten heads to each of the nine
    // remaining slots and nothing else. If the forecast extrapolated hiring, the
    // same scenario would pay for heads the baseline had already invented.
    const march = summaryAt(3);
    const grossPerHead = march.periods[2]!.gross / march.periods[2]!.headcount!;
    const result = applyScenario(march, { headcountChange: { fromSlotIndex: 4, people: 10 } });

    const moved = result.periods.filter((p) => p.scenarioGross !== p.baselineGross);
    expect(moved).toHaveLength(9);
    expect(result.difference.gross).toBeCloseTo(9 * 10 * grossPerHead, 1);

    // And the baseline it was applied to assumes no joiners of its own: every
    // projected slot carries the same gross.
    const forecastGross = new Set(
      march.periods.filter((p) => p.kind === "forecast").map((p) => p.gross),
    );
    expect(forecastGross.size).toBe(1);
  });
});
