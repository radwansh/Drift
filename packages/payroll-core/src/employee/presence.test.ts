import { describe, it, expect } from "vitest";
import { generateExpectedPeriods } from "../annual/periods";
import { minorUnits } from "../money";
import { buildEmployeeSlots } from "./slots";
import {
  buildPresence,
  detectIdChangeCandidates,
  normaliseEmployeeName,
  presenceSpans,
} from "./presence";
import { resolveEmployeeCategory } from "./file";
import { buildYear, monthRows, type MonthSpec } from "./test-utils";

const expected = generateExpectedPeriods("monthly", 2025);
const decimals = minorUnits("USD");

const pay = (month: number, overrides: Partial<MonthSpec> = {}): MonthSpec => ({
  month,
  gross: 1000,
  net: 800,
  components: { "Base Salary": 1000, "Income Tax": 200 },
  ...overrides,
});

/** Periods for every listed month, rows only for the ones the employee is in. */
function slotsFor(opts: {
  coveredMonths: readonly number[];
  paid: readonly MonthSpec[];
}) {
  const { periods } = buildYear(2025, opts.coveredMonths.map((m) => pay(m)), "E1");
  const rows = opts.paid.flatMap((spec) => monthRows(2025, spec, "E1"));
  return buildEmployeeSlots({
    expected,
    periods,
    cadence: "monthly",
    rows,
    resolve: resolveEmployeeCategory(),
    decimals,
  });
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("presence spans (spec 7.5)", () => {
  it("never splits a span across a missing slot", () => {
    /**
     * A gap in uploads is not a gap in employment. If `missing` broke a span,
     * a month somebody forgot to upload would invent a leaver — and then
     * report a rehire when it finally arrived.
     */
    const slots = slotsFor({
      // March is never uploaded at all.
      coveredMonths: [1, 2, 4, 5],
      paid: [pay(1), pay(2), pay(4), pay(5)],
    });

    expect(slots[2]?.kind).toBe("missing");
    const spans = presenceSpans(slots);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.fromLabel).toBe("Jan 2025");
    expect(spans[0]?.toLabel).toBe("May 2025");
    expect(spans[0]?.paidSlots).toBe(4);
  });

  it("splits a span at a not_paid slot, which is the real rehire shape", () => {
    // Paid Jan-Mar, absent Apr-Jun (those months WERE uploaded), paid Jul-Dec.
    const slots = slotsFor({
      coveredMonths: ALL_MONTHS,
      paid: [1, 2, 3, 7, 8, 9, 10, 11, 12].map((m) => pay(m)),
    });

    const spans = presenceSpans(slots);
    expect(spans).toHaveLength(2);
    expect(spans[0]?.fromLabel).toBe("Jan 2025");
    expect(spans[0]?.toLabel).toBe("Mar 2025");
    expect(spans[1]?.fromLabel).toBe("Jul 2025");
    expect(spans[1]?.toLabel).toBe("Dec 2025");
  });

  it("badges a rehire and states no single tenure figure", () => {
    const slots = slotsFor({
      coveredMonths: ALL_MONTHS,
      paid: [1, 2, 3, 7, 8, 9, 10, 11, 12].map((m) =>
        pay(m, { hireDate: m <= 3 ? "2024-06-01" : "2025-07-01" }),
      ),
    });

    const presence = buildPresence({ slots, decimals });
    expect(presence.status.kind).toBe("rehired");
    expect(presence.spans).toHaveLength(2);
    // Tenure across a gap would count unpaid months as service.
    expect(presence.tenureMonths).toBeNull();
    expect(presence.tenureSuppressed).toBe("spans_gap");
    // Both hire dates are carried, rather than one overwriting the other.
    expect(presence.hireDates).toEqual(["2024-06-01", "2025-07-01"]);
  });

  it("counts not_paid in covered and excludes it from paid", () => {
    const slots = slotsFor({
      coveredMonths: ALL_MONTHS,
      paid: [1, 2, 3, 7, 8, 9, 10, 11, 12].map((m) => pay(m)),
    });

    expect(slots.filter((s) => s.kind === "not_paid")).toHaveLength(3);
    expect(slots.filter((s) => s.kind === "actual")).toHaveLength(9);
    expect(slots.filter((s) => s.kind === "missing")).toHaveLength(0);
  });
});

describe("status", () => {
  it("is active when the employee is in the latest covered slot", () => {
    const slots = slotsFor({ coveredMonths: [1, 2, 3], paid: [pay(1), pay(2), pay(3)] });
    const presence = buildPresence({ slots, decimals });
    expect(presence.status.kind).toBe("active");
    expect(presence.status.slotLabel).toBe("Mar 2025");
  });

  it("is left, naming the last paid slot, when absent from the latest covered one", () => {
    const slots = slotsFor({ coveredMonths: [1, 2, 3], paid: [pay(1), pay(2)] });
    const presence = buildPresence({ slots, decimals });
    expect(presence.status.kind).toBe("left");
    expect(presence.status.slotLabel).toBe("Feb 2025");
  });

  it("is joined, naming the first paid slot", () => {
    const slots = slotsFor({ coveredMonths: [1, 2, 3], paid: [pay(2), pay(3)] });
    const presence = buildPresence({ slots, decimals });
    expect(presence.status.kind).toBe("joined");
    expect(presence.status.slotLabel).toBe("Feb 2025");
  });

  it("is not_paid_in_range when the employee has no row at all", () => {
    const slots = slotsFor({ coveredMonths: [1, 2, 3], paid: [] });
    const presence = buildPresence({ slots, decimals });
    expect(presence.status.kind).toBe("not_paid_in_range");
    expect(presence.status.slotLabel).toBeNull();
  });
});

describe("final settlement (spec 7.6)", () => {
  it("marks the last paid slot when a one-off earning is present", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1),
        pay(2),
        pay(3, {
          gross: 3500,
          net: 3300,
          components: {
            "Base Salary": 1000,
            "Notice Pay": 1500,
            "Accrued Leave Payout": 1100,
            "Loan Recovery": 100,
            "Income Tax": 100,
          },
        }),
      ],
    });

    const presence = buildPresence({ slots, decimals });
    expect(presence.finalSettlementIndex).toBe(3);
    // Itemised, so the UI can name them rather than showing a 250% rise.
    expect(presence.finalSettlementKeys.sort()).toEqual(["Accrued Leave Payout", "Notice Pay"]);
  });

  it("marks it when termination_date falls in the slot", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2],
      paid: [pay(1), pay(2, { terminationDate: "2025-02-20" })],
    });
    expect(buildPresence({ slots, decimals }).finalSettlementIndex).toBe(2);
  });

  it("marks it when the employee is absent from the next covered slot", () => {
    const slots = slotsFor({ coveredMonths: [1, 2, 3], paid: [pay(1), pay(2)] });
    expect(buildPresence({ slots, decimals }).finalSettlementIndex).toBe(2);
  });

  it("does not mark it when the next slot is merely missing", () => {
    // Nobody was uploaded for March, so absence from it says nothing.
    const slots = slotsFor({ coveredMonths: [1, 2], paid: [pay(1), pay(2)] });
    expect(slots[2]?.kind).toBe("missing");
    expect(buildPresence({ slots, decimals }).finalSettlementIndex).toBeNull();
  });
});

describe("possibly prorated (spec 7.7)", () => {
  it("marks the first paid slot when hire_date falls inside it", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1, { hireDate: "2025-01-18", gross: 600, net: 500 }),
        pay(2),
        pay(3),
      ],
    });
    expect(buildPresence({ slots, decimals }).possiblyProratedIndex).toBe(1);
  });

  it("marks it when recurring is below the next slot's with no base change", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2],
      paid: [
        // Same base rate both months, but January's allowance is part-month.
        { month: 1, gross: 900, net: 700, components: { "Base Salary": 800, "Housing Allowance": 100 } },
        { month: 2, gross: 1000, net: 800, components: { "Base Salary": 800, "Housing Allowance": 200 } },
      ],
    });
    expect(buildPresence({ slots, decimals }).possiblyProratedIndex).toBe(1);
  });

  it("does not mark it when a real base-rate rise explains the difference", () => {
    // A pay rise is an increase, not a data note, so labelling it would turn
    // the most important per-employee event into a caveat.
    const slots = slotsFor({
      coveredMonths: [1, 2],
      paid: [
        { month: 1, gross: 800, net: 640, components: { "Base Salary": 800 } },
        { month: 2, gross: 1000, net: 800, components: { "Base Salary": 1000 } },
      ],
    });
    expect(buildPresence({ slots, decimals }).possiblyProratedIndex).toBeNull();
  });
});

describe("tenure", () => {
  it("is suppressed with a reason when hire_date is not mapped", () => {
    const slots = slotsFor({ coveredMonths: [1, 2], paid: [pay(1), pay(2)] });
    const presence = buildPresence({ slots, decimals });
    expect(presence.tenureMonths).toBeNull();
    expect(presence.tenureSuppressed).toBe("not_mapped");
  });

  it("counts whole months to the last paid slot when it is mapped", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2, 3],
      paid: [1, 2, 3].map((m) => pay(m, { hireDate: "2024-03-15" })),
    });
    const presence = buildPresence({ slots, decimals });
    // 2024-03-15 to 2025-03-31 is twelve whole months.
    expect(presence.tenureMonths).toBe(12);
    expect(presence.tenureSuppressed).toBeNull();
  });
});

describe("names, and a reused id (spec 7.12)", () => {
  it("keeps every name, newest first", () => {
    const slots = slotsFor({
      coveredMonths: [1, 2, 3],
      paid: [
        pay(1, { name: "Mariam Haddad" }),
        pay(2, { name: "Mariam Haddad" }),
        pay(3, { name: "Mariam Khoury" }),
      ],
    });
    const presence = buildPresence({ slots, decimals });
    expect(presence.names).toEqual(["Mariam Khoury", "Mariam Haddad"]);
  });

  it("flags a materially different name after a gap", () => {
    const slots = slotsFor({
      coveredMonths: ALL_MONTHS,
      paid: [
        ...[1, 2, 3, 4, 5, 6].map((m) => pay(m, { name: "Mariam Haddad" })),
        ...[9, 10, 11, 12].map((m) => pay(m, { name: "Omar Khalil" })),
      ],
    });
    const presence = buildPresence({ slots, decimals });
    expect(presence.status.idMayBeReused).toBe(true);
    // Detected and reported, never resolved: a recycled staff number is a
    // different person, and merging their year is worse than splitting it.
    expect(presence.status.idMayHaveChanged).toBe(false);
  });

  it("does not flag a re-transliteration or a marriage as a different person", () => {
    const slots = slotsFor({
      coveredMonths: ALL_MONTHS,
      paid: [
        ...[1, 2, 3].map((m) => pay(m, { name: "Mariam Haddad" })),
        // Same tokens, different order and punctuation.
        ...[7, 8, 9].map((m) => pay(m, { name: "Haddad, Mariam" })),
      ],
    });
    expect(buildPresence({ slots, decimals }).status.idMayBeReused).toBe(false);
  });
});

describe("normaliseEmployeeName", () => {
  it("ignores case, diacritics, punctuation and token order", () => {
    expect(normaliseEmployeeName("Mariam Haddad")).toBe(normaliseEmployeeName("haddad,  MARIAM"));
    expect(normaliseEmployeeName("José Álvarez")).toBe(normaliseEmployeeName("jose alvarez"));
    expect(normaliseEmployeeName("Omar Khalil")).not.toBe(normaliseEmployeeName("Mariam Haddad"));
  });
});

describe("detectIdChangeCandidates (spec 7.4)", () => {
  /**
   * A payroll provider migration renumbers everyone, so the file splits in two
   * and both halves look like a leaver and a joiner. The shape to look for is
   * the same normalised name, an overlapping department, **disjoint** coverage,
   * and recurring pay within q across the join.
   *
   * Never merged: merging needs a stored decision and no table exists for one.
   */
  const roster = [
    {
      externalId: "E0007",
      latestName: "Rami Fares",
      departments: ["Engineering"],
      paidSlotIndexes: [1, 2, 3, 4, 5, 6],
      recurring: 5000,
    },
    {
      externalId: "100007",
      latestName: "Rami Fares",
      departments: ["Engineering"],
      paidSlotIndexes: [7, 8, 9, 10, 11, 12],
      recurring: 5000,
    },
  ];

  it("pairs the leaver with the joiner, oldest first", () => {
    const candidates = detectIdChangeCandidates(roster, decimals);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.leftId).toBe("E0007");
    expect(candidates[0]?.joinedId).toBe("100007");
    expect(candidates[0]?.sharedDepartments).toEqual(["Engineering"]);
    expect(candidates[0]?.recurringDifference).toBe(0);
  });

  it("refuses overlapping coverage — two people who share a name", () => {
    const overlapping = [roster[0]!, { ...roster[1]!, paidSlotIndexes: [3, 4, 5] }];
    expect(detectIdChangeCandidates(overlapping, decimals)).toEqual([]);
  });

  it("refuses a different department", () => {
    const moved = [roster[0]!, { ...roster[1]!, departments: ["Operations"] }];
    expect(detectIdChangeCandidates(moved, decimals)).toEqual([]);
  });

  it("refuses recurring pay that differs by more than q", () => {
    const paid = [roster[0]!, { ...roster[1]!, recurring: 5100 }];
    expect(detectIdChangeCandidates(paid, decimals)).toEqual([]);
  });

  it("compares only inside a name bucket", () => {
    const wide = [...roster, {
      externalId: "E0100",
      latestName: "Someone Else",
      departments: ["Engineering"],
      paidSlotIndexes: [7, 8, 9],
      recurring: 5000,
    }];
    const candidates = detectIdChangeCandidates(wide, decimals);
    expect(candidates).toHaveLength(1);
  });
});
