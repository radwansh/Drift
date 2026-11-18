import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyComponent, classifyComponentWithReason } from "../annual/classify";
import { readDateColumn, suggestColumnRole, type SnapshotField } from "../ingest";
import { roundToMinorUnits } from "../money";
import { reconcileRegister, type ReconcileRow } from "../reconcile";
import { runPaydaySuperCheck, type PaydaySuperRow } from "./payday-super";

/**
 * The six `samples/au/` fixtures, through the real pipeline.
 *
 * A unit test over a hand-written header list is not evidence that an Xero
 * export reconciles, so this reads the files off disk and puts each column
 * through the same three steps the upload does, in the same order:
 *
 *   1. an identity header wins (the id, the name, the department, gross, net),
 *   2. then `suggestColumnRole`, which is a date, an FTE or a dimension,
 *   3. then the column is pay, and `classifyComponent` decides the side.
 *
 * That order is the point of step 2 being here at all: `suggestColumnRole`
 * runs **before** the classifier and a snapshot role wins, so until the money
 * veto was added, `Unused Annual Leave on Termination`,
 * `Annual Leave Loading on Termination` and `Employment Termination Payment`
 * were offered as the termination **date** column and never reached the
 * classifier (spec 9.3). A test that called `classifyComponent` directly would
 * pass with that defect still in place.
 *
 * `docs/AU_PAYROLL_SPEC.md` section 9.2 is the acceptance target: every one of
 * these six files is arithmetically correct and every one of them was refused.
 */

const SAMPLES = path.resolve(import.meta.dirname, "../../../../samples/au");

interface Layout {
  file: string;
  system: string;
  id: string;
  name: string;
  department?: string;
  gross: string;
  net: string;
  periodStart: string;
  periodEnd: string;
  /** The register's own totals, from `samples/au/README.md`. */
  controlGross: number;
  controlNet: number;
  employerSuper: number;
}

const P1 = { start: "2026-10-05", end: "2026-10-18", gross: 25_020.96, net: 19_116.46, super: 2_781.97 };
const P2 = { start: "2026-10-19", end: "2026-11-01", gross: 21_203.34, net: 16_478.84, super: 2_519.52 };

function layout(
  system: string,
  file: string,
  headers: { id: string; name: string; department?: string; gross: string; net: string },
  period: typeof P1,
): Layout {
  return {
    system,
    file,
    ...headers,
    periodStart: period.start,
    periodEnd: period.end,
    controlGross: period.gross,
    controlNet: period.net,
    employerSuper: period.super,
  };
}

const LAYOUTS: readonly Layout[] = [
  layout("Xero", "xero_fortnight_2026-10-05_to_2026-10-18.csv", {
    id: "Employee ID", name: "Full Name", department: "Department",
    gross: "Gross Earnings", net: "Net Pay",
  }, P1),
  layout("Xero", "xero_fortnight_2026-10-19_to_2026-11-01.csv", {
    id: "Employee ID", name: "Full Name", department: "Department",
    gross: "Gross Earnings", net: "Net Pay",
  }, P2),
  layout("MYOB", "myob_fortnight_2026-10-05_to_2026-10-18.csv", {
    id: "Card ID", name: "Employee Name", department: "Department",
    gross: "Total Wages", net: "Net Pay",
  }, P1),
  layout("MYOB", "myob_fortnight_2026-10-19_to_2026-11-01.csv", {
    id: "Card ID", name: "Employee Name", department: "Department",
    gross: "Total Wages", net: "Net Pay",
  }, P2),
  layout("Employment Hero", "employment_hero_fortnight_2026-10-05_to_2026-10-18.csv", {
    id: "Employee Id", name: "Employee Name",
    gross: "Gross Earnings", net: "Net Earnings",
  }, P1),
  layout("Employment Hero", "employment_hero_fortnight_2026-10-19_to_2026-11-01.csv", {
    id: "Employee Id", name: "Employee Name",
    gross: "Gross Earnings", net: "Net Earnings",
  }, P2),
];

interface ParsedFile {
  layout: Layout;
  headers: string[];
  /** Columns the role step claimed, and what it claimed them as. */
  roles: Record<string, string>;
  /** Columns that reached the classifier. */
  componentKeys: string[];
  rows: PaydaySuperRow[];
}

/** Read by code point, the way `server/upload/parser.ts` does it. */
function readCsv(file: string): { headers: string[]; cells: string[][] } {
  const raw = readFileSync(file, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return {
    headers: lines[0]!.split(",").map((h) => h.trim()),
    cells: lines.slice(1).map((l) => l.split(",").map((c) => c.trim())),
  };
}

function parse(l: Layout): ParsedFile {
  const { headers, cells } = readCsv(path.join(SAMPLES, l.file));
  const identity = new Set([l.id, l.name, l.department, l.gross, l.net].filter(Boolean) as string[]);

  const roles: Record<string, string> = {};
  const componentKeys: string[] = [];
  const snapshotColumns: Partial<Record<SnapshotField, string>> = {};

  for (const header of headers) {
    if (identity.has(header)) continue;
    // Australian company, so the `ETP` collision resolves the Australian way.
    const role = suggestColumnRole(header, { australian: true });
    if (role === null) {
      componentKeys.push(header);
      continue;
    }
    if (role.kind === "snapshotField") {
      roles[header] = role.field;
      snapshotColumns[role.field] = header;
    } else {
      roles[header] = `dimension:${role.name}`;
    }
  }

  const column = (header: string) => headers.indexOf(header);
  const dates = (field: SnapshotField): (string | null)[] => {
    const header = snapshotColumns[field];
    if (!header) return cells.map(() => null);
    return readDateColumn(cells.map((row) => row[column(header)] ?? "")).values;
  };
  const hireDates = dates("hire_date");
  const terminationDates = dates("termination_date");

  const rows = cells.map((row, i) => {
    const components: Record<string, number | null> = {};
    for (const key of componentKeys) {
      const cell = row[column(key)] ?? "";
      components[key] = cell === "" ? null : Number(cell);
    }
    return {
      employeeId: row[column(l.id)] ?? "",
      gross: Number(row[column(l.gross)]),
      net: Number(row[column(l.net)]),
      components,
      hireDate: hireDates[i] ?? null,
      terminationDate: terminationDates[i] ?? null,
    };
  });

  return { layout: l, headers, roles, componentKeys, rows };
}

const FILES = LAYOUTS.map(parse);
const byName = (needle: string) => FILES.filter((f) => f.layout.file.includes(needle));
const one = (needle: string) => {
  const found = FILES.find((f) => f.layout.file === needle);
  if (!found) throw new Error(`no fixture ${needle}`);
  return found;
};

const AUD = { currencyCode: "AUD" };
const round = (v: number) => roundToMinorUnits(v);

function reconcile(f: ParsedFile) {
  const rows: ReconcileRow[] = f.rows.map((r) => ({
    employeeId: r.employeeId,
    gross: r.gross,
    net: r.net,
    components: r.components,
  }));
  return reconcileRegister({ rows, decimals: 2 });
}

function check(f: ParsedFile) {
  return runPaydaySuperCheck({
    company: AUD,
    period: { start: f.layout.periodStart, end: f.layout.periodEnd },
    rows: f.rows,
  });
}

describe("samples/au — the files are read at all", () => {
  it("is six files, seven rows each", () => {
    expect(FILES).toHaveLength(6);
    for (const f of FILES) expect(f.rows, f.layout.file).toHaveLength(7);
  });

  it("ticks against the README's control totals", () => {
    for (const f of FILES) {
      expect(round(f.rows.reduce((s, r) => s + r.gross, 0)), f.layout.file).toBe(f.layout.controlGross);
      expect(round(f.rows.reduce((s, r) => s + r.net, 0)), f.layout.file).toBe(f.layout.controlNet);
    }
  });
});

/**
 * Spec 9.3, on the real files. Both collisions are column-role collisions, so
 * they are asserted as roles — the classifier never saw these columns.
 */
describe("suggestColumnRole no longer claims the money columns", () => {
  it("reads the two date columns and nothing else as a date", () => {
    const xero = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    expect(xero.roles).toEqual({
      FTE: "fte",
      "Start Date": "hire_date",
      "Termination Date": "termination_date",
    });
  });

  it("leaves `Unused Annual Leave on Termination` and its loading as money", () => {
    const xero = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    for (const key of ["Unused Annual Leave on Termination", "Annual Leave Loading on Termination"]) {
      expect(xero.roles[key], key).toBeUndefined();
      expect(xero.componentKeys, key).toContain(key);
    }
  });

  it("reads AU-0006's termination date, and only AU-0006's", () => {
    const xero = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    const dated = xero.rows.filter((r) => r.terminationDate !== null);
    expect(dated.map((r) => [r.employeeId, r.terminationDate])).toEqual([["AU-0006", "2026-10-14"]]);
    // Every row has a hire date, and the leaver's is the one from 2018.
    expect(xero.rows.map((r) => r.hireDate).filter(Boolean)).toHaveLength(7);
  });

  it("would have written a date from a money column, which is why the veto exists", () => {
    // The 1,600.00 and 280.00 in these fixtures fall outside the Excel-serial
    // window and were reported unreadable, which is what made the defect look
    // harmless. A realistic ETP does not: spec 9.3's own figures.
    expect(readDateColumn(["40000"]).values).toEqual(["2009-07-06"]);
    expect(readDateColumn(["52500.50"]).values).toEqual(["2043-09-26"]);
    // And the French reading of `ETP` is untouched when nothing says Australia.
    expect(suggestColumnRole("ETP")).toEqual({ kind: "snapshotField", field: "fte" });
    expect(suggestColumnRole("ETP", { australian: true })).toBeNull();
    expect(classifyComponent("ETP")).toBe("other_earning");
  });
});

/**
 * Spec 9.2, which is the acceptance: **all six must reconcile.**
 *
 * Before:
 *
 *   | File                      | Row breaches | Earnings placed / gross | Employer cost |
 *   |---------------------------|--------------|-------------------------|---------------|
 *   | xero ...10-18             | 9            |  2,422.50 / 25,020.96   | 2,731.97 / 2,781.97 |
 *   | xero ...11-01             | 9            |  1,172.00 / 21,203.34   | 2,469.52 / 2,519.52 |
 *   | myob ...10-18             | 10           | 25,240.96 / 25,020.96   |     0.00 / 2,781.97 |
 *   | myob ...11-01             | 10           | 21,400.46 / 21,203.34   |     0.00 / 2,519.52 |
 *   | employment_hero ...10-18  | 14           |     0.00 / 25,020.96    |    50.00 / 2,781.97 |
 *   | employment_hero ...11-01  | 14           |     0.00 / 21,203.34    |    50.00 / 2,519.52 |
 */
describe("reconcileRegister — all six files", () => {
  it.each(FILES.map((f) => [f.layout.file, f] as const))("%s has no breach", (_name, f) => {
    const report = reconcile(f);
    expect(report.breaches, _name).toEqual([]);
    expect(report.mixedSignColumns, _name).toEqual([]);
    expect(report.balanced, _name).toBe(true);
  });

  it.each(FILES.map((f) => [f.layout.file, f] as const))(
    "%s places nothing unplaced and the whole employer cost",
    (_name, f) => {
      const report = reconcile(f);
      expect(report.unplacedColumns, _name).toEqual([]);
      expect(report.totals.employerCosts, _name).toBe(f.layout.employerSuper);
    },
  );

  it("places every earning on the two per-pay-item exports", () => {
    for (const f of [...byName("xero"), ...byName("myob")]) {
      const report = reconcile(f);
      expect(report.coverage, f.layout.file).toEqual({ earnings: true, deductions: true });
      expect(report.totals.earnings, f.layout.file).toBe(f.layout.controlGross);
      expect(report.totals.gross, f.layout.file).toBe(f.layout.controlGross);
      expect(round(report.totals.gross - report.totals.deductions), f.layout.file).toBe(
        report.totals.net,
      );
    }
  });

  /**
   * Employment Hero's Detailed Activity report is an **aggregate**: it carries
   * gross, taxable, tax-exempt and net, and no pay-item detail at all. So
   * identity 1 has nothing to state and is reported "not checked" rather than
   * passed — the module's third answer, which is exactly what an empty
   * earnings side means. Counting `Taxable Earnings` or `Tax Exempt Earnings`
   * toward gross would double-count the register, because they are the two
   * halves of it (spec 6.7).
   */
  it("does not pretend to check an identity Employment Hero cannot state", () => {
    for (const f of byName("employment_hero")) {
      const report = reconcile(f);
      expect(report.coverage, f.layout.file).toEqual({ earnings: false, deductions: true });
      expect(report.totals.earnings, f.layout.file).toBe(0);
      expect(round(report.totals.gross - report.totals.deductions), f.layout.file).toBe(
        report.totals.net,
      );
      expect(report.excludedKeys, f.layout.file).toContain("Taxable Earnings");
      expect(report.excludedKeys, f.layout.file).toContain("Tax Exempt Earnings");
    }
  });
});

describe("every column of every file is placed, with the rule that placed it", () => {
  it("Xero, period 1", () => {
    const f = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    expect(placements(f)).toEqual({
      "Ordinary Hours": ["base_salary", "au-ordinary-earnings"],
      "Unused Annual Leave on Termination": ["other_earning", "termination-pay"],
      "Annual Leave Loading on Termination": ["other_earning", "termination-pay"],
      "Overtime (1.5x)": ["overtime", "overtime"],
      "Tool Allowance": ["allowance", "allowance"],
      "Meal Allowance (Overtime)": ["allowance", "allowance"],
      Commission: ["bonus_commission", "bonus"],
      "PAYG Withholding": ["income_tax", "tax"],
      "Salary Sacrifice (Superannuation)": ["other_deduction", "au-salary-sacrifice-super"],
      "Union Fee": ["other_deduction", "other-deduction"],
      "Child Support Deduction": ["other_deduction", "other-deduction"],
      "Superannuation Guarantee Contribution": ["social_security_employer", "au-employer-super"],
      "Employer Additional Superannuation": ["other_employer_cost", "au-employer-super-additional"],
    });
  });

  it("Xero, period 2 — leave taken is pay, its loading is not the run rate", () => {
    const f = one("xero_fortnight_2026-10-19_to_2026-11-01.csv");
    expect(placements(f)["Annual Leave"]).toEqual(["base_salary", "leave-taken"]);
    expect(placements(f)["Annual Leave Loading"]).toEqual(["other_earning", "leave-loading"]);
  });

  it("MYOB, period 1", () => {
    const f = one("myob_fortnight_2026-10-05_to_2026-10-18.csv");
    expect(placements(f)).toEqual({
      "Base Salary": ["base_salary", "base"],
      "Base Hourly": ["base_salary", "base"],
      "Overtime (1.5x)": ["overtime", "overtime"],
      "Holiday Leave Loading": ["other_earning", "leave-loading"],
      "Unused Holiday Pay": ["other_earning", "termination-pay"],
      "Tool Allowance": ["allowance", "allowance"],
      "Meal Allowance": ["allowance", "allowance"],
      Commission: ["bonus_commission", "bonus"],
      // `Total Wages` is this layout's gross column and never reaches here.
      "PAYG Withholding": ["income_tax", "tax"],
      "Salary Sacrifice": ["other_deduction", "au-salary-sacrifice-super"],
      "Union Fee": ["other_deduction", "other-deduction"],
      "Child Support": ["other_deduction", "other-deduction"],
      "Total Deductions": ["ignore", "total-column"],
      "Superannuation Guarantee": ["social_security_employer", "au-employer-super"],
      "Employer Additional": ["other_employer_cost", "employer-additional"],
    });
  });

  it("MYOB, period 2 — paid holiday is the run rate taken as leave", () => {
    const f = one("myob_fortnight_2026-10-19_to_2026-11-01.csv");
    expect(placements(f)["Holiday Pay"]).toEqual(["base_salary", "salary-bare"]);
  });

  it("Employment Hero, both periods", () => {
    for (const f of byName("employment_hero")) {
      expect(placements(f), f.layout.file).toEqual({
        Hours: ["other_quantity", "quantity"],
        "Pre Tax Deductions": ["other_deduction", "taxable-base-deduction"],
        "Tax Exempt Earnings": ["ignore", "aggregate-column"],
        "Taxable Earnings": ["ignore", "aggregate-column"],
        PAYG: ["income_tax", "tax"],
        STSL: ["income_tax", "tax"],
        "Super Guarantee (SG)": ["social_security_employer", "au-employer-super"],
        "Employer Contribution": ["other_employer_cost", "employer-levy"],
        "Post Tax Deductions": ["other_deduction", "taxable-base-deduction"],
        "Gross Plus Super": ["ignore", "total-column"],
      });
      // `Location` is a dimension, not a 0.00 component on every head.
      expect(f.roles["Location"], f.layout.file).toBe("dimension:Location");
    }
  });

  it("leaves nothing uncategorised anywhere", () => {
    for (const f of FILES) {
      const unplaced = f.componentKeys.filter((k) => classifyComponent(k) === "uncategorised");
      expect(unplaced, f.layout.file).toEqual([]);
    }
  });
});

function placements(f: ParsedFile): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const key of f.componentKeys) {
    const reason = classifyComponentWithReason(key);
    out[key] = [reason.category, reason.rule];
  }
  return out;
}

/**
 * Spec 7, against `samples/au/README.md`'s per-employee qualifying-earnings
 * table — the figure the 12% applies to, which is **not** gross.
 */
describe("the Payday Super check on the real files", () => {
  const QE_P1: Record<string, number> = {
    "AU-0001": 4615.38, "AU-0002": 2936.0, "AU-0003": 2052.0, "AU-0004": 4576.92,
    "AU-0005": 3461.54, "AU-0006": 2240.0, "AU-0007": 2884.62,
  };
  const QE_P2: Record<string, number> = {
    "AU-0001": 4615.38, "AU-0002": 2936.0, "AU-0003": 2052.0, "AU-0004": 3076.92,
    "AU-0005": 3764.42, "AU-0007": 2884.62, "AU-0008": 1250.0,
  };

  it("computes the README's qualifying earnings for Xero, both periods", () => {
    for (const [f, expected] of [
      [one("xero_fortnight_2026-10-05_to_2026-10-18.csv"), QE_P1],
      [one("xero_fortnight_2026-10-19_to_2026-11-01.csv"), QE_P2],
    ] as const) {
      const report = check(f);
      expect(report.status).toBe("ran");
      const got = Object.fromEntries(report.employees.map((e) => [e.employeeId, e.qualifyingEarnings]));
      expect(got, f.layout.file).toEqual(expected);
    }
  });

  it("finds no employee below 12% on any of the four pay-item files", () => {
    for (const f of [...byName("xero"), ...byName("myob")]) {
      const report = check(f);
      expect(report.totals.below, f.layout.file).toBe(0);
      expect(report.totals.shortfall, f.layout.file).toBe(0);
      expect(
        report.employees.filter((e) => e.outcome === "below"),
        f.layout.file,
      ).toEqual([]);
    }
  });

  /**
   * Spec 7.7's headline, and the reason the fixtures exist: employer super is
   * 10.92% of gross in period 1 and 11.65% in period 2 and the employer is
   * exactly compliant in both.
   */
  it("would have reported a finding against a compliant employer on a gross base", () => {
    const f = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    const gross = f.layout.controlGross;
    const actualSuper = 2731.97;
    expect(round((actualSuper / gross) * 100)).toBe(10.92);
    // And per employee it is wrong in both directions at once.
    const report = check(f);
    const of = (id: string) => report.employees.find((e) => e.employeeId === id)!;
    expect(of("AU-0002").qualifyingEarnings).toBe(2936.0);
    expect(round((of("AU-0002").actual / 3310.5) * 100)).toBe(10.64);
    expect(of("AU-0006").qualifyingEarnings).toBe(2240.0);
    expect(round((of("AU-0006").actual / 4120.0) * 100)).toBe(6.52);
    for (const id of ["AU-0002", "AU-0006"]) {
      expect(of(id).shortfall, id).toBe(0);
      expect(of(id).outcome, id).toBe("at_or_above");
    }
  });

  /** Spec 7.5: compare per employee and sum the results, never 12% of a total. */
  it("sums per-employee amounts rather than taking 12% of a company total", () => {
    const report = check(one("xero_fortnight_2026-10-05_to_2026-10-18.csv"));
    expect(report.totals.qualifyingEarnings).toBe(22_766.46);
    expect(report.totals.expected).toBe(2731.97);
    expect(report.totals.actual).toBe(2731.97);
    // 12% of the total is a cent more, and that cent is not a finding.
    expect(round(22_766.46 * 0.12)).toBe(2731.98);
  });

  /**
   * Spec 7.3. AU-0001's 500.00 sits on the deduction side and gross is stated
   * pre-sacrifice, so qualifying earnings are 4,615.38 and nothing is added
   * back. The two branches give answers 500.00 apart, so the branch taken is
   * on the audit trail.
   */
  it("takes the pre-sacrifice branch, and says so", () => {
    for (const f of [...byName("xero"), ...byName("myob")]) {
      const report = check(f);
      const harriet = report.employees.find((e) => e.employeeId === "AU-0001")!;
      expect(harriet.breakdown.sacrifice.branch, f.layout.file).toBe("pre_sacrifice");
      expect(harriet.breakdown.sacrifice.total, f.layout.file).toBe(500);
      expect(harriet.breakdown.sacrifice.addBack, f.layout.file).toBe(0);
      expect(harriet.qualifyingEarnings, f.layout.file).toBe(4615.38);
      expect(harriet.notes.join(" "), f.layout.file).toMatch(/stated before the 500\.00 salary sacrifice/);
    }
  });

  /**
   * Spec 5.6, and the difference between the two pay-item exports. Xero splits
   * the loading into `Annual Leave Loading` and `Annual Leave Loading on
   * Termination`, which a header can decide. MYOB has **one**
   * `Holiday Leave Loading` column carrying 280.00 for a leaver's payout in
   * period 1 and 302.88 for leave taken in period 2 — not qualifying earnings
   * and qualifying earnings, in the same column. Where the system does not
   * split it, Clarivo cannot either: AU-0006's verdict flips depending on it,
   * so no verdict is reported.
   */
  it("declines to pick a reading of MYOB's single leave-loading column", () => {
    const report = check(one("myob_fortnight_2026-10-05_to_2026-10-18.csv"));
    const dougal = report.employees.find((e) => e.employeeId === "AU-0006")!;

    expect(dougal.outcome).toBe("uncertain");
    expect(dougal.severity).toBe("info");
    expect(dougal.uncertainKeys).toEqual(["Holiday Leave Loading"]);
    expect(dougal.qualifyingEarnings).toBe(2520.0);
    expect(dougal.qualifyingEarningsLow).toBe(2240.0);
    expect(dougal.expected).toBe(302.4);
    expect(dougal.expectedLow).toBe(268.8);
    expect(dougal.actual).toBe(268.8);
    expect(dougal.message).toMatch(/depends on `Holiday Leave Loading`/);
    expect(report.totals.uncertain).toBe(1);
    expect(report.totals.below).toBe(0);

    // Xero's split headers decide it, and the same employee passes cleanly.
    const xero = check(one("xero_fortnight_2026-10-05_to_2026-10-18.csv"));
    const same = xero.employees.find((e) => e.employeeId === "AU-0006")!;
    expect(same.outcome).toBe("at_or_above");
    expect(same.uncertainKeys).toEqual([]);
  });

  /**
   * Spec 5.5: carry the loading in the base, and where the outcome depends on
   * it, say so rather than reporting a clean pass. AU-0005's leave loading is
   * 302.88 of a 3,764.42 base.
   */
  it("passes AU-0005 and still names the loading the result rests on", () => {
    for (const f of [
      one("xero_fortnight_2026-10-19_to_2026-11-01.csv"),
      one("myob_fortnight_2026-10-19_to_2026-11-01.csv"),
    ]) {
      const mei = check(f).employees.find((e) => e.employeeId === "AU-0005")!;
      expect(mei.qualifyingEarnings, f.layout.file).toBe(3764.42);
      expect(mei.expected, f.layout.file).toBe(451.73);
      expect(mei.actual, f.layout.file).toBe(451.73);
      expect(mei.outcome, f.layout.file).toBe("at_or_above");
      expect(mei.notes.join(" "), f.layout.file).toMatch(
        /depends on `(Annual|Holiday) Leave Loading` being treated as qualifying earnings/,
      );
    }
  });

  /**
   * The pair the README calls out. AU-0002's gross rises 7.53% between the
   * periods and his super does not move at all, because every extra dollar is
   * overtime. AU-0005's gross rises 8.75% and her super rises with it, because
   * leave and leave loading are qualifying earnings.
   */
  it("holds AU-0002's base flat across a 7.53% rise in gross", () => {
    const p1 = check(one("xero_fortnight_2026-10-05_to_2026-10-18.csv"));
    const p2 = check(one("xero_fortnight_2026-10-19_to_2026-11-01.csv"));
    const callum = (r: typeof p1) => r.employees.find((e) => e.employeeId === "AU-0002")!;
    expect(callum(p1).qualifyingEarnings).toBe(2936.0);
    expect(callum(p2).qualifyingEarnings).toBe(2936.0);
    expect(callum(p1).actual).toBe(callum(p2).actual);
    const mei = (r: typeof p1) => r.employees.find((e) => e.employeeId === "AU-0005")!;
    expect(mei(p2).qualifyingEarnings).toBeGreaterThan(mei(p1).qualifyingEarnings);
    expect(mei(p2).actual).toBeGreaterThan(mei(p1).actual);
  });

  /**
   * Spec 7.6. Employment Hero's report carries no pay items, so there is no
   * base to take 12% of — a different answer from "below 12%", and one that
   * must never be reported as a finding.
   */
  it("reports Employment Hero as not checkable, not as a shortfall", () => {
    for (const f of byName("employment_hero")) {
      const report = check(f);
      expect(report.status, f.layout.file).toBe("ran");
      expect(report.totals.below, f.layout.file).toBe(0);
      expect(report.totals.notCheckable, f.layout.file).toBe(7);
      for (const e of report.employees) {
        expect(e.outcome, `${f.layout.file} ${e.employeeId}`).toBe("not_checkable");
        expect(e.severity, e.employeeId).toBe("info");
        expect(e.message, e.employeeId).toMatch(/no qualifying earnings on this register/);
      }
    }
  });

  /** Spec 7.8.3: AU-0008 started inside period 2. */
  it("reads the joiner's hire date from the register", () => {
    const f = one("xero_fortnight_2026-10-19_to_2026-11-01.csv");
    const tane = f.rows.find((r) => r.employeeId === "AU-0008")!;
    expect(tane.hireDate).toBe("2026-10-26");
    const result = check(f).employees.find((e) => e.employeeId === "AU-0008")!;
    // No shortfall to suppress: half a fortnight at 1,250.00 and 150.00 super.
    expect(result.qualifyingEarnings).toBe(1250);
    expect(result.expected).toBe(150);
    expect(result.outcome).toBe("at_or_above");
  });
});

/**
 * Spec 8.3, pinned as code rather than as prose. These are the three sentences
 * the product must never write, and the check's own strings are the ones most
 * likely to drift into them.
 */
describe("what the check must never say", () => {
  const forbidden: [RegExp, string][] = [
    [/\bbreach/i, "a breach of Payday Super is a legal conclusion"],
    [/\bbreached\b/i, "a breach of Payday Super is a legal conclusion"],
    [/\b(paid|payment|contribution)s? (was|were)? ?late\b/i, "Clarivo cannot see when money reached a fund"],
    [/\blate\b/i, "Clarivo cannot see when money reached a fund"],
    [/\bnon[- ]?compliant\b/i, "compliance is a legal conclusion"],
    [/\bguarantee charge\b/i, "the SGC cannot be quantified from a register"],
    [/\bpenalt/i, "the charge's penalty cannot be quantified from a register"],
    [/\bbusiness days?\b/i, "the deadline is not visible in a payroll file"],
    [/\bowes?\b/i, "Clarivo cannot say what is owed"],
    [/\bpayable\b/i, "Clarivo cannot say what is payable"],
  ];

  const everyString = () => {
    const out: string[] = [];
    for (const f of FILES) {
      const report = check(f);
      out.push(report.message, report.basis, ...report.warnings.map((w) => w.message));
      for (const e of report.employees) out.push(e.message, ...e.notes);
    }
    return out;
  };

  it.each(forbidden)("never writes %s — %s", (pattern) => {
    for (const text of everyString()) {
      expect(text, text).not.toMatch(pattern);
    }
  });

  it("says what it does mean instead, in section 8.3's own words", () => {
    // A synthetic shortfall on a real file: halve AU-0003's super.
    const f = one("xero_fortnight_2026-10-05_to_2026-10-18.csv");
    const rows = f.rows.map((r) =>
      r.employeeId === "AU-0003"
        ? {
            ...r,
            components: { ...r.components, "Superannuation Guarantee Contribution": 123.12 },
          }
        : r,
    );
    const report = runPaydaySuperCheck({
      company: AUD,
      period: { start: f.layout.periodStart, end: f.layout.periodEnd },
      rows,
    });

    expect(report.totals.below).toBe(1);
    expect(report.message).toBe(
      "Employer super for 1 employee is below 12% of their qualifying earnings in this period.",
    );
    const priya = report.employees.find((e) => e.employeeId === "AU-0003")!;
    expect(priya.outcome).toBe("below");
    expect(priya.severity).toBe("warning");
    expect(priya.shortfall).toBe(123.12);
    expect(priya.message).toBe(
      "Employer super of 123.12 is below 12% of this employee's qualifying earnings of 2052.00, " +
        "which is 246.24 — 123.12 less.",
    );
  });
});
