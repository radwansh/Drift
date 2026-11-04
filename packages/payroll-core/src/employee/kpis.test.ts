import { describe, it, expect } from "vitest";
import { generateExpectedPeriods } from "../annual/periods";
import { minorUnits } from "../money";
import { buildEmployeeFile } from "./file";
import type { Kpi, KpiSuppression } from "./types";
import { buildYear, e0002Year, monthRows, type MonthSpec } from "./test-utils";

const decimals = minorUnits("USD");

/** Unwraps a KPI the test expects to be present, failing loudly when it is not. */
function value<T>(k: Kpi<T>): T {
  if (!k.ok) throw new Error(`expected a value, got suppression "${k.reason}"`);
  return k.value;
}

function reason<T>(k: Kpi<T>): KpiSuppression {
  if (k.ok) throw new Error("expected a suppression, got a value");
  return k.reason;
}

const pay = (month: number, overrides: Partial<MonthSpec> = {}): MonthSpec => ({
  month,
  gross: 1000,
  net: 800,
  components: { "Base Salary": 1000, "Income Tax": 200 },
  ...overrides,
});

function fileFor(opts: {
  coveredMonths: readonly number[];
  paid: readonly MonthSpec[];
  externalId?: string;
  slotsPerYear?: number;
}) {
  const expected = generateExpectedPeriods("monthly", 2025);
  const { periods } = buildYear(2025, opts.coveredMonths.map((m) => pay(m)), opts.externalId ?? "E1");
  const rows = opts.paid.flatMap((spec) => monthRows(2025, spec, opts.externalId ?? "E1"));
  return buildEmployeeFile({
    externalId: opts.externalId ?? "E1",
    expected,
    periods,
    cadence: "monthly",
    currency: "USD",
    rows,
    supersededUploads: 0,
    slotsPerYear: opts.slotsPerYear ?? expected.length,
  });
}

describe("K3 coverage, and the denominator every other figure uses", () => {
  /**
   * Spec 8.2, and the arithmetic that matters most in the feature: E0001 is
   * paid January to November, 50,242.51 over 11 slots is 4,567.50; over 12
   * calendar slots it is 4,186.88, understating by exactly one twelfth. The
   * error equals the share of slots wrongly counted.
   */
  it("divides by |P(e)|, not |R|", () => {
    const monthly = 50242.51 / 11;
    const file = fileFor({
      coveredMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      paid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) =>
        pay(m, {
          gross: Number(monthly.toFixed(2)),
          net: Number((monthly * 0.8).toFixed(2)),
          components: { "Base Salary": Number(monthly.toFixed(2)) },
        }),
      ),
    });

    const coverage = file.kpis.coverage;
    expect(coverage.paid).toBe(11);
    expect(coverage.covered).toBe(12);
    expect(coverage.expected).toBe(12);
    expect(coverage.notPaid).toBe(1);
    expect(coverage.notUploaded).toBe(0);

    const mean = value(file.kpis.averageGrossPerPaidPeriod);
    expect(mean.mean).toBeCloseTo(4567.5, 1);
    // The wrong answer, kept here so the difference is on the record.
    expect(value(file.kpis.grossInRange) / 12).toBeCloseTo(4186.88, 1);

    /**
     * Ten, not eleven, and this is §7.6 rather than a denominator bug.
     *
     * December was uploaded and E0001 is not in it, so rule (c) — "the employee
     * does not appear in the next covered slot" — marks November a final
     * settlement, and §7.6 says to exclude it from K5-K8. K6's p* has always
     * been October for this fixture; before this fix K5 alone still counted
     * November, which is the disagreement the mean is now derived to prevent.
     *
     * The spec's own 8.2 arithmetic is unaffected: the gross is flat, so the
     * mean is 4,567.50 over either denominator, and the point of the example —
     * that the divisor is |P(e)| and never |R| = 12 — holds at 10 as it did at
     * 11. The slot is named on screen rather than silently dropped.
     */
    expect(file.presence.finalSettlementIndex).toBe(11);
    expect(mean.periods).toBe(10);
    expect(mean.excludedLabels).toEqual(["Nov 2025"]);
  });

  /**
   * The same arithmetic with nothing to exclude: twelve expected slots, eleven
   * uploaded and paid, December never uploaded — so no rule of §7.6 fires and
   * the denominator is the spec's eleven. |P(e)| = 11 against |R| = 12.
   */
  it("divides by eleven when the twelfth slot was never uploaded", () => {
    const monthly = 50242.51 / 11;
    const file = fileFor({
      coveredMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      paid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) =>
        pay(m, {
          gross: Number(monthly.toFixed(2)),
          net: Number((monthly * 0.8).toFixed(2)),
          components: { "Base Salary": Number(monthly.toFixed(2)) },
        }),
      ),
    });

    expect(file.kpis.coverage.expected).toBe(12);
    expect(file.kpis.coverage.notUploaded).toBe(1);
    expect(file.presence.finalSettlementIndex).toBeNull();

    const mean = value(file.kpis.averageGrossPerPaidPeriod);
    expect(mean.periods).toBe(11);
    expect(mean.excludedLabels).toEqual([]);
    expect(mean.mean).toBeCloseTo(4567.5, 1);
  });

  it("names the slots nobody uploaded, and keeps them out of covered", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3, 5, 6, 7, 8, 9, 10],
      paid: [1, 2, 3, 5, 6, 7, 8, 9].map((m) => pay(m)),
    });

    const coverage = file.kpis.coverage;
    // Apr, Nov and Dec were never uploaded.
    expect(coverage.missingLabels).toEqual(["Apr 2025", "Nov 2025", "Dec 2025"]);
    expect(coverage.notUploaded).toBe(3);
    expect(coverage.covered).toBe(9);
    expect(coverage.paid).toBe(8);
    expect(coverage.notPaidLabels).toEqual(["Oct 2025"]);
    // K5's denominator is at most the paid count, never the calendar.
    expect(value(file.kpis.averageGrossPerPaidPeriod).periods).toBeLessThanOrEqual(9);
  });

  it("counts superseded uploads so the coverage line can name them", () => {
    const expected = generateExpectedPeriods("monthly", 2025);
    const file = buildEmployeeFile({
      externalId: "E1",
      expected,
      periods: buildYear(2025, [pay(1)], "E1").periods,
      cadence: "monthly",
      currency: "USD",
      rows: monthRows(2025, pay(1), "E1"),
      supersededUploads: 1,
      slotsPerYear: 12,
    });
    expect(file.kpis.coverage.supersededUploads).toBe(1);
  });
});

describe("E0002's KPIs (spec 8.1)", () => {
  const expected = generateExpectedPeriods("monthly", 2025);
  const { periods, rows } = e0002Year();
  const file = buildEmployeeFile({
    externalId: "E0002",
    expected,
    periods,
    cadence: "monthly",
    currency: "USD",
    rows,
    supersededUploads: 0,
    slotsPerYear: 12,
  });

  it("K1, K2 and the bridge", () => {
    expect(value(file.kpis.grossInRange)).toBe(276202.12);
    expect(value(file.kpis.netInRange)).toBe(207329.56);

    const bridge = value(file.kpis.bridge);
    expect(bridge.deductions).toBe(68872.56);
    expect(bridge.netBal).toBe(0);
    expect(bridge.earnings).toBe(272597.38);
    expect(bridge.earnBal).toBe(3604.74);
    expect(bridge.balanced).toBe(true);
  });

  it("K5 mean per paid period is 23,016.84", () => {
    expect(value(file.kpis.averageGrossPerPaidPeriod).mean).toBe(23016.84);
    expect(value(file.kpis.averageGrossPerPaidPeriod).periods).toBe(12);
  });

  it("K6 recurring at the latest clean slot is December's 20,553.39", () => {
    const recurring = value(file.kpis.recurringLatest);
    expect(recurring.value).toBe(20553.39);
    expect(recurring.slotLabel).toBe("Dec 2025");
  });

  /**
   * K8 refuses to annualise anything but K6's p*. Annualising E0002's March
   * gives 483,150.24 against an actual year of 276,202.12 — a 74.9%
   * overstatement, on one row of real fixture data.
   */
  it("K8 annualises from that slot, and names it", () => {
    const annualised = value(file.kpis.annualisedRecurring);
    expect(annualised.value).toBe(246640.68);
    expect(annualised.slotsPerYear).toBe(12);
    expect(annualised.fromSlotLabel).toBe("Dec 2025");
    // What it is NOT doing.
    expect(40262.52 * 12).toBeCloseTo(483150.24, 2);
  });

  it("K9 variable share is 11.14%, with the window carried", () => {
    const share = value(file.kpis.variableShare);
    expect(share.value * 100).toBeCloseTo(11.14, 2);
    expect(share.paidPeriods).toBe(12);
  });

  it("K12 deduction rate 24.94% and income-tax ratio 20.05%", () => {
    expect(value(file.kpis.deductionRate).value * 100).toBeCloseTo(24.94, 2);
    expect(value(file.kpis.incomeTaxRatio).value * 100).toBeCloseTo(20.05, 2);
  });

  it("K13 total employment cost is 304,049.86", () => {
    const cost = value(file.kpis.totalEmploymentCost);
    expect(cost.total).toBe(304049.86);
    expect(cost.componentCount).toBe(36);
  });

  /**
   * K14 is suppressed here **on purpose**, and this is the case it exists for:
   * E0002's reimbursements are uncategorised and non-zero, so one mapped
   * employer line plus unmapped money reads as a low on-cost rate rather than
   * as missing data.
   */
  it("K14 suppresses while uncategorised money is in range", () => {
    expect(reason(file.kpis.employerOnCostRate)).toBe("uncategorised_non_zero");
  });

  it("K16 names the last paid slot", () => {
    expect(value(file.kpis.lastPaidSlot).slotLabel).toBe("Dec 2025");
    expect(file.kpis.status.kind).toBe("active");
  });
});

describe("K14 when nothing is unmapped", () => {
  it("reports the on-cost rate", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [1, 2, 3].map((m) =>
        pay(m, {
          components: {
            "Base Salary": 1000,
            "Income Tax": 200,
            "Employer Social Security": 100,
          },
        }),
      ),
    });
    expect(value(file.kpis.employerOnCostRate).value * 100).toBeCloseTo(10, 6);
  });
});

describe("KPI suppression is part of the return type", () => {
  it("no_paid_slots — a leaver opened in the current year", () => {
    /**
     * Spec F6's case, and the reason K1 is a `Kpi` rather than a number: an id
     * that exists but has nothing in this range renders a valid, empty file. A
     * 0.00 gross would read as "we paid this person nothing".
     */
    const file = fileFor({ coveredMonths: [1, 2, 3], paid: [] });
    expect(reason(file.kpis.grossInRange)).toBe("no_paid_slots");
    expect(reason(file.kpis.netInRange)).toBe("no_paid_slots");
    expect(reason(file.kpis.bridge)).toBe("no_paid_slots");
    expect(reason(file.kpis.averageGrossPerPaidPeriod)).toBe("no_paid_slots");
    expect(reason(file.kpis.recurringLatest)).toBe("no_paid_slots");
    expect(reason(file.kpis.annualisedRecurring)).toBe("no_paid_slots");
    expect(reason(file.kpis.lastPaidSlot)).toBe("no_paid_slots");
    // Coverage is never suppressed: it is the figure that says whether any
    // other figure can be trusted.
    expect(file.kpis.coverage.covered).toBe(3);
  });

  it("insufficient_history — a share over fewer than three paid periods", () => {
    const file = fileFor({ coveredMonths: [1, 2], paid: [pay(1), pay(2)] });
    expect(reason(file.kpis.variableShare)).toBe("insufficient_history");
  });

  it("duplicate_slots_excluded — every paid slot is a duplicate", () => {
    const file = fileFor({
      coveredMonths: [1],
      paid: [
        {
          ...pay(1),
          extraRows: [{ gross: 1000, net: 800, components: { "Base Salary": 1000 } }],
        },
      ],
    });
    expect(reason(file.kpis.averageGrossPerPaidPeriod)).toBe("duplicate_slots_excluded");
  });

  it("no_clean_slot — the only paid slot is a final settlement", () => {
    const file = fileFor({
      coveredMonths: [1],
      paid: [
        pay(1, {
          gross: 2500, net: 2300,
          components: { "Base Salary": 1000, "Notice Pay": 1500, "Income Tax": 200 },
        }),
      ],
    });
    expect(reason(file.kpis.recurringLatest)).toBe("no_clean_slot");
    expect(reason(file.kpis.annualisedRecurring)).toBe("no_clean_slot");
  });

  it("employer_costs_not_mapped — never 0", () => {
    /**
     * A 0 here would read as "this employee costs nothing above their salary",
     * which is a claim. The suppression says the column is not mapped, which is
     * the truth.
     */
    const file = fileFor({ coveredMonths: [1, 2, 3], paid: [1, 2, 3].map((m) => pay(m)) });
    expect(reason(file.kpis.totalEmploymentCost)).toBe("employer_costs_not_mapped");
    expect(reason(file.kpis.employerOnCostRate)).toBe("employer_costs_not_mapped");
  });

  it("uncategorised_non_zero — one mapped employer line plus unmapped money", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [1, 2, 3].map((m) =>
        pay(m, {
          gross: 1200,
          net: 1000,
          components: {
            "Base Salary": 1000,
            "Income Tax": 200,
            "Employer Social Security": 100,
            "Expense Reimbursement": 200,
          },
        }),
      ),
    });
    expect(reason(file.kpis.employerOnCostRate)).toBe("uncategorised_non_zero");
    // K13 still reports: a total is not made wrong by unmapped money sitting
    // inside gross, only a rate computed against it is.
    expect(file.kpis.totalEmploymentCost.ok).toBe(true);
  });
});

describe("K5 names the slots it excluded, and divides by what is left", () => {
  /**
   * The exclusion set and the denominator are one thing, not two.
   *
   * This assertion was `periods: 2` under a comment reading "which leaves
   * January alone as the honest denominator": `excludedLabels` named the
   * duplicate **and** the settlement while the mean divided only duplicates
   * out, so the card printed 1,750 over 2 periods directly beneath the sentence
   * "excluding Feb 2025, Mar 2025" — 75% above the 1,000 the sentence claims.
   * Spec 7.6 and 7.7 both say "Exclude it from K5-K8".
   */
  it("lists the duplicate and the final settlement, and counts neither", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1),
        {
          ...pay(2),
          extraRows: [{ gross: 1000, net: 800, components: { "Base Salary": 1000 } }],
        },
        pay(3, {
          gross: 2500, net: 2300,
          components: { "Base Salary": 1000, "Notice Pay": 1500, "Income Tax": 200 },
        }),
      ],
    });

    const mean = value(file.kpis.averageGrossPerPaidPeriod);
    expect(mean.excludedLabels.sort()).toEqual(["Feb 2025", "Mar 2025"]);
    // January alone is the honest denominator, and 1,000 the honest mean.
    expect(mean.periods).toBe(1);
    expect(mean.mean).toBe(1000);
    // The denominator can no longer disagree with the list beside it.
    expect(mean.periods).toBe(file.kpis.coverage.paid - mean.excludedLabels.length);
  });

  it("excludes a possibly prorated first slot from the mean too (§7.7)", () => {
    // A joiner hired on the 18th: January is "possibly prorated", so counting
    // it in the mean reads a part month as this person's normal pay.
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1, { gross: 580, net: 464, components: { "Base Salary": 580 }, hireDate: "2025-01-18" }),
        pay(2),
        pay(3),
      ],
    });

    expect(file.presence.possiblyProratedIndex).toBe(1);
    const mean = value(file.kpis.averageGrossPerPaidPeriod);
    expect(mean.excludedLabels).toEqual(["Jan 2025"]);
    expect(mean.periods).toBe(2);
    // 1,000, not the 860 that counting the part month gives.
    expect(mean.mean).toBe(1000);
  });

  /**
   * "Every paid period here has duplicate rows" and "the only clean period is a
   * leaver's final run" are different facts, so they get different reasons —
   * and K5 now shares K6's, because it now shares K6's exclusion set.
   */
  it("says no_clean_slot, not duplicate_slots_excluded, for a lone settlement", () => {
    const file = fileFor({
      coveredMonths: [1],
      paid: [
        pay(1, {
          gross: 2500, net: 2300,
          components: { "Base Salary": 1000, "Notice Pay": 1500, "Income Tax": 200 },
        }),
      ],
    });
    expect(reason(file.kpis.averageGrossPerPaidPeriod)).toBe("no_clean_slot");
    expect(reason(file.kpis.recurringLatest)).toBe("no_clean_slot");
  });
});

describe("K7 keeps the history whole and marks what is not comparable", () => {
  /**
   * §7.6 and §7.7 say "exclude it from K5-K8". For K7 that cannot mean
   * omission: the history answers "what was the base before July", and one that
   * silently drops the final month answers it wrongly. So the slot stays and
   * carries its reason, which is what a later ranking has to read.
   */
  it("marks the duplicate and the final settlement without dropping either", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1),
        {
          ...pay(2),
          extraRows: [{ gross: 1000, net: 800, components: { "Base Salary": 1000 } }],
        },
        pay(3, {
          gross: 2500, net: 2300,
          components: { "Base Salary": 1000, "Notice Pay": 1500, "Income Tax": 200 },
        }),
      ],
    });

    const history = value(file.kpis.baseRate);
    expect(history.perSlot.map((s) => s.slotLabel)).toEqual([
      "Jan 2025",
      "Feb 2025",
      "Mar 2025",
    ]);
    expect(history.perSlot.map((s) => s.excluded)).toEqual([
      null,
      "duplicate",
      "final_settlement",
    ]);
  });
});

describe("K11 reports quantities under their own register names", () => {
  it("never infers days or hours from the category", () => {
    /**
     * `absence_days` and `other_quantity` both hold counts, and a register with
     * an "Overtime Hours" column puts hours in `other_quantity`. So nothing
     * reads a count as a unit.
     */
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [1, 2, 3].map((m) =>
        pay(m, {
          components: {
            "Base Salary": 1000,
            "Income Tax": 200,
            "Absence Days": 1.5,
            "Overtime Hours": 8,
          },
        }),
      ),
    });

    const absence = value(file.kpis.absence);
    const keys = absence.quantities.map((q) => `${q.key}:${q.category}:${q.total}`).sort();
    expect(keys).toEqual(["Absence Days:absence_days:4.5", "Overtime Hours:other_quantity:24"]);
  });
});

describe("the slots-per-year anchor (finding F7)", () => {
  /**
   * For `weekly` and `bi_weekly`, `generateExpectedPeriods` seeds its grid from
   * `anchor ?? interval.start`, so an unanchored call counts from 1 January and
   * can be one slot out — 52 against 53. Passing the first covered period's
   * start is what makes the count right, and omitting it produces a plausible
   * wrong number rather than an error.
   */
  it("counts a weekly year from the anchor, not from 1 January", () => {
    // An unanchored call seeds the grid on 1 January and counts 52. A payroll
    // whose first period of 2026 starts on the 2nd has 53 slots in the year,
    // and the only thing that distinguishes the two is the anchor.
    const unanchored = generateExpectedPeriods("weekly", 2026).length;
    const anchored = generateExpectedPeriods("weekly", 2026, "2026-01-02").length;
    expect(unanchored).toBe(52);
    expect(anchored).toBe(53);

    // Same one-slot error on a bi-weekly cadence: 26 against 27.
    expect(generateExpectedPeriods("bi_weekly", 2026).length).toBe(26);
    expect(generateExpectedPeriods("bi_weekly", 2026, "2026-01-02").length).toBe(27);
  });

  it("K8 uses the count it is given rather than assuming twelve", () => {
    const file = fileFor({
      coveredMonths: [1, 2, 3],
      paid: [1, 2, 3].map((m) => pay(m)),
      slotsPerYear: 26,
    });
    const annualised = value(file.kpis.annualisedRecurring);
    expect(annualised.slotsPerYear).toBe(26);
    expect(annualised.value).toBe(26000);
  });
});

describe("scopes are never merged", () => {
  it("names another currency rather than adding it", () => {
    const expected = generateExpectedPeriods("monthly", 2025);
    const { periods } = buildYear(2025, [pay(1), pay(2)], "E1");
    const rows = [
      ...monthRows(2025, pay(1), "E1"),
      ...monthRows(2025, { ...pay(2), currency: "KWD" }, "E1"),
    ];

    const file = buildEmployeeFile({
      externalId: "E1",
      expected,
      periods,
      cadence: "monthly",
      currency: "USD",
      rows,
      supersededUploads: 0,
      slotsPerYear: 12,
    });

    // No FX, no "equivalent", no combined figure anywhere.
    expect(file.currency).toBe("USD");
    expect(file.otherCurrencies).toEqual(["KWD"]);
    expect(value(file.kpis.grossInRange)).toBe(1000);
    expect(file.kpis.coverage.paid).toBe(1);
  });
});
