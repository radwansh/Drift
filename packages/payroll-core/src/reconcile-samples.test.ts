import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { reconcileRegister, type ReconcileRow } from "./reconcile";
import { classifyComponent, isTotalColumn } from "./annual";
import { roundToMinorUnits } from "./money";

/** The module rounds internally; sums written here have to round too. */
const round = (v: number) => roundToMinorUnits(v);

/**
 * Step 4's acceptance, stated as it is in the plan and run against the files
 * themselves rather than a fixture that imitates them:
 *
 *   - `samples/payroll_july_2026.csv` must fail with exactly 520.00 across
 *     E001, E005 and E017
 *   - `samples/payroll_june_2026.csv` must pass
 *   - all twelve `samples/2025` files must pass
 *
 * These are the repository's own upload fixtures, so this is the one test that
 * cannot be satisfied by agreeing with itself. The 2025 set matters most: it
 * carries employer contributions and quantity columns (`Overtime Hours`,
 * `Absence Days`), and a gate that counted either on an identity line would
 * fail all twelve — which is the failure mode that would have made this check
 * useless in production and then been switched off.
 */

const SAMPLES = path.resolve(import.meta.dirname, "../../../samples");

const ID_HEADER = "Employee ID";
const GROSS_HEADER = "Gross Salary";
const NET_HEADER = "Net Salary";
/** Headers that are identity, not money. */
const NON_COMPONENT = new Set([ID_HEADER, "Full Name", "Department"]);

function parse(file: string): ReconcileRow[] {
  // By code point, the way `server/upload/parser.ts` does it: a BOM written as
  // a regex literal is irregular whitespace in source and eslint rejects it.
  const raw = readFileSync(file, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0]!.split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const components: Record<string, number | null> = {};
    let gross = 0;
    let net = 0;
    let employeeId = "";

    headers.forEach((header, i) => {
      const cell = cells[i] ?? "";
      if (header === ID_HEADER) {
        employeeId = cell;
        return;
      }
      if (header === GROSS_HEADER) {
        gross = Number(cell);
        return;
      }
      if (header === NET_HEADER) {
        net = Number(cell);
        return;
      }
      if (NON_COMPONENT.has(header)) return;
      components[header] = cell === "" ? null : Number(cell);
    });

    return { employeeId, gross, net, components };
  });
}

function csvFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((f) => path.join(dir, f));
}

describe("the classifier puts the sample registers' columns on the right side", () => {
  // The identities are only as good as this, so it is asserted rather than
  // assumed: a column silently landing in `uncategorised` would be dropped
  // from both lines and the gate would pass a broken file.
  it("places every money column in the 2025 fixtures", () => {
    const rows = parse(path.join(SAMPLES, "2025", "payroll_2025_01_january.csv"));
    const keys = Object.keys(rows[0]!.components);

    const placed = Object.fromEntries(keys.map((k) => [k, classifyComponent(k)]));

    expect(placed).toEqual({
      "Base Salary": "base_salary",
      "Housing Allowance": "allowance",
      "Transport Allowance": "allowance",
      "Meal Allowance": "allowance",
      "Performance Bonus": "bonus_commission",
      "Sales Commission": "bonus_commission",
      "Overtime Pay": "overtime",
      // Deliberately unplaced, and documented as such by the generator that
      // writes these files: the classifier does not recognise it, so it
      // exercises `other_earnings_balance` and the data-quality warning. The
      // gate must therefore carry an unplaced column on the earnings side
      // rather than treat it as a missing 776.70, which is what it did on the
      // first run of this test.
      "Expense Reimbursement": "uncategorised",
      "Overtime Hours": "other_quantity",
      "Absence Days": "absence_days",
      "Income Tax": "income_tax",
      "Social Security Employee": "social_security_employee",
      "Loan Repayment": "other_deduction",
      "Unpaid Leave Deduction": "absence_deduction",
      "Social Security Employer": "social_security_employer",
      "Health Insurance Employer": "other_employer_cost",
    });

    // Step 3b: employer health insurance is not social security. If it were,
    // the statutory line and `employerOnCostRate` would both be overstated.
    expect(classifyComponent("Health Insurance Employer")).not.toBe("social_security_employer");

    // Exactly one unplaced column, and it is the intended one.
    expect(keys.filter((k) => classifyComponent(k) === "uncategorised")).toEqual([
      "Expense Reimbursement",
    ]);
    expect(keys.filter(isTotalColumn)).toEqual([]);
  });

  it("places every money column in the 2026 registers", () => {
    const rows = parse(path.join(SAMPLES, "payroll_june_2026.csv"));
    const placed = Object.fromEntries(
      Object.keys(rows[0]!.components).map((k) => [k, classifyComponent(k)]),
    );

    expect(placed).toEqual({
      "Base Salary": "base_salary",
      "Housing Allowance": "allowance",
      "Transport Allowance": "allowance",
      Bonus: "bonus_commission",
      "Tax Deduction": "income_tax",
      "Insurance Deduction": "other_deduction",
    });
  });
});

describe("payroll_july_2026.csv — the file the plan names", () => {
  const report = reconcileRegister({ rows: parse(path.join(SAMPLES, "payroll_july_2026.csv")) });

  it("fails", () => {
    expect(report.balanced).toBe(false);
  });

  it("fails on exactly E001, E005 and E017", () => {
    expect(report.breaches.map((b) => b.employeeId)).toEqual(["E001", "E005", "E017"]);
  });

  it("fails on the earnings identity only, totalling 520.00", () => {
    expect(report.breaches.map((b) => b.code)).toEqual([
      "earnings_not_gross",
      "earnings_not_gross",
      "earnings_not_gross",
    ]);

    // The direction matters and the plan's "+520.00" does not state it: the
    // earnings columns add up to 520.00 MORE than the Gross column claims, so
    // 520.00 of pay is in the register and not in its own total.
    const total = report.breaches.reduce((sum, b) => sum + b.difference, 0);
    expect(total).toBe(-520);
    expect(report.breaches.map((b) => b.difference)).toEqual([-300, -20, -200]);

    expect(report.totals.gross - report.totals.earnings).toBe(-520);
  });

  it("reconciles net exactly, so the gap is on one line and not both", () => {
    expect(report.breaches.filter((b) => b.code === "deductions_not_net")).toEqual([]);
    expect(report.totals.gross - report.totals.deductions - report.totals.net).toBe(0);
  });

  it("names the rows in a sentence the admin can act on", () => {
    const text = report.breaches.map((b) => b.employeeId).join(" ");
    expect(text).toBe("E001 E005 E017");
  });
});

describe("payroll_june_2026.csv", () => {
  it("passes", () => {
    const report = reconcileRegister({ rows: parse(path.join(SAMPLES, "payroll_june_2026.csv")) });

    expect(report.breaches).toEqual([]);
    expect(report.mixedSignColumns).toEqual([]);
    expect(report.balanced).toBe(true);
    expect(report.totals.gross).toBe(242630);
    expect(report.totals.net).toBe(194160);
  });
});

describe("the twelve samples/2025 registers", () => {
  const files = csvFiles(path.join(SAMPLES, "2025"));

  it("is twelve files", () => {
    expect(files).toHaveLength(12);
  });

  it.each(files.map((f) => [path.basename(f), f] as const))("%s passes", (_name, file) => {
    const rows = parse(file);
    const report = reconcileRegister({ rows });

    expect(rows.length).toBeGreaterThan(100);
    expect(report.breaches).toEqual([]);
    expect(report.mixedSignColumns).toEqual([]);
    expect(report.balanced).toBe(true);

    // Both identities tie out at the period level too, to the cent. Rounded
    // because the sums here are the test's own arithmetic: adding 150 already
    // rounded figures reintroduces float residue the module never carries.
    expect(round(report.totals.earnings + report.totals.unplaced)).toBe(report.totals.gross);
    expect(round(report.totals.gross - report.totals.deductions)).toBe(report.totals.net);
    // And the employer side is real, so the exclusion is doing work here.
    expect(report.totals.employerCosts).toBeGreaterThan(0);
  });

  it("declares the unplaced column rather than blocking on it", () => {
    // The distinction the gate turns on: the register adds up, Clarivo just
    // does not know what one of its columns is. Blocking here would stop the
    // first real upload and the check would be switched off.
    const report = reconcileRegister({
      rows: parse(path.join(SAMPLES, "2025", "payroll_2025_01_january.csv")),
    });

    expect(report.balanced).toBe(true);
    expect(report.unplacedColumns.map((c) => c.componentKey)).toEqual(["Expense Reimbursement"]);
    // The README's own figure for January.
    expect(report.unplacedColumns[0]?.total).toBeCloseTo(34721, 0);
    expect(report.totals.unplaced).toBeCloseTo(34721, 0);
  });

  it("still blocks when the unplaced column does not explain the gap", () => {
    // Same file, one gross moved. The unplaced column is unchanged, so the
    // register itself no longer adds up and that is a different verdict.
    const rows = parse(path.join(SAMPLES, "2025", "payroll_2025_01_january.csv"));
    const first = rows[0]!;
    const report = reconcileRegister({
      rows: [{ ...first, gross: first.gross + 100 }, ...rows.slice(1)],
    });

    expect(report.balanced).toBe(false);
    // Both identities, because gross is on both sides of them: the earnings no
    // longer reach it, and gross minus the deductions no longer lands on net.
    expect(report.breaches.map((b) => b.code)).toEqual(["earnings_not_gross", "deductions_not_net"]);
    expect(report.breaches.every((b) => b.employeeId === first.employeeId)).toBe(true);
    expect(report.breaches.map((b) => b.difference)).toEqual([100, -100]);
    // And it is still reported, so the panel shows both facts at once.
    expect(report.unplacedColumns).toHaveLength(1);
  });
});

describe("a register one cent out", () => {
  it("fails, taking a real file and moving a single net by 0.01", () => {
    const rows = parse(path.join(SAMPLES, "payroll_june_2026.csv"));
    const first = rows[0]!;
    const nudged = [{ ...first, net: first.net + 0.01 }, ...rows.slice(1)];

    const report = reconcileRegister({ rows: nudged });
    expect(report.balanced).toBe(false);
    expect(report.breaches).toHaveLength(1);
    expect(report.breaches[0]).toMatchObject({
      code: "deductions_not_net",
      employeeId: first.employeeId,
      difference: 0.01,
    });
  });
});
