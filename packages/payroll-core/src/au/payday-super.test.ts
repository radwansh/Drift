import { describe, it, expect } from "vitest";
import { runPaydaySuperCheck, type PaydaySuperInput, type PaydaySuperRow } from "./payday-super";
import { computeQualifyingEarnings } from "./qualifying-earnings";
import { AU_SUPER_RATES, PAYDAY_SUPER_START, superRatesFor } from "./rates";

/**
 * The Payday Super check's gates, suppressions and arithmetic.
 *
 * `fixtures.test.ts` runs the real `samples/au/` files through the real
 * pipeline; this covers the cases no fixture carries — the wrong jurisdiction
 * in both directions, a blank super cell against a 0.00 one, the
 * post-sacrifice branch, the maximum contributions base, and the two timing
 * suppressions.
 */

const PERIOD = { start: "2026-10-05", end: "2026-10-18" };
const AUD = { currencyCode: "AUD" };

function row(over: Partial<PaydaySuperRow> = {}): PaydaySuperRow {
  const components = over.components ?? {
    "Ordinary Hours": 4000,
    "PAYG Withholding": 800,
    "Superannuation Guarantee": 480,
  };
  const gross = over.gross ?? 4000;
  const net = over.net ?? 3200;
  return { employeeId: "AU-0001", ...over, components, gross, net };
}

function run(over: Partial<PaydaySuperInput> = {}) {
  return runPaydaySuperCheck({
    company: AUD,
    period: PERIOD,
    rows: [row()],
    ...over,
  });
}

describe("gate 1 — the company", () => {
  it("runs for an AUD company with a super column", () => {
    const report = run();
    expect(report.status).toBe("ran");
    expect(report.basis).toContain("reporting in AUD");
    expect(report.employees[0]?.outcome).toBe("at_or_above");
  });

  it("does not run for a company Clarivo does not read as Australian", () => {
    const report = run({ company: { currencyCode: "USD" } });
    expect(report.status).toBe("not_australian");
    expect(report.employees).toEqual([]);
    expect(report.totals.below).toBe(0);
  });

  /**
   * Spec 1.1, weakness 2, and the worse of the two failures: a silent no-op
   * here means the employer with the real obligation gets nothing and never
   * learns why. `companies.currency_code` defaults to `'USD'`, so this is the
   * likelier case in practice.
   */
  it("warns, loudly, when a super column meets a non-AUD currency", () => {
    const report = run({ company: { currencyCode: "USD" } });
    expect(report.warnings).toEqual([
      {
        code: "super_column_without_aud",
        message:
          "This register has a superannuation column (Superannuation Guarantee), but the company currency " +
          "is not AUD. Set it to AUD to enable the Payday Super check.",
      },
    ]);
  });

  it("states its basis even when it refuses, so a reader can correct it", () => {
    expect(run({ company: { currencyCode: "NZD" } }).basis).toContain("reporting in NZD rather than AUD");
    expect(run({ company: { currencyCode: "AUD", country: "NZ" } }).basis).toContain("set to NZ");
  });

  it("a stated country beats the currency, in both directions", () => {
    expect(run({ company: { currencyCode: "USD", country: "AU" } }).status).toBe("ran");
    expect(run({ company: { currencyCode: "AUD", country: "NZ" } }).status).toBe("not_australian");
  });
});

describe("gate 2 — the register", () => {
  /**
   * Spec 1.1's answer to weakness 1: a New Zealand company reporting in AUD
   * has a KiwiSaver column, which matches no AU-super rule, so the check does
   * not run and nothing false is said.
   */
  it("does not run on a KiwiSaver register that happens to report in AUD", () => {
    const report = run({
      rows: [
        row({
          components: {
            "Ordinary Hours": 4000,
            "PAYE Tax": 800,
            "KiwiSaver Employer Contribution": 120,
          },
        }),
      ],
    });
    expect(report.status).toBe("no_super_column");
    expect(report.employees).toEqual([]);
  });

  /**
   * Spec 7.6. A register with no super column is **normal** — employer super
   * is frequently accrued and paid outside the payroll export — so this is an
   * `info` and never a finding.
   */
  it("says so without reporting a shortfall when there is no super column", () => {
    const report = run({
      rows: [row({ components: { "Ordinary Hours": 4000, "PAYG Withholding": 800 } })],
    });
    expect(report.status).toBe("no_super_column");
    expect(report.totals.below).toBe(0);
    expect(report.message).toContain("often paid from a separate process");
    expect(report.warnings.map((w) => w.code)).toEqual(["aud_without_super_column"]);
  });

  it("does not mistake an employer additional contribution for the guarantee", () => {
    const report = run({
      rows: [row({ components: { "Ordinary Hours": 4000, "Employer Additional Super": 120 } })],
    });
    expect(report.status).toBe("no_super_column");
  });

  /**
   * A saved category wins over the classifier everywhere else in the engine, so
   * it wins here: an admin who says the super column is something else has
   * taken it out of the check, rather than being overridden silently.
   */
  it("honours a saved category that moves the column off the employer line", () => {
    const report = run({
      answeredCategories: { "Superannuation Guarantee": "other_employer_cost" },
    });
    expect(report.status).toBe("no_super_column");
  });

  it("keeps it in the check when the saved category agrees with the rule", () => {
    const report = run({
      answeredCategories: { "Superannuation Guarantee": "social_security_employer" },
    });
    expect(report.status).toBe("ran");
    expect(report.employees[0]?.actual).toBe(480);
  });

  /**
   * The same rule on the deduction side: an override that keeps the sacrifice
   * an employee deduction leaves s 10A(1)(h) alone, and one that moves it off
   * the deduction side takes it out of the base.
   */
  it("keeps the sacrifice marker through a harmless override", () => {
    const rows = [
      row({
        gross: 3500,
        net: 2700,
        components: {
          "Ordinary Hours": 3000,
          "Salary Sacrifice (Superannuation)": 500,
          "PAYG Withholding": 800,
          "Superannuation Guarantee": 420,
        },
      }),
    ];
    const kept = run({
      rows,
      answeredCategories: { "Salary Sacrifice (Superannuation)": "other_deduction" },
    });
    expect(kept.employees[0]?.qualifyingEarnings).toBe(3500);
    expect(kept.employees[0]?.breakdown.sacrifice.addBack).toBe(500);

    const moved = run({
      rows,
      answeredCategories: { "Salary Sacrifice (Superannuation)": "other_employer_cost" },
    });
    expect(moved.employees[0]?.breakdown.sacrifice.branch).toBe("none");
    expect(moved.employees[0]?.qualifyingEarnings).toBe(3000);
  });
});

describe("commencement and the rate table", () => {
  it("does not reach back before 1 July 2026", () => {
    const report = run({ period: { start: "2026-06-01", end: "2026-06-30" } });
    expect(report.status).toBe("before_commencement");
    expect(report.message).toContain(PAYDAY_SUPER_START);
  });

  /**
   * Spec 0: statutory rates change every financial year and nothing may be
   * hard-coded without a recheck. A year the table does not carry is **not
   * checkable** rather than charged at last year's numbers.
   */
  it("refuses a financial year the rate table does not carry", () => {
    const report = run({ period: { start: "2030-10-05", end: "2030-10-18" } });
    expect(report.status).toBe("no_rate_table");
    expect(report.message).toContain("set each year and are not carried forward");
  });

  it("carries only the year it has a source for, and the s 10A(5) formula ties out", () => {
    expect(AU_SUPER_RATES.map((r) => r.financialYear)).toEqual(["2026-27"]);
    const rates = superRatesFor("2026-10-18")!;
    expect(rates.chargePercentage).toBe(12);
    // 32,500 / 12 x 100 = 270,833.33, rounded down to the nearest $10.
    const computed = Math.floor((rates.concessionalCap / rates.chargePercentage) * 100 / 10) * 10;
    expect(computed).toBe(rates.maximumContributionsBase);
    expect(rates.maximumContributionsBase).toBe(270_830);
  });
});

describe("the salary-sacrifice add-back (spec 7.3)", () => {
  /**
   * The branch that matters, because it is the one where the wrong answer is a
   * **false clearance**: earnings stated net of the sacrifice, so the
   * sacrificed amount is missing from them and must be added back.
   */
  it("adds the sacrifice back when earnings are stated net of it", () => {
    const report = run({
      rows: [
        row({
          gross: 3500,
          net: 2700,
          components: {
            "Ordinary Hours": 3000,
            "Salary Sacrifice (Superannuation)": 500,
            "PAYG Withholding": 800,
            "Superannuation Guarantee": 420,
          },
        }),
      ],
    });

    const result = report.employees[0]!;
    expect(result.breakdown.sacrifice.branch).toBe("post_sacrifice");
    expect(result.breakdown.sacrifice.addBack).toBe(500);
    expect(result.qualifyingEarnings).toBe(3500);
    expect(result.expected).toBe(420);
    expect(result.outcome).toBe("at_or_above");
    expect(result.notes.join(" ")).toContain("added back under s 10A(1)(h)");
  });

  it("is what catches the employer a gross-based test would clear", () => {
    // Same register, 10.92% of the post-sacrifice earnings — which looks like
    // 12% of gross and is 10.5% of the real base.
    const report = run({
      rows: [
        row({
          gross: 3500,
          net: 2700,
          components: {
            "Ordinary Hours": 3000,
            "Salary Sacrifice (Superannuation)": 500,
            "PAYG Withholding": 800,
            "Superannuation Guarantee": 360,
          },
        }),
      ],
    });
    const result = report.employees[0]!;
    expect(result.qualifyingEarnings).toBe(3500);
    expect(result.outcome).toBe("below");
    expect(result.shortfall).toBe(60);
    // 360 is exactly 12% of the 3,000 the earnings column shows.
    expect(360).toBe(3000 * 0.12);
  });

  it("does not add it back when the earnings already contain it", () => {
    const report = run({
      rows: [
        row({
          gross: 3500,
          net: 2200,
          components: {
            "Ordinary Hours": 3500,
            "Salary Sacrifice (Superannuation)": 500,
            "PAYG Withholding": 800,
            "Superannuation Guarantee": 420,
          },
        }),
      ],
    });
    const result = report.employees[0]!;
    expect(result.breakdown.sacrifice.branch).toBe("pre_sacrifice");
    expect(result.qualifyingEarnings).toBe(3500);
    expect(result.outcome).toBe("at_or_above");
  });

  it("refuses to pick a branch on a row that does not reconcile", () => {
    const report = run({
      rows: [
        row({
          gross: 3500,
          net: 9999,
          components: {
            "Ordinary Hours": 2000,
            "Salary Sacrifice (Superannuation)": 500,
            "Superannuation Guarantee": 420,
          },
        }),
      ],
    });
    const result = report.employees[0]!;
    expect(result.breakdown.sacrifice.branch).toBe("unreconciled");
    expect(result.outcome).toBe("not_checkable");
    expect(result.message).toContain("before or after the salary sacrifice");
  });

  it("counts the sacrifice once, never twice (s 10A(2))", () => {
    const breakdown = computeQualifyingEarnings({
      employeeId: "x",
      gross: 3500,
      net: 2200,
      components: {
        "Ordinary Hours": 3500,
        "Salary Sacrifice (Superannuation)": 500,
        "PAYG Withholding": 800,
      },
    });
    expect(breakdown.qualifyingEarnings).toBe(3500);
  });
});

describe("what one period cannot settle (spec 7.6, 7.8)", () => {
  it("tells a blank super cell from a 0.00 one", () => {
    const blank = run({
      rows: [
        row({ components: { "Ordinary Hours": 4000, "Superannuation Guarantee": null } }),
      ],
    });
    expect(blank.employees[0]?.outcome).toBe("not_checkable");
    expect(blank.employees[0]?.message).toContain("not the same as 0.00");

    const zero = run({
      rows: [row({ components: { "Ordinary Hours": 4000, "Superannuation Guarantee": 0 } })],
    });
    expect(zero.employees[0]?.outcome).toBe("below");
    expect(zero.employees[0]?.expected).toBe(480);
  });

  it("names the column that left the base incomplete", () => {
    const report = run({
      rows: [
        row({
          components: {
            "Ordinary Hours": 3000,
            "Mystery Earnings Line": 1000,
            "Superannuation Guarantee": 480,
          },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("not_checkable");
    expect(report.employees[0]?.message).toBe(
      "Qualifying earnings could not be computed because `Mystery Earnings Line` is not categorised.",
    );
  });

  /**
   * Spec 7.8.1. The maximum contributions base is annual under Payday Super,
   * so an employee past it correctly receives no further super and a single
   * late-year period would read as a 100% shortfall.
   */
  it("suppresses a verdict near the maximum contributions base", () => {
    const report = run({
      rows: [
        row({
          gross: 20_000,
          net: 20_000,
          components: { "Ordinary Hours": 20_000, "Superannuation Guarantee": 0 },
        }),
      ],
      priorQualifyingEarnings: { "AU-0001": 250_000 },
    });
    expect(report.employees[0]?.outcome).toBe("not_checkable");
    expect(report.employees[0]?.message).toContain("maximum contributions base");
    expect(report.employees[0]?.message).toContain("first uploaded period");
  });

  it("still checks an employee well inside it", () => {
    const report = run({ priorQualifyingEarnings: { "AU-0001": 40_000 } });
    expect(report.employees[0]?.outcome).toBe("at_or_above");
  });

  /**
   * Spec 7.8.3, s 18C(2) item 1: a first contribution to a particular fund has
   * 20 business days, which can cross a period boundary.
   */
  it("does not report a shortfall on a new starter's first period", () => {
    const report = run({
      rows: [
        row({
          hireDate: "2026-10-13",
          components: { "Ordinary Hours": 4000, "Superannuation Guarantee": 0 },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("not_checkable");
    expect(report.employees[0]?.message).toContain("started during the period");
  });

  it("reports one for somebody hired before the period", () => {
    const report = run({
      rows: [
        row({
          hireDate: "2019-01-01",
          components: { "Ordinary Hours": 4000, "Superannuation Guarantee": 0 },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("below");
  });

  /**
   * Spec 7.8.2, s 18C(2) item 2: where the earnings are of a kind set by
   * legislative instrument, the contribution may be received by the end of the
   * usual period for the next standard pay day. So a commission-only run
   * showing no super is not evidence of anything.
   */
  it("does not report a shortfall on a commission-only run", () => {
    const report = run({
      rows: [
        row({
          gross: 4000,
          net: 4000,
          components: { Commission: 4000, "Superannuation Guarantee": 0 },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("not_checkable");
    expect(report.employees[0]?.message).toContain("out-of-cycle payment");
  });

  it("reports one when the bonus is a minority of the base", () => {
    const report = run({
      rows: [
        row({
          gross: 5000,
          net: 5000,
          components: {
            "Ordinary Hours": 4000,
            Commission: 1000,
            "Superannuation Guarantee": 0,
          },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("below");
    expect(report.employees[0]?.expected).toBe(600);
  });
});

describe("tolerance and totals (spec 7.5)", () => {
  it("does not call a cent of rounding a finding", () => {
    const report = run({
      rows: [
        row({
          gross: 4000,
          net: 3200,
          components: {
            "Ordinary Hours": 4000,
            "PAYG Withholding": 800,
            "Superannuation Guarantee": 479.99,
          },
        }),
      ],
    });
    expect(report.employees[0]?.outcome).toBe("at_or_above");

    const twoCents = run({
      rows: [
        row({
          gross: 4000,
          net: 3200,
          components: {
            "Ordinary Hours": 4000,
            "PAYG Withholding": 800,
            "Superannuation Guarantee": 479.98,
          },
        }),
      ],
    });
    expect(twoCents.employees[0]?.outcome).toBe("below");
    expect(twoCents.employees[0]?.shortfall).toBe(0.02);
  });

  it("sums the per-employee results and counts each outcome", () => {
    const report = run({
      rows: [
        row({ employeeId: "A" }),
        row({
          employeeId: "B",
          components: { "Ordinary Hours": 4000, "Superannuation Guarantee": 400 },
        }),
        row({
          employeeId: "C",
          components: { "Ordinary Hours": 4000, "Superannuation Guarantee": null },
        }),
      ],
    });
    expect(report.totals).toEqual({
      qualifyingEarnings: 8000,
      expected: 960,
      actual: 880,
      shortfall: 80,
      below: 1,
      uncertain: 0,
      atOrAbove: 1,
      notCheckable: 1,
    });
    expect(report.message).toBe(
      "Employer super for 1 employee is below 12% of their qualifying earnings in this period. " +
        "1 employee could not be checked, with a reason given for each.",
    );
  });

  it("says so plainly when every employee is at or above", () => {
    expect(run().message).toBe(
      "Every employee on this register shows employer super at or above 12% of their qualifying earnings.",
    );
  });
});

describe("the audit trail", () => {
  it("carries every component, its treatment and the reason", () => {
    const result = run().employees[0]!;
    const lines = Object.fromEntries(
      result.breakdown.lines.map((l) => [l.key, [l.treatment, l.amount]]),
    );
    expect(lines).toEqual({
      "Ordinary Hours": ["in", 4000],
      "PAYG Withholding": ["out", 800],
      "Superannuation Guarantee": ["out", 480],
    });
    for (const line of result.breakdown.lines) {
      expect(line.reason.length, line.key).toBeGreaterThan(20);
      expect(line.rule.length, line.key).toBeGreaterThan(0);
    }
  });

  it("reports the rates it used, so a stale table is visible", () => {
    expect(run().rates?.financialYear).toBe("2026-27");
    expect(run({ company: { currencyCode: "USD" } }).rates).toBeNull();
  });
});
