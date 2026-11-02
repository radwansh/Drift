import { describe, it, expect } from "vitest";
import { generateExpectedPeriods, dedupePeriods, countSupersededUploads } from "../annual/periods";
import { minorUnits } from "../money";
import {
  buildEmployeeSlots,
  cleanPaidSlots,
  coveredSlots,
  gapLabelsBetween,
  paidSlots,
} from "./slots";
import { sumSlots } from "./totals";
import { resolveEmployeeCategory } from "./file";
import { buildYear, monthPeriod, monthRows, type MonthSpec } from "./test-utils";

/**
 * The four slot kinds (step C2).
 *
 * `missing` versus `not_paid` is the single most important modelling decision
 * in the feature, and every denominator depends on it: a gap in uploads is
 * unknown, and a covered slot the employee has no row in is a fact.
 */

const expected = generateExpectedPeriods("monthly", 2025);
const decimals = minorUnits("USD");

function build(specs: readonly MonthSpec[], externalId = "E1") {
  const { periods, rows } = buildYear(2025, specs, externalId);
  return buildEmployeeSlots({
    expected,
    periods: dedupePeriods(periods),
    cadence: "monthly",
    rows,
    resolve: resolveEmployeeCategory(),
    decimals,
  });
}

const pay = (month: number, gross = 1000, net = 800): MonthSpec => ({
  month,
  gross,
  net,
  components: { "Base Salary": gross, "Income Tax": gross - net },
});

describe("the four kinds", () => {
  it("returns one row per slot in R, never only the slots with data", () => {
    const slots = build([pay(1), pay(2)]);
    expect(slots).toHaveLength(12);
    expect(slots.map((s) => s.slot.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("marks a slot with no upload `missing`, with null money rather than zero", () => {
    const slots = build([pay(1), pay(3)]);
    const february = slots[1];
    expect(february?.kind).toBe("missing");
    // Never 0: a zero here is what gets plotted on a chart and divided into an
    // average, which is how a missing month becomes a 8.33% understatement.
    expect(february?.gross).toBeNull();
    expect(february?.net).toBeNull();
    expect(february?.rowCount).toBe(0);
  });

  it("marks a covered slot with no row for this employee `not_paid`", () => {
    // Somebody else was paid in February, so the slot is covered.
    const { periods } = buildYear(2025, [pay(1), pay(2), pay(3)]);
    const rows = [
      ...monthRows(2025, pay(1), "E1"),
      ...monthRows(2025, pay(3), "E1"),
    ];
    const slots = buildEmployeeSlots({
      expected,
      periods,
      cadence: "monthly",
      rows,
      resolve: resolveEmployeeCategory(),
      decimals,
    });

    const february = slots[1];
    expect(february?.kind).toBe("not_paid");
    // Blank, like `missing`, but a different fact — the reason differs and the
    // UI renders each differently.
    expect(february?.gross).toBeNull();
  });

  it("marks exactly one row per period `actual`", () => {
    const slots = build([pay(1)]);
    expect(slots[0]?.kind).toBe("actual");
    expect(slots[0]?.rowCount).toBe(1);
    expect(slots[0]?.mergedRunCount).toBe(1);
  });
});

describe("duplicate rows in one period (spec 7.3)", () => {
  const slots = build([
    {
      month: 1,
      gross: 1000,
      net: 800,
      components: { "Base Salary": 1000, "Income Tax": 200 },
      extraRows: [{ gross: 1000, net: 800, components: { "Base Salary": 1000, "Income Tax": 200 } }],
    },
    pay(2),
  ]);

  it("flags the slot and sums both rows", () => {
    const january = slots[0];
    expect(january?.kind).toBe("duplicate");
    expect(january?.rowCount).toBe(2);
    // The sum is what ties to the register and to `payroll_periods.total_gross`,
    // which accumulates every row.
    expect(january?.gross).toBe(2000);
    expect(january?.net).toBe(1600);
    expect(january?.byKey["Base Salary"]?.total).toBe(2000);
  });

  it("carries both rows through for display", () => {
    expect(slots[0]?.rows).toHaveLength(2);
    expect(slots[0]?.runs).toHaveLength(1);
    expect(slots[0]?.runs[0]?.rowCount).toBe(2);
  });

  it("excludes the slot from the clean denominator", () => {
    expect(paidSlots(slots)).toHaveLength(2);
    expect(cleanPaidSlots(slots)).toHaveLength(1);
    expect(cleanPaidSlots(slots)[0]?.slot.label).toBe("Feb 2025");
  });
});

describe("off-cycle runs on one slot (spec 7.2)", () => {
  /**
   * A December bonus payroll plus the main run is a **merge**, not a duplicate.
   *
   * Taken literally, spec 2.3's "rows(e,p) has more than one row" would flag
   * every off-cycle run as a duplicated export, which contradicts spec 7.2's
   * own confirmation. `duplicate` is therefore per period, and both of the
   * spec's confirmations hold.
   */
  const main = monthPeriod(2025, { month: 12, gross: 1000, net: 800 });
  const bonus: typeof main = {
    ...main,
    id: "period-2025-12-bonus",
    periodStart: "2025-12-15",
    periodEnd: "2025-12-20",
    createdAt: "2025-12-20T12:00:00Z",
    totalGross: 500,
    totalNet: 400,
  };

  const slots = buildEmployeeSlots({
    expected,
    periods: [main, bonus],
    cadence: "monthly",
    rows: [
      {
        id: "s1", payrollPeriodId: main.id, employeeExternalId: "E1", employeeName: "A",
        department: "Ops", gross: 1000, net: 800, currency: "USD",
        components: { "Base Salary": 1000 }, hireDate: null, terminationDate: null,
        fte: null, dimensions: {},
      },
      {
        id: "s2", payrollPeriodId: bonus.id, employeeExternalId: "E1", employeeName: "A",
        department: "Ops", gross: 500, net: 400, currency: "USD",
        components: { Bonus: 500 }, hireDate: null, terminationDate: null,
        fte: null, dimensions: {},
      },
    ],
    resolve: resolveEmployeeCategory(),
    decimals,
  });

  it("gives one December slot whose gross is the sum of both runs", () => {
    const december = slots[11];
    expect(december?.slot.label).toBe("Dec 2025");
    expect(december?.gross).toBe(1500);
    expect(december?.net).toBe(1200);
  });

  it("is `actual`, with the merge carried rather than flagged", () => {
    const december = slots[11];
    expect(december?.kind).toBe("actual");
    expect(december?.mergedRunCount).toBe(2);
    expect(december?.runs).toHaveLength(2);
  });

  it("never reports a thirteenth period", () => {
    expect(slots).toHaveLength(12);
    expect(coveredSlots(slots)).toHaveLength(1);
  });
});

describe("re-uploaded periods (spec 7.1)", () => {
  /**
   * `processUpload` always inserts, nothing deletes the old row, and both are
   * `ready`. De-duplication happens in TypeScript through `dedupePeriods`, the
   * function the engine already owns, so SQL and the engine cannot disagree
   * about which upload won.
   */
  const first = monthPeriod(2025, { month: 1, gross: 900, net: 700, createdAt: "2025-02-01T00:00:00Z" });
  const second = monthPeriod(2025, { month: 1, gross: 1000, net: 800, createdAt: "2025-02-05T00:00:00Z" });

  it("keeps the newest upload and counts the superseded one", () => {
    const deduped = dedupePeriods([first, second]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.createdAt).toBe("2025-02-05T00:00:00Z");
    expect(countSupersededUploads([first, second])).toBe(1);
  });

  it("leaves K1 identical with and without the superseded upload", () => {
    const rows = [
      {
        id: "s1", payrollPeriodId: second.id, employeeExternalId: "E1", employeeName: "A",
        department: "Ops", gross: 1000, net: 800, currency: "USD",
        components: { "Base Salary": 1000 }, hireDate: null, terminationDate: null,
        fte: null, dimensions: {},
      },
    ];

    const withBoth = buildEmployeeSlots({
      expected, periods: dedupePeriods([first, second]), cadence: "monthly", rows,
      resolve: resolveEmployeeCategory(), decimals,
    });
    const withOne = buildEmployeeSlots({
      expected, periods: [second], cadence: "monthly", rows,
      resolve: resolveEmployeeCategory(), decimals,
    });

    expect(sumSlots(paidSlots(withBoth), (s) => s.gross, decimals)).toBe(1000);
    expect(sumSlots(paidSlots(withOne), (s) => s.gross, decimals)).toBe(1000);
  });
});

describe("a department transfer (spec 7.8)", () => {
  /**
   * Each slot's money is attributed to **that slot's** department. Attributing
   * the year to the latest one moves two departments' totals after an upload
   * containing no new money.
   */
  const slots = build([
    ...[1, 2, 3, 4, 5, 6].map((month) => ({ ...pay(month), department: "Engineering" })),
    ...[7, 8, 9, 10, 11, 12].map((month) => ({ ...pay(month), department: "Operations" })),
  ]);

  it("splits the year 6/6 and still sums to K1", () => {
    const paid = paidSlots(slots);
    const engineering = paid.filter((s) => s.department === "Engineering");
    const operations = paid.filter((s) => s.department === "Operations");

    expect(engineering).toHaveLength(6);
    expect(operations).toHaveLength(6);

    const total = sumSlots(paid, (s) => s.gross, decimals);
    const split =
      sumSlots(engineering, (s) => s.gross, decimals) +
      sumSlots(operations, (s) => s.gross, decimals);
    expect(split).toBe(total);
    expect(total).toBe(12000);
  });
});

describe("gapLabelsBetween", () => {
  it("names only the slots nobody uploaded", () => {
    // Jan and Apr paid; Feb covered but not paid for this employee; Mar missing.
    const { periods } = buildYear(2025, [pay(1), pay(2), pay(4)]);
    const rows = [...monthRows(2025, pay(1), "E1"), ...monthRows(2025, pay(4), "E1")];
    const slots = buildEmployeeSlots({
      expected, periods, cadence: "monthly", rows,
      resolve: resolveEmployeeCategory(), decimals,
    });

    expect(slots[1]?.kind).toBe("not_paid");
    expect(slots[2]?.kind).toBe("missing");
    // A `not_paid` slot is a fact about the employee, not a hole in the data,
    // so only March counts as a gap.
    expect(gapLabelsBetween(slots, 1, 4)).toEqual(["Mar 2025"]);
  });

  it("is empty for adjacent slots", () => {
    const slots = build([pay(1), pay(2)]);
    expect(gapLabelsBetween(slots, 1, 2)).toEqual([]);
  });
});

describe("a 26th-to-25th cycle", () => {
  /**
   * The bug `assignSlot` exists to fix. Before it, five places matched a period
   * to a slot by exact end-date equality, so a payroll that does not end on the
   * last day of the month matched nothing — and the same year simultaneously
   * reported months missing and forecast one of them twice.
   */
  it("places a period ending on the 25th in the month it ends in", () => {
    const period = {
      id: "p1",
      periodType: "monthly" as const,
      currency: "USD",
      periodStart: "2025-02-26",
      periodEnd: "2025-03-25",
      createdAt: "2025-03-25T12:00:00Z",
      totalGross: 1000,
      totalNet: 800,
    };

    const slots = buildEmployeeSlots({
      expected,
      periods: [period],
      cadence: "monthly",
      rows: [
        {
          id: "s1", payrollPeriodId: "p1", employeeExternalId: "E1", employeeName: "A",
          department: null, gross: 1000, net: 800, currency: "USD",
          components: { "Base Salary": 1000 }, hireDate: null, terminationDate: null,
          fte: null, dimensions: {},
        },
      ],
      resolve: resolveEmployeeCategory(),
      decimals,
    });

    expect(coveredSlots(slots).map((s) => s.slot.label)).toEqual(["Mar 2025"]);
    expect(slots[2]?.gross).toBe(1000);
  });
});
