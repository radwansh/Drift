import { describe, it, expect } from "vitest";
import { generateExpectedPeriods } from "../annual/periods";
import { minorUnits } from "../money";
import { buildEmployeeSlots, paidSlots } from "./slots";
import { sumSlots } from "./totals";
import { resolveEmployeeCategory, ambiguityOfFor } from "./file";
import { e0002Year, E0002_GROSS } from "./test-utils";

/**
 * Spec 8.1's worked example, to the cent (steps C2 and C3).
 *
 * This is the test that discharges blocking gap B1. Every figure below is one
 * the spec computed from `samples/2025` rather than assumed, so a change that
 * breaks the per-employee bridge breaks an assertion with a known-real number
 * on the other side of it.
 */

const expected = generateExpectedPeriods("monthly", 2025);
const decimals = minorUnits("USD");

function slotsFor(months?: readonly number[]) {
  const { periods, rows } = e0002Year(months ? { months } : {});
  return buildEmployeeSlots({
    expected,
    periods,
    cadence: "monthly",
    rows,
    resolve: resolveEmployeeCategory(),
    ambiguityOf: ambiguityOfFor(),
    decimals,
  });
}

describe("E0002, FY2025, USD, monthly (spec 8.1)", () => {
  const slots = slotsFor();
  const paid = paidSlots(slots);

  it("places all twelve months on their own slot", () => {
    expect(slots).toHaveLength(12);
    expect(paid).toHaveLength(12);
    expect(paid.map((s) => s.slot.label)).toEqual([
      "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025", "Jun 2025",
      "Jul 2025", "Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025",
    ]);
    expect(paid.map((s) => s.gross)).toEqual([...E0002_GROSS]);
  });

  it("K1 gross paid is 276,202.12", () => {
    expect(sumSlots(paid, (s) => s.gross, decimals)).toBe(276202.12);
  });

  it("K2 net paid is 207,329.56", () => {
    expect(sumSlots(paid, (s) => s.net, decimals)).toBe(207329.56);
  });

  it("D, the mapped employee deductions, is 68,872.56", () => {
    // Income tax 55,372.56 plus employee social security 13,500.00
    // (1,125.00 x 12), which is also exactly gross minus net.
    expect(sumSlots(paid, (s) => s.deductions, decimals)).toBe(68872.56);
    expect(
      sumSlots(paid, (s) => s.byCategory.income_tax ?? 0, decimals),
    ).toBe(55372.56);
    expect(
      sumSlots(paid, (s) => s.byCategory.social_security_employee ?? 0, decimals),
    ).toBe(13500.0);
  });

  it("netBal is 0.00, so the net identity holds exactly", () => {
    expect(sumSlots(paid, (s) => s.netBal, decimals)).toBe(0);
    for (const slot of paid) expect(slot.netBal).toBe(0);
  });

  /**
   * The reason B1 blocks sign-off. Without the balancing line, "total earnings"
   * reads 272,597.38 against a gross of 276,202.12 and nothing on screen
   * explains the difference — 1.3% of this person's year, silently gone.
   */
  it("earnBal is 3,604.74, the reimbursements the classifier cannot place", () => {
    expect(sumSlots(paid, (s) => s.earnings, decimals)).toBe(272597.38);
    expect(sumSlots(paid, (s) => s.earnBal, decimals)).toBe(3604.74);

    // And it is only non-zero in the three months that carry one.
    const nonZero = paid.filter((s) => s.earnBal !== 0).map((s) => [s.slot.label, s.earnBal]);
    expect(nonZero).toEqual([
      ["Sep 2025", 1906.38],
      ["Nov 2025", 786.46],
      ["Dec 2025", 911.9],
    ]);
  });

  it("recurring is 241,827.18 and variable is 30,770.20", () => {
    expect(sumSlots(paid, (s) => s.recurring, decimals)).toBe(241827.18);
    expect(sumSlots(paid, (s) => s.variable, decimals)).toBe(30770.2);
  });

  /** The identity the whole file rests on. */
  it("recurring + variable + earnBal = K1", () => {
    const recurring = sumSlots(paid, (s) => s.recurring, decimals);
    const variable = sumSlots(paid, (s) => s.variable, decimals);
    const earnBal = sumSlots(paid, (s) => s.earnBal, decimals);
    expect(Number((recurring + variable + earnBal).toFixed(2))).toBe(276202.12);
  });

  it("employer costs are 27,847.74", () => {
    expect(sumSlots(paid, (s) => s.employerCosts, decimals)).toBe(27847.74);
  });

  /**
   * Spec 8.1's July event, stated per component. The run-rate percentage is not
   * the increase percentage, because two of the four allowances are flat —
   * which is exactly why a rate variance must be named per component and never
   * inferred from gross.
   */
  it("reads the July uplift per component, not from gross", () => {
    const june = paid[5];
    const july = paid[6];
    if (!june || !july) throw new Error("expected June and July slots");

    expect(june.byKey["Base Salary"]?.total).toBe(16187.41);
    expect(july.byKey["Base Salary"]?.total).toBe(16867.28);
    expect(Number((july.byKey["Base Salary"]!.total - june.byKey["Base Salary"]!.total).toFixed(2)))
      .toBe(679.87);

    expect(june.byKey["Housing Allowance"]?.total).toBe(2913.73);
    expect(july.byKey["Housing Allowance"]?.total).toBe(3036.11);

    // Both moved 4.20%.
    const basePct = ((16867.28 - 16187.41) / 16187.41) * 100;
    const housingPct = ((3036.11 - 2913.73) / 2913.73) * 100;
    expect(basePct).toBeCloseTo(4.2, 2);
    expect(housingPct).toBeCloseTo(4.2, 2);

    // Transport and meal are flat.
    expect(july.byKey["Transport Allowance"]?.total).toBe(400);
    expect(july.byKey["Meal Allowance"]?.total).toBe(250);

    // Recurring pay moved 4.06%, which is a different number.
    expect(june.recurring).toBe(19751.14);
    expect(july.recurring).toBe(20553.39);
    expect(((20553.39 - 19751.14) / 19751.14) * 100).toBeCloseTo(4.06, 2);
  });

  it("keeps quantities and employer costs out of the earnings line", () => {
    const march = paid[2];
    if (!march) throw new Error("expected a March slot");
    // E = base + allowances + bonus + overtime, and nothing else.
    expect(march.earnings).toBe(
      Number((16187.41 + 2913.73 + 400 + 250 + 15669.19 + 4842.19).toFixed(2)),
    );
    expect(march.earnBal).toBe(0);
  });
});

describe("the three-decimal case", () => {
  /**
   * Every zero test and every change test uses q = smallestUnit(minorUnits()),
   * never a hardcoded 0.01. A KWD fils must survive; `money-precision.test.ts`
   * covers the storage half, and this covers the engine half for this folder.
   */
  it("keeps a one-fils movement in a KWD block", () => {
    const kwd = minorUnits("KWD");
    expect(kwd).toBe(3);

    const { periods, rows } = e0002Year({ months: [1] });
    const kwdRows = rows.map((row) => ({
      ...row,
      currency: "KWD",
      gross: 1000.001,
      net: 900.001,
      components: { "Base Salary": 1000.001 },
    }));

    const slots = buildEmployeeSlots({
      expected,
      periods: periods.map((p) => ({ ...p, currency: "KWD" })),
      cadence: "monthly",
      rows: kwdRows,
      resolve: resolveEmployeeCategory(),
      decimals: kwd,
    });

    const january = slots[0];
    expect(january?.gross).toBe(1000.001);
    expect(january?.byKey["Base Salary"]?.total).toBe(1000.001);
    // At two decimals the third digit would have been rounded away here, and
    // the bridge would still have balanced because the same rounding applies to
    // both sides of it — which is what made the loss invisible.
    expect(january?.earnBal).toBe(0);
  });
});
