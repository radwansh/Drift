import { describe, it, expect } from "vitest";
import {
  buildEmployeeFile,
  generateExpectedPeriods,
  type EmployeePeriodInput,
  type EmployeeSnapshotRow,
  type KpiSuppression,
} from "@saas/payroll-core";
import { NAV_ITEMS, visibleNavItems } from "@/lib/constants";
import { NAV_ICONS } from "@/components/shared/nav-icons";
import { PAY_DETAIL_ROLES, canReadPayDetail } from "@/lib/roles";
import {
  formatAxisMoney,
  formatCompact,
  formatDays,
  formatMoney,
  formatPct,
  formatRatio,
} from "@/components/annual/annual-utils";
import {
  buildChartData,
  buildPeriodRows,
  GROSS_STACK,
  presentStack,
} from "@/components/employee-file/employee-chart-data";
import {
  availableColumns,
  compareByColumn,
  dimensionColumns,
  EMPLOYEE_COLUMNS,
  isWholeSetOnPage,
  listStatus,
  MAX_DIMENSION_COLUMNS,
  visibleColumnKeys,
  type EmployeeListRow,
} from "@/components/employee-file/employee-columns";
import {
  CHANGE_LOG_VALUE_SHAPE,
  coverageSentence,
  CURRENTLY_EMPLOYED_UNKNOWN_NOTICE,
  describeChangeLogValue,
  duplicateSlotNote,
  excludedByScopeSentence,
  KPI_SUPPRESSION_LABELS,
  scopeForRange,
  slotKindReason,
} from "@/components/employee-file/employee-file-text";
import {
  decodeEmployeeId,
  employeeFileHref,
} from "@/components/employee-file/employee-id-url";
import {
  parseCurrency,
  parseList,
  parseRange,
  parseScope,
  parseYear,
  scopeSearch,
} from "@/components/employee-file/employee-list-url";

/**
 * The parts of the Employee File's UI layer that do not need a browser
 * (step F5).
 *
 * This repo has no Playwright baselines and no browsers, so snapshot and axe
 * checks are out; `annual-ui.test.ts` follows the same rule. What is left is
 * everything that decides what a figure *means* before it is rendered: the
 * chart series builder, the money comparators, the conditional columns, and the
 * sentences the file states rather than implies.
 */

describe("sidebar navigation (step A4)", () => {
  /**
   * The trap the spec names in section 1.3: the icon lookup is a literal, so an
   * item whose `icon` string is not a key renders no icon **and no error**.
   * Typecheck cannot see it, lint cannot see it, and a reviewer reading the diff
   * for the new entry has no reason to check the map. This is the one thing in
   * A4 that a review will not catch by eye.
   */
  it("gives every nav item an icon the registry actually has", () => {
    const names = Object.keys(NAV_ICONS);
    for (const item of NAV_ITEMS) {
      expect(names, `${item.label} (${item.href}) has icon "${item.icon}"`).toContain(item.icon);
    }
  });

  it("puts Employee File first, above Dashboard, with its roles set", () => {
    const first = NAV_ITEMS[0];
    expect(first?.href).toBe("/employees");
    expect(first?.label).toBe("Employee File");
    expect(first?.roles).toEqual([...PAY_DETAIL_ROLES]);
    // Above Dashboard, which is the decision rather than an accident of order.
    expect(NAV_ITEMS[1]?.href).toBe("/dashboard");
  });

  it("leaves the other six items ungated", () => {
    for (const item of NAV_ITEMS.slice(1)) {
      expect(item.roles, `${item.label} should not be gated`).toBeUndefined();
    }
  });

  it("shows the Employee File link to an admin and a manager", () => {
    for (const role of PAY_DETAIL_ROLES) {
      const hrefs = visibleNavItems(role).map((i) => i.href);
      expect(hrefs).toContain("/employees");
      expect(hrefs).toHaveLength(NAV_ITEMS.length);
    }
  });

  it("hides it from a viewer, and from an unresolved role", () => {
    // `null` is what the layout passes when the user lookup fails. A failure
    // must hide the link rather than render one that throws on click.
    for (const role of ["viewer", null, undefined, ""]) {
      const hrefs = visibleNavItems(role).map((i) => i.href);
      expect(hrefs, `role ${JSON.stringify(role)}`).not.toContain("/employees");
      expect(hrefs).toHaveLength(NAV_ITEMS.length - 1);
    }
  });

  /**
   * The link and the gate read the same constant, so they cannot disagree. If
   * `PAY_DETAIL_ROLES` ever changes, both move together and this holds.
   */
  it("agrees with the predicate the procedure enforces", () => {
    for (const item of NAV_ITEMS) {
      if (!item.roles) continue;
      for (const role of ["admin", "manager", "viewer", "", null]) {
        expect(visibleNavItems(role).includes(item)).toBe(canReadPayDetail(role));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// A file carrying all four slot kinds, built through the public engine entry
// point so the nulls under test are the real ones rather than hand-written.
// ---------------------------------------------------------------------------

const EXPECTED = generateExpectedPeriods("monthly", 2025, "2025-01-01", 1).slice(0, 6);

function lastDay(month: number): string {
  const day = new Date(Date.UTC(2025, month, 0)).getUTCDate();
  return `2025-${String(month).padStart(2, "0")}-${day}`;
}

function period(month: number): EmployeePeriodInput {
  return {
    id: `p${month}`,
    periodType: "monthly",
    currency: "USD",
    periodStart: `2025-${String(month).padStart(2, "0")}-01`,
    periodEnd: lastDay(month),
    createdAt: `${lastDay(month)}T12:00:00Z`,
    totalGross: 99_999,
    totalNet: 88_888,
    controlTotalGross: null,
    controlTotalNet: null,
  };
}

function snapshot(month: number, base: number, suffix = "a"): EmployeeSnapshotRow {
  const gross = base + 200;
  return {
    id: `s${month}${suffix}`,
    payrollPeriodId: `p${month}`,
    employeeExternalId: "E1",
    employeeName: "Ada Lovelace",
    department: "Engineering",
    gross,
    net: gross - 200,
    currency: "USD",
    components: {
      "Base Salary": base,
      "Housing Allowance": 100,
      // Unplaceable by the classifier, so it lands in `earnBal` rather than in
      // a category — the line that would otherwise vanish from "earnings".
      "Expense Reimbursement": 100,
      "Income Tax": -200,
    },
    hireDate: null,
    terminationDate: null,
    fte: null,
    dimensions: {},
  };
}

/**
 * Months 1, 2, 4, 5 and 6 uploaded; month 3 never uploaded; month 5 uploaded
 * with no row for this employee; month 6 with two rows.
 *
 * So the six slots are: actual, actual, **missing**, actual across the gap,
 * **not_paid**, **duplicate** — every kind, plus the two cases a delta has to
 * refuse.
 */
const FILE = buildEmployeeFile({
  externalId: "E1",
  expected: EXPECTED,
  periods: [1, 2, 4, 5, 6].map(period),
  cadence: "monthly",
  currency: "USD",
  rows: [
    snapshot(1, 1000),
    snapshot(2, 1050),
    snapshot(4, 1050),
    snapshot(6, 1050, "a"),
    snapshot(6, 1050, "b"),
  ],
  supersededUploads: 0,
  slotsPerYear: 12,
});

const ROWS = buildPeriodRows(FILE.slots, "monthly");

describe("the period rows, shared by the table and the chart (steps E5, E6)", () => {
  it("returns one row per expected slot, in calendar order", () => {
    expect(ROWS).toHaveLength(EXPECTED.length);
    expect(ROWS.map((row) => row.index)).toEqual(EXPECTED.map((slot) => slot.index));
  });

  it("gives each slot its own kind", () => {
    expect(ROWS.map((row) => row.kind)).toEqual([
      "actual",
      "actual",
      "missing",
      "actual",
      "not_paid",
      "duplicate",
    ]);
  });

  /**
   * The assertion this whole module exists for. A slot nobody uploaded is
   * **null**, never 0: a zero would be plotted as a bar and averaged as a
   * payment, which reads as "paid nothing" rather than "unknown".
   */
  it("carries null, never zero, for a slot nobody uploaded", () => {
    const missing = ROWS[2];
    expect(missing?.kind).toBe("missing");
    expect(missing?.gross).toBeNull();
    expect(missing?.net).toBeNull();
    expect(missing?.recurring).toBeNull();
    expect(missing?.variable).toBeNull();
    expect(missing?.deductions).toBeNull();
    expect(missing?.earnBal).toBeNull();
    expect(missing?.byCategory).toBeNull();
  });

  it("carries null for a covered slot the employee has no row in", () => {
    const notPaid = ROWS[4];
    expect(notPaid?.kind).toBe("not_paid");
    expect(notPaid?.gross).toBeNull();
    expect(notPaid?.net).toBeNull();
  });

  it("gives the two blank kinds different reasons, because they are different facts", () => {
    const missingReason = slotKindReason("missing");
    const notPaidReason = slotKindReason("not_paid");
    expect(missingReason).not.toBe(notPaidReason);
    expect(missingReason).toMatch(/not zero/i);
    expect(notPaidReason).toMatch(/not paid/i);
    expect(slotKindReason("actual")).toBeNull();
  });

  it("sums a duplicate slot's rows, which is what ties to the register", () => {
    const duplicate = ROWS[5];
    expect(duplicate?.kind).toBe("duplicate");
    expect(duplicate?.rowCount).toBe(2);
    // 1,250 per row, both rows.
    expect(duplicate?.gross).toBeCloseTo(2500, 2);
  });

  it("withholds the delta on a duplicate slot", () => {
    expect(ROWS[5]?.deltaGross).toBeNull();
  });

  it("computes a delta between adjacent clean slots", () => {
    expect(ROWS[1]?.deltaGross).toBeCloseTo(50, 2);
    expect(ROWS[1]?.spansGap).toBe(false);
  });

  it("marks a delta that spans a slot nobody uploaded, and withholds the figure", () => {
    const acrossGap = ROWS[3];
    expect(acrossGap?.spansGap).toBe(true);
    expect(acrossGap?.deltaGross).toBeNull();
    expect(acrossGap?.gapLabels).toEqual([EXPECTED[2]?.label]);
  });

  it("does not treat a not_paid slot as a gap", () => {
    // Month 6 follows month 5, which was uploaded and simply paid nobody. That
    // is a fact about the employee, not a hole in the data.
    expect(ROWS[5]?.gapLabels).toEqual([]);
  });

  it("labels slots through shortPeriodLabel, never a raw ISO date", () => {
    for (const row of ROWS) {
      expect(row.label).not.toMatch(/^\d{4}-\d{2}/);
      expect(row.fullLabel).not.toMatch(/^\d{4}-\d{2}/);
    }
  });
});

describe("the chart series (step E6)", () => {
  const data = buildChartData(ROWS);

  it("emits null for every series on a missing slot, never 0", () => {
    const missing = data[2];
    expect(missing?.kind).toBe("missing");
    for (const series of GROSS_STACK) {
      expect(missing?.[series.key], `${series.key} on a missing slot`).toBeNull();
      expect(missing?.[series.key]).not.toBe(0);
    }
  });

  it("emits null for every series on a not_paid slot too", () => {
    const notPaid = data[4];
    for (const series of GROSS_STACK) {
      expect(notPaid?.[series.key], `${series.key} on a not_paid slot`).toBeNull();
    }
  });

  it("keeps a real zero as 0 on a paid slot", () => {
    // Overtime is absent from every row, so the category total is a genuine
    // zero on a paid slot rather than unknown — spec 7.14's distinction.
    expect(data[0]?.overtime).toBe(0);
    expect(data[0]?.base_salary).toBeCloseTo(1000, 2);
  });

  it("carries the unmapped balance as its own series rather than folding it in", () => {
    expect(data[0]?.earnBal).toBeCloseTo(100, 2);
    expect(presentStack(ROWS).map((series) => series.key)).toContain("earnBal");
  });

  it("drops a series nothing in range paid, so no empty legend mark renders", () => {
    expect(presentStack(ROWS).map((series) => series.key)).not.toContain("bonus_commission");
  });

  it("sets every colour as an explicit value, never a class name", () => {
    for (const series of GROSS_STACK) {
      expect(series.fill).toMatch(/^hsl\(/);
      expect(series.fill).not.toMatch(/^(text-|fill-|bg-)/);
    }
  });

  it("keeps one datum per slot, so the axis still shows the gap", () => {
    expect(data).toHaveLength(ROWS.length);
  });
});

describe("the list's columns (step E4)", () => {
  function row(overrides: Partial<EmployeeListRow> = {}): EmployeeListRow {
    return {
      externalId: "E1",
      name: "Ada Lovelace",
      department: "Engineering",
      paidPeriods: 4,
      coveredSlots: 5,
      rangeGross: 1000,
      latestGross: 10,
      latestNet: 9,
      lastPaidSlotLabel: "Jun 2025",
      lastPaidSlotIndex: 6,
      terminationDate: null,
      criticalFlags: 0,
      netExceedsGrossRows: 0,
      negativeNetRows: 0,
      hasDuplicateRows: false,
      currentlyEmployed: true,
      paidInRange: true,
      ...overrides,
    };
  }

  /**
   * `"USD 9.00"` sorts above `"USD 10.00"` as text, and a pay list ordered that
   * way looks plausible enough to be believed. The comparator reads the parsed
   * number the router produced at the boundary.
   */
  it("sorts money on the parsed number, not the formatted string", () => {
    const nine = row({ externalId: "E9", latestGross: 9, rangeGross: 9 });
    const ten = row({ externalId: "E10", latestGross: 10, rangeGross: 10 });

    expect(compareByColumn("latestGross")(nine, ten)).toBeLessThan(0);
    expect(compareByColumn("rangeGross")(nine, ten)).toBeLessThan(0);

    // The bug being guarded against: as text, the order is the other way.
    const asText = [formatMoney(10, "USD"), formatMoney(9, "USD")].sort();
    expect(asText[0]).toBe(formatMoney(10, "USD"));
  });

  it("sorts the last paid slot by index, not by its label", () => {
    const april = row({ lastPaidSlotLabel: "Apr 2025", lastPaidSlotIndex: 4 });
    const january = row({ lastPaidSlotLabel: "Jan 2025", lastPaidSlotIndex: 1 });
    // Alphabetically "Apr" precedes "Jan", which is how a leaver ends up
    // looking like the most recent payment.
    expect(compareByColumn("lastPaidSlot")(january, april)).toBeLessThan(0);
  });

  it("hides the FTE column while no row in scope carries an FTE", () => {
    const keys = availableColumns([row(), row()]).map((column) => column.key);
    expect(keys).not.toContain("fte");
    expect(visibleColumnKeys([row()], null)).not.toContain("fte");
  });

  it("offers it as soon as one row does", () => {
    const keys = availableColumns([row(), row({ fte: 0.5 })]).map((column) => column.key);
    expect(keys).toContain("fte");
  });

  it("renders no dimension column while no row carries a dimension value", () => {
    expect(dimensionColumns([row(), row()], ["Location", "Cost Centre"])).toEqual([]);
  });

  it("caps the dimension columns and orders them by coverage", () => {
    const keys = ["a", "b", "c", "d", "e", "f", "g"];
    const rows = [row({ dimensions: Object.fromEntries(keys.map((k) => [k, k])) })];
    const columns = dimensionColumns(rows, keys);
    expect(columns).toHaveLength(MAX_DIMENSION_COLUMNS);

    const uneven = [
      row({ externalId: "E1", dimensions: { rare: "x", common: "y" } }),
      row({ externalId: "E2", dimensions: { common: "y" } }),
    ];
    expect(dimensionColumns(uneven, ["rare", "common"]).map((c) => c.key)).toEqual([
      "common",
      "rare",
    ]);
  });

  it("keeps the identity column whatever the saved preference says", () => {
    expect(visibleColumnKeys([row()], [])).toEqual(["employee"]);
    expect(visibleColumnKeys([row()], ["latestNet"])).toEqual(["employee", "latestNet"]);
  });

  it("defaults to the spec's nine columns", () => {
    expect(visibleColumnKeys([row()], null)).toEqual([
      "employee",
      "status",
      "flags",
      "department",
      "lastPaidSlot",
      "latestGross",
      "latestNet",
      "paidPeriods",
      "rangeGross",
    ]);
  });

  /**
   * Finding F5: the list's flag column counts the three SQL-expressible flags,
   * and the header has to say so — the two identity breaches need the
   * classifier and live on the file page.
   */
  it("says in the header which flags the column counts", () => {
    const flags = EMPLOYEE_COLUMNS.find((column) => column.key === "flags");
    expect(flags?.label).toMatch(/critical/i);
    expect(flags?.note).toMatch(/identity/i);
  });

  it("knows when a client-side sort would only be sorting one page", () => {
    expect(isWholeSetOnPage(40, 40)).toBe(true);
    expect(isWholeSetOnPage(120, 50)).toBe(false);
  });

  it("derives the three statuses it can, naming the slot for a leaver", () => {
    expect(listStatus(row()).label).toBe("Active");
    expect(listStatus(row({ paidPeriods: 0, paidInRange: false })).kind).toBe(
      "not_paid_in_range",
    );
    const left = listStatus(row({ currentlyEmployed: false, lastPaidSlotLabel: "Apr 2025" }));
    expect(left.kind).toBe("left");
    expect(left.label).toBe("Left Apr 2025");
  });

  /**
   * Defect 4's UI half. Where the range does not reach the latest covered slot
   * the router answers null, and null is a third status rather than a leaver:
   * rendering it as `Left Apr 2025` put a leaving date on every employee in the
   * company, from one URL, with an authoritative slot label attached.
   */
  it("calls an unanswerable employment question unknown, not a leaver", () => {
    const unknown = listStatus(
      row({ currentlyEmployed: null, lastPaidSlotLabel: "Apr 2025" }),
    );
    expect(unknown.kind).toBe("unknown");
    expect(unknown.label).toBe("Not known for this range");
    expect(unknown.label).not.toMatch(/left/i);
  });

  it("renders the FTE the list now projects, and a dash where there is none", () => {
    // The column's availability rule was unfalsifiable while `employeeFile.list`
    // projected no FTE: permanently unavailable, and bucketed under "Not in
    // this register" even for a company whose register maps it.
    expect(availableColumns([row({ fte: 0.5 })]).map((c) => c.key)).toContain("fte");
    expect(formatRatio(0.5)).toBe("0.5");
    expect(formatRatio(1)).toBe("1");
    expect(formatRatio(0.875)).toBe("0.875");
    expect(formatRatio(null)).toBe("—");
  });
});

describe("money on screen (CLAUDE.md's formatter rule)", () => {
  /**
   * Every figure goes through `annual-utils`, which uses
   * `currencyDisplay: "code"`. A `$` anywhere means something called `Intl`
   * directly, and mixing "USD 1,234.56" with "$1,234.56" in one card is the bug
   * those formatters exist to prevent.
   */
  it("never produces a currency symbol", () => {
    for (const currency of ["USD", "LBP", "KWD", "JPY"]) {
      for (const amount of [0, 9, 10, 1234.56, 600_000_000_000]) {
        expect(formatMoney(amount, currency)).not.toContain("$");
        expect(formatCompact(amount, currency)).not.toContain("$");
        expect(formatMoney(amount, currency)).toContain(currency);
      }
    }
    expect(formatAxisMoney(2_670_000)).not.toContain("$");
  });

  it("rounds day counts, which are summed from floats", () => {
    expect(formatDays(44.540000000000006)).toBe("44.5 days");
    expect(formatPct(null)).toBe("—");
  });

  /**
   * Defect 5. The change log ran `formatMoney` over every numeric value, and
   * `fte` entries carry ratios, so a part-time conversion printed as
   * `USD 1.00 → USD 0.50 (USD -0.50, -50.0%)` — a currency code on a headcount
   * fraction, three times in one line.
   */
  it("prints an FTE as a ratio and a rate as money", () => {
    expect(describeChangeLogValue(1, "fte", "USD")).toBe("1");
    expect(describeChangeLogValue(0.5, "fte", "USD")).toBe("0.5");
    expect(describeChangeLogValue(-0.5, "fte", "USD")).toBe("-0.5");
    for (const value of [1, 0.5, -0.5]) {
      expect(describeChangeLogValue(value, "fte", "USD")).not.toContain("USD");
    }

    expect(describeChangeLogValue(16187.41, "base_rate", "USD")).toBe(
      formatMoney(16187.41, "USD"),
    );
    // Strings pass through, and null is a sentence rather than a zero.
    expect(describeChangeLogValue("Engineering", "department", "USD")).toBe("Engineering");
    expect(describeChangeLogValue(null, "component_removed", "USD")).toBe("not present");
  });

  it("classifies every change-log kind, so none defaults to money", () => {
    const money = Object.entries(CHANGE_LOG_VALUE_SHAPE)
      .filter(([, shape]) => shape === "money")
      .map(([kind]) => kind)
      .sort();
    expect(money).toEqual([
      "allowance",
      "base_rate",
      "component_added",
      "component_removed",
    ]);
    expect(CHANGE_LOG_VALUE_SHAPE.fte).toBe("ratio");
  });
});

describe("the sentences the file states rather than implies", () => {
  it("names the periods nobody uploaded in the coverage line", () => {
    const sentence = coverageSentence(FILE.kpis.coverage);
    expect(sentence).toContain("5 of 6 periods uploaded");
    expect(sentence).toContain("4 paid");
    expect(sentence).toContain("1 not paid");
    expect(sentence).toContain("1 not uploaded");
    expect(sentence).toContain(EXPECTED[2]?.label ?? "");
    // And the duplicate slot's exclusion, since every average depends on it.
    expect(sentence).toMatch(/duplicate rows/i);
  });

  it("states the duplicate ambiguity rather than presenting the sum as a fact", () => {
    const note = duplicateSlotNote(2);
    expect(note).toBe(
      "2 rows for this employee in this period. The total shown is the sum, which matches the register. If the second row is a duplicated export, both this figure and the period total are overstated. Rows like these predate the duplicate-id check: an upload with a repeated external id is refused today, so a new file cannot add more.",
    );
    expect(duplicateSlotNote(3)).toMatch(/any of them/);
    // The closing clause is the one an admin acts on: `upload/validate.ts`
    // makes a repeated id an error and `payroll-periods.ts` throws before
    // `processUpload`, so without it the note reads as "this will recur".
    expect(note).toMatch(/refused today/);
  });

  it("says how many a scope filter dropped, and nothing when it dropped none", () => {
    expect(excludedByScopeSentence(14, "FY2026")).toBe(
      "14 people paid in FY2026 are not currently employed. Switch to Paid in range to see them.",
    );
    expect(excludedByScopeSentence(1, "2025")).toMatch(/1 person paid in 2025 is not/);
    expect(excludedByScopeSentence(0, "2025")).toBeNull();
  });

  it("has a renderable reason for every suppression in the union", () => {
    const reasons: KpiSuppression[] = [
      "no_paid_slots",
      "insufficient_history",
      "duplicate_slots_excluded",
      "no_clean_slot",
      "employer_costs_not_mapped",
      "uncategorised_non_zero",
      "fte_not_mapped",
      "peers_below_five",
      "spans_gap",
      "quantity_not_mapped",
    ];
    expect(Object.keys(KPI_SUPPRESSION_LABELS).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      expect(KPI_SUPPRESSION_LABELS[reason].length).toBeGreaterThan(0);
    }
    // Never 0 for an unmapped employer cost: the reason is the figure.
    expect(KPI_SUPPRESSION_LABELS.employer_costs_not_mapped).toMatch(/not mapped/i);
  });

  /**
   * "Currently employed" cannot be answered from a range that stops before the
   * latest covered slot, and an unanswerable scope must not read as an empty
   * one — the list would otherwise report the whole company as having left.
   */
  it("says why the employment scope is unanswerable rather than showing nobody", () => {
    expect(CURRENTLY_EMPLOYED_UNKNOWN_NOTICE).toMatch(/cannot be told from this range/);
    // And names the way out, like every other dropped-rows sentence here.
    expect(CURRENTLY_EMPLOYED_UNKNOWN_NOTICE).toMatch(/Full year|Year to date/);
  });

  it("never labels a range on this page as a forecast", () => {
    expect(scopeForRange("ytd")).toBe("to_date");
    expect(scopeForRange("slot")).toBe("to_date");
    expect(scopeForRange("full_year")).toBe("full_year_actual");
    expect(scopeForRange("previous_year")).toBe("full_year_actual");
  });
});

describe("the external id in a URL (step E1)", () => {
  /**
   * Both shapes exist in real registers. An unencoded slash becomes a second
   * path segment, which breaks Next's route matching and the sidebar's
   * `"/" + pathname.split("/")[1]` active-state match.
   */
  it("survives a slash and a space", () => {
    for (const id of ["EMP/0012", "0012 A", "E0002"]) {
      const href = employeeFileHref(id);
      expect(href.startsWith("/employees/")).toBe(true);
      // One segment after /employees, whatever the id contains.
      expect(href.slice("/employees/".length)).not.toContain("/");
      expect(decodeEmployeeId(href.slice("/employees/".length))).toBe(id);
    }
  });

  it("carries the scope params over to the file link, and nothing else", () => {
    const href = employeeFileHref("EMP/0012", "year=2026&range=full_year");
    expect(href).toBe("/employees/EMP%2F0012?year=2026&range=full_year");
  });

  it("returns a param it cannot decode rather than a mangled one", () => {
    expect(decodeEmployeeId("100%")).toBe("100%");
  });
});

describe("URL state (steps E2, E3)", () => {
  it("rejects anything it does not recognise, so the server keeps its defaults", () => {
    expect(parseRange("ytd")).toBe("ytd");
    expect(parseRange("last_quarter")).toBeUndefined();
    expect(parseScope("everyone_on_record")).toBe("everyone_on_record");
    expect(parseScope(null)).toBeUndefined();
    expect(parseYear("2026")).toBe(2026);
    expect(parseYear("26")).toBeUndefined();
    expect(parseYear("1999")).toBeUndefined();
    expect(parseCurrency("usd")).toBe("USD");
    expect(parseCurrency("dollars")).toBeUndefined();
  });

  it("trims and de-duplicates a department list", () => {
    expect(parseList("Engineering, Sales ,Engineering")).toEqual(["Engineering", "Sales"]);
    expect(parseList("")).toBeUndefined();
  });

  it("carries only the scope-shaped params into a file link", () => {
    const params = new URLSearchParams(
      "year=2026&range=ytd&cadence=monthly&currency=USD&page=3&q=ada&scope=currently_employed",
    );
    const carried = new URLSearchParams(scopeSearch(params));
    expect([...carried.keys()].sort()).toEqual(["cadence", "currency", "range", "year"]);
  });
});
