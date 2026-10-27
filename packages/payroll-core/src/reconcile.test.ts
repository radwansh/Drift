import { describe, it, expect } from "vitest";
import {
  reconcileRegister,
  checkControlTotals,
  describeBreach,
  type ReconcileRow,
} from "./reconcile";
import { minorUnits } from "./money";

/** A balanced row: 1000 of earnings, 200 of deductions, 800 net. */
function balanced(employeeId: string): ReconcileRow {
  return {
    employeeId,
    gross: 1000,
    net: 800,
    components: {
      "Base Salary": 800,
      "Housing Allowance": 200,
      "Income Tax": 150,
      "Social Security Employee": 50,
    },
  };
}

describe("the two identities", () => {
  it("passes a register where both hold", () => {
    const report = reconcileRegister({ rows: [balanced("E1"), balanced("E2")] });

    expect(report.balanced).toBe(true);
    expect(report.breaches).toEqual([]);
    expect(report.totals).toEqual({
      gross: 2000,
      net: 1600,
      earnings: 2000,
      unplaced: 0,
      deductions: 400,
      employerCosts: 0,
    });
  });

  it("catches earnings that do not add up to gross", () => {
    const row = balanced("E1");
    const report = reconcileRegister({
      rows: [{ ...row, components: { ...row.components, "Housing Allowance": 500 } }],
    });

    expect(report.balanced).toBe(false);
    expect(report.breaches).toHaveLength(1);
    expect(report.breaches[0]).toMatchObject({
      code: "earnings_not_gross",
      employeeId: "E1",
      expected: 1300,
      actual: 1000,
      difference: -300,
    });
  });

  it("catches a net that does not follow from gross and the deductions", () => {
    const report = reconcileRegister({ rows: [{ ...balanced("E1"), net: 790 }] });

    // Only identity 2 is broken: the earnings still add to gross.
    expect(report.breaches.map((b) => b.code)).toEqual(["deductions_not_net"]);
    expect(report.breaches[0]).toMatchObject({ expected: 800, actual: 790, difference: -10 });
  });

  it("reports both identities when both are broken", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 900, components: { "Base Salary": 900, "Income Tax": 150 } }],
    });

    expect(report.breaches.map((b) => b.code).sort()).toEqual([
      "deductions_not_net",
      "earnings_not_gross",
    ]);
  });

  it("reports every breached row, not only the first", () => {
    const report = reconcileRegister({
      rows: [balanced("E1"), { ...balanced("E2"), net: 700 }, balanced("E3"), { ...balanced("E4"), net: 750 }],
    });

    expect(report.breaches.map((b) => b.employeeId)).toEqual(["E2", "E4"]);
  });

  it("names the file row when the caller supplies one", () => {
    const report = reconcileRegister({
      rows: [{ ...balanced("E1"), net: 790 }],
      rowNumbers: new Map([["E1", 7]]),
    });

    expect(report.breaches[0]?.row).toBe(7);
    expect(describeBreach(report.breaches[0]!)).toContain("(row 7)");
  });
});

describe("net against gross", () => {
  it("catches a net above gross even with no components mapped", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 1100, components: {} }],
    });

    // No components means neither identity can be judged; this one still must.
    expect(report.breaches.map((b) => b.code)).toContain("net_exceeds_gross");
  });

  it("catches a negative net", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: -50, components: { "Base Salary": 1000, "Income Tax": 1050 } }],
    });

    expect(report.breaches.map((b) => b.code)).toContain("negative_net");
  });

  it("accepts a zero net, which a full-month unpaid leave produces", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 0, components: { "Base Salary": 1000, "Unpaid Leave Deduction": 1000 } }],
    });

    expect(report.balanced).toBe(true);
  });
});

describe("which columns count", () => {
  it("leaves employer costs out of both identities", () => {
    // An employer's social security never passes through gross or net. Counting
    // it would make every register with an employer side fail.
    const report = reconcileRegister({
      rows: [
        {
          ...balanced("E1"),
          components: {
            ...balanced("E1").components,
            "Social Security Employer": 120,
            "Health Insurance Employer": 80,
          },
        },
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.totals.employerCosts).toBe(200);
    expect(report.totals.earnings).toBe(1000);
    expect(report.totals.deductions).toBe(200);
  });

  it("leaves quantity columns out, because days are not money", () => {
    const report = reconcileRegister({
      rows: [
        {
          ...balanced("E1"),
          components: { ...balanced("E1").components, "Absence Days": 2, "Overtime Hours": 11 },
        },
      ],
    });

    expect(report.balanced).toBe(true);
  });

  it("excludes a total column mapped as a component", () => {
    // Without this, identity 1 compares gross against gross plus its own parts.
    const report = reconcileRegister({
      rows: [
        {
          ...balanced("E1"),
          components: { ...balanced("E1").components, "Gross Salary": 1000, "Net Salary": 800 },
        },
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.excludedKeys).toContain("Gross Salary");
    expect(report.excludedKeys).toContain("Net Salary");
  });

  it("treats a missing cell as absent, not as zero", () => {
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200, Bonus: null } },
      ],
    });

    expect(report.balanced).toBe(true);
  });
});

describe("a deduction column's sign convention", () => {
  it("reads deductions written negative", () => {
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": -150, "Social Security Employee": -50 } },
        { employeeId: "E2", gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": -150, "Social Security Employee": -50 } },
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.totals.deductions).toBe(400);
  });

  it("refuses a column written both ways, rather than guessing which rows reduce net", () => {
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 850, components: { "Base Salary": 1000, "Income Tax": 150 } },
        { employeeId: "E2", gross: 1000, net: 850, components: { "Base Salary": 1000, "Income Tax": -150 } },
      ],
    });

    expect(report.balanced).toBe(false);
    expect(report.mixedSignColumns).toEqual([
      {
        componentKey: "Income Tax",
        category: "income_tax",
        positive: ["E1"],
        negative: ["E2"],
      },
    ]);
    // No verdict on identity 2 for either row: a wrong verdict is worse than a
    // declared gap. Identity 1 is unaffected and still checked.
    expect(report.breaches.map((b) => b.code)).not.toContain("deductions_not_net");
    expect(report.breaches.map((b) => b.code)).not.toContain("earnings_not_gross");
  });

  it("still judges a row the unreadable column does not touch", () => {
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 850, components: { "Base Salary": 1000, "Loan Repayment": 150 } },
        { employeeId: "E2", gross: 1000, net: 850, components: { "Base Salary": 1000, "Loan Repayment": -150 } },
        // No loan at all, and 10 out on identity 2.
        { employeeId: "E3", gross: 1000, net: 790, components: { "Base Salary": 1000, "Income Tax": 200 } },
      ],
    });

    const netBreaches = report.breaches.filter((b) => b.code === "deductions_not_net");
    expect(netBreaches.map((b) => b.employeeId)).toEqual(["E3"]);
  });

  it("does not call a column mixed over a zero", () => {
    // A zero is neither sign. Treating it as positive made any register with a
    // zero in a negative-signed column unreadable.
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 850, components: { "Base Salary": 1000, "Income Tax": -150 } },
        { employeeId: "E2", gross: 1000, net: 1000, components: { "Base Salary": 1000, "Income Tax": 0 } },
      ],
    });

    expect(report.mixedSignColumns).toEqual([]);
    expect(report.balanced).toBe(true);
  });
});

describe("tolerance is the currency's minor unit", () => {
  it("fails on one cent out", () => {
    const report = reconcileRegister({ rows: [{ ...balanced("E1"), net: 800.01 }] });
    expect(report.breaches.map((b) => b.code)).toEqual(["deductions_not_net"]);
    expect(report.breaches[0]?.difference).toBe(0.01);
  });

  it("stays silent on float noise below half a cent", () => {
    // 0.1 + 0.2 - 0.3 is 5.55e-17, and the engine's arithmetic produces that
    // class of residue constantly. A gate that fired on it would be unusable.
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 0.3, net: 0.3, components: { "Base Salary": 0.1 + 0.2 } }],
    });
    expect(report.balanced).toBe(true);
  });

  it("fails on one fils for a three-decimal currency", () => {
    const decimals = minorUnits("KWD");
    expect(decimals).toBe(3);

    const row: ReconcileRow = {
      employeeId: "E1",
      gross: 1000,
      net: 800.001,
      components: { "Base Salary": 1000, "Income Tax": 200 },
    };

    expect(reconcileRegister({ rows: [row], decimals }).breaches).toHaveLength(1);
    // The same figure read as a two-decimal currency rounds away, which is the
    // reading the engine used for every company before step 8a.
    expect(reconcileRegister({ rows: [row], decimals: 2 }).balanced).toBe(true);
  });

  it("stays silent on a tenth of a fils, which is below KWD's own unit", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 800.0001, components: { "Base Salary": 1000, "Income Tax": 200 } }],
      decimals: 3,
    });
    expect(report.balanced).toBe(true);
  });

  it("fails on one yen for a zero-decimal currency", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 801, components: { "Base Salary": 1000, "Income Tax": 200 } }],
      decimals: minorUnits("JPY"),
    });
    expect(report.breaches[0]?.difference).toBe(1);
  });
});

describe("the period control total", () => {
  it("passes when both lines agree", () => {
    expect(checkControlTotals({ gross: 2000, net: 1600 }, { gross: 2000, net: 1600 })).toEqual([]);
  });

  it("reports the line that disagrees, and by how much", () => {
    const checks = checkControlTotals({ gross: 2000, net: 1599.5 }, { gross: 2000, net: 1600 });
    expect(checks).toEqual([
      { line: "net", stated: 1599.5, computed: 1600, difference: -0.5 },
    ]);
  });

  it("reports a line left blank as absent, not as agreement", () => {
    // An unsupplied control total means the register was never checked against
    // anything outside Clarivo. Returning [] for it would read as a pass, so
    // the caller is the one that has to say "not supplied" — this only proves
    // nothing is invented here.
    expect(checkControlTotals({ gross: 2000 }, { gross: 2000, net: 1600 })).toEqual([]);
    expect(checkControlTotals({}, { gross: 1, net: 2 })).toEqual([]);
    expect(checkControlTotals({ gross: null, net: null }, { gross: 1, net: 2 })).toEqual([]);
  });

  it("uses the currency's minor unit as the tolerance", () => {
    expect(checkControlTotals({ gross: 1000.001 }, { gross: 1000, net: 0 }, 2)).toEqual([]);
    expect(checkControlTotals({ gross: 1000.001 }, { gross: 1000, net: 0 }, 3)).toHaveLength(1);
  });
});

describe("describeBreach", () => {
  it("says what the columns add up to and what the register claims", () => {
    const report = reconcileRegister({
      rows: [{ ...balanced("E1"), components: { ...balanced("E1").components, "Housing Allowance": 500 } }],
    });
    const text = describeBreach(report.breaches[0]!);

    expect(text).toContain("E1");
    expect(text).toContain("1300.00");
    expect(text).toContain("1000.00");
    expect(text).toContain("-300.00");
  });

  it("renders at the currency's precision", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 800.001, components: { "Base Salary": 1000, "Income Tax": 200 } }],
      decimals: 3,
    });
    expect(describeBreach(report.breaches[0]!, 3)).toContain("+0.001");
  });
});

describe("a money column the classifier has not placed", () => {
  /**
   * The distinction the gate turns on. "Your register does not add up" must
   * stop an upload; "Clarivo does not know what this column is" must not —
   * `samples/2025` carries such a column on purpose, and blocking on it would
   * stop the first real upload and get the check switched off.
   */
  it("counts toward gross, so a register whose only oddity is an unmapped column passes", () => {
    const report = reconcileRegister({
      rows: [
        {
          employeeId: "E1",
          gross: 1100,
          net: 900,
          components: {
            "Base Salary": 1000,
            "Expense Reimbursement": 100,
            "Income Tax": 200,
          },
        },
      ],
    });

    expect(report.balanced).toBe(true);
    expect(report.breaches).toEqual([]);
    expect(report.totals.earnings).toBe(1000);
    expect(report.totals.unplaced).toBe(100);
  });

  it("is declared, naming the column and its signed total", () => {
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1100, net: 900, components: { "Base Salary": 1000, "Expense Reimbursement": 100, "Income Tax": 200 } },
        { employeeId: "E2", gross: 1050, net: 850, components: { "Base Salary": 1000, "Expense Reimbursement": 50, "Income Tax": 200 } },
      ],
    });

    expect(report.unplacedColumns).toEqual([
      { componentKey: "Expense Reimbursement", total: 150 },
    ]);
  });

  it("does not hide a register that genuinely does not add up", () => {
    // Same shape, but gross is 100 more than everything in the row explains.
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1200, net: 900, components: { "Base Salary": 1000, "Expense Reimbursement": 100, "Income Tax": 200 } },
      ],
    });

    expect(report.balanced).toBe(false);
    expect(report.breaches.map((b) => b.code)).toContain("earnings_not_gross");
    expect(report.breaches.find((b) => b.code === "earnings_not_gross")?.difference).toBe(100);
    // Reported alongside, so the panel shows both facts rather than one.
    expect(report.unplacedColumns).toHaveLength(1);
  });

  it("leaves identity 2 to catch an unplaced column that is really a deduction", () => {
    // The pair of identities is what keeps carrying unplaced money on the
    // earnings side honest. 'Zeta Column' is a header the classifier does not
    // recognise, holding what is really a 100 deduction: gross then fails to
    // reconcile by 100 AND net misses by 100, so neither identity is fooled.
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 700, components: { "Base Salary": 1000, "Zeta Column": 100, "Income Tax": 200 } },
      ],
    });

    expect(report.unplacedColumns.map((c) => c.componentKey)).toEqual(["Zeta Column"]);
    expect(report.breaches.map((b) => b.code)).toEqual(["earnings_not_gross", "deductions_not_net"]);
  });

  it("does not list a column that is entirely zero", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 1000, net: 800, components: { "Base Salary": 1000, "Zeta Column": 0, "Income Tax": 200 } }],
    });

    expect(report.unplacedColumns).toEqual([]);
    expect(report.balanced).toBe(true);
  });
});

describe("an identity with nothing mapped on its side", () => {
  /**
   * A register mapped as ID, Gross and Net with no breakdown is a real upload:
   * the annual engine carries the whole gross as `other_earnings_balance`. The
   * gate must not refuse it, because `gross − 0` is not a statement about
   * anything — and `gross − 0 = net` would demand that net equal gross, which
   * is false of every real payroll.
   */
  it("does not check identity 1 when no earnings or unplaced column exists", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 5000, net: 4000, components: {} }],
    });

    expect(report.coverage.earnings).toBe(false);
    expect(report.breaches).toEqual([]);
    expect(report.balanced).toBe(true);
  });

  it("does not check identity 2 when no deduction column exists", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 5000, net: 4000, components: { "Base Salary": 5000 } }],
    });

    expect(report.coverage).toEqual({ earnings: true, deductions: false });
    // Identity 1 still holds and is still checked.
    expect(report.breaches).toEqual([]);
  });

  it("checks identity 1 off an unplaced column alone", () => {
    const report = reconcileRegister({
      rows: [{ employeeId: "E1", gross: 5000, net: 5000, components: { "Zeta Column": 4000 } }],
    });

    expect(report.coverage.earnings).toBe(true);
    expect(report.breaches.map((b) => b.code)).toEqual(["earnings_not_gross"]);
  });

  it("still checks net against gross with nothing mapped at all", () => {
    // These two need no components, so an unmapped register is not unchecked.
    const report = reconcileRegister({
      rows: [
        { employeeId: "E1", gross: 1000, net: 1100, components: {} },
        { employeeId: "E2", gross: 1000, net: -5, components: {} },
      ],
    });

    expect(report.coverage).toEqual({ earnings: false, deductions: false });
    expect(report.breaches.map((b) => b.code)).toEqual(["net_exceeds_gross", "negative_net"]);
  });

  it("reports coverage on a register that maps both sides", () => {
    expect(reconcileRegister({ rows: [balanced("E1")] }).coverage).toEqual({
      earnings: true,
      deductions: true,
    });
  });
});
