import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { ensureUser } from "@/server/ensure-user";
import { payrollPeriodsRouter } from "@/server/routers/payroll-periods";
import { suggestColumnRole } from "@saas/payroll-core";

/**
 * The Australian registers through the app, not through the engine.
 *
 * `packages/payroll-core/src/au/fixtures.test.ts` proves the six files in
 * `samples/au/` reconcile and what the Payday Super check says about them. This
 * proves the other half: that the upload path **accepts** them — the gate in
 * `payrollPeriods.ingest` refused all six — and that the check reaches the data
 * check panel through `payrollPeriods.checkData`, gated on the company's own
 * currency rather than the one chosen for the upload.
 */

const AU_SAMPLES = path.resolve(import.meta.dirname, "../../../samples/au");
const XERO_P1 = "xero_fortnight_2026-10-05_to_2026-10-18.csv";

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

function caller(clerkUserId: string) {
  return payrollPeriodsRouter.createCaller({ userId: clerkUserId, db: ctx.db } as never);
}

/** The CSV as the rows the client sends: objects keyed by header. */
function sheet(file: string): Record<string, unknown>[] {
  const raw = readFileSync(path.join(AU_SAMPLES, file), "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function headersOf(file: string): string[] {
  const raw = readFileSync(path.join(AU_SAMPLES, file), "utf8");
  return raw.split(/\r?\n/)[0]!.split(",").map((h) => h.trim());
}

const BASE = {
  mappedComponent: "",
  isEmployeeId: false,
  isEmployeeName: false,
  isDepartment: false,
  isGrossSalary: false,
  isNetSalary: false,
};

/**
 * The mapping the upload modal builds, in the modal's own order: an identifier
 * header wins, then `suggestColumnRole`, then the column is pay.
 */
function mappingsFor(file: string, australian: boolean) {
  const identity: Record<string, Partial<typeof BASE>> = {
    "Employee ID": { isEmployeeId: true },
    "Full Name": { isEmployeeName: true },
    Department: { isDepartment: true },
    "Gross Earnings": { isGrossSalary: true },
    "Net Pay": { isNetSalary: true },
  };

  return headersOf(file).map((header) => {
    const ident = identity[header];
    if (ident) return { ...BASE, ...ident, sourceColumn: header };
    const role = suggestColumnRole(header, { australian });
    if (role?.kind === "snapshotField") {
      return { ...BASE, sourceColumn: header, snapshotField: role.field };
    }
    if (role?.kind === "dimension") {
      return { ...BASE, sourceColumn: header, dimensionName: role.name };
    }
    return { ...BASE, sourceColumn: header, mappedComponent: header };
  });
}

async function setCurrency(companyId: string, code: string) {
  await ctx.db.execute(
    sql`UPDATE companies SET currency_code = ${code} WHERE id = ${companyId}`,
  );
}

const PERIOD = { periodStart: "2026-10-05", periodEnd: "2026-10-18" };

describe("the upload path accepts an Australian register", () => {
  it("passes the gate and lands the period, with every control total ticking", async () => {
    const user = await ensureUser(ctx.db, "clerk_au_ingest", { email: "au@gate.test" });
    await setCurrency(user.companyId, "AUD");

    const result = await caller("clerk_au_ingest").ingest({
      rows: sheet(XERO_P1),
      mappings: mappingsFor(XERO_P1, true),
      periodType: "bi_weekly" as const,
      ...PERIOD,
      currencyCode: "AUD",
      filename: XERO_P1,
      // The register's own totals, from `samples/au/README.md`.
      controlTotalGross: 25_020.96,
      controlTotalNet: 19_116.46,
    });

    expect(result.employeeCount).toBe(7);
    expect(Number(result.totalGross)).toBeCloseTo(25_020.96, 2);
    expect(Number(result.totalNet)).toBeCloseTo(19_116.46, 2);
    // No column was unreadable: in particular neither money column was offered
    // as the termination date and then refused.
    expect(result.columnIssues).toEqual([]);
  });

  it("stores the leaver's real termination date, and no invented ones", async () => {
    const res = await ctx.db.execute(sql`
      SELECT employee_external_id AS "id", hire_date AS "hire", termination_date AS "term"
      FROM employee_snapshots
      WHERE termination_date IS NOT NULL
      ORDER BY employee_external_id
    `);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ id: "AU-0006", term: "2026-10-14" });

    // And every row has the hire date the register carried.
    const hires = await ctx.db.execute(sql`
      SELECT count(*)::int AS n FROM employee_snapshots WHERE hire_date IS NOT NULL
    `);
    expect((hires.rows[0] as { n: number }).n).toBe(7);
  });
});

describe("the data check carries the Payday Super report", () => {
  it("runs it for an AUD company and finds nobody below 12%", async () => {
    const user = await ensureUser(ctx.db, "clerk_au_check", { email: "aucheck@gate.test" });
    await setCurrency(user.companyId, "AUD");

    const check = await caller("clerk_au_check").checkData({
      rows: sheet(XERO_P1),
      mappings: mappingsFor(XERO_P1, true),
      currencyCode: "AUD",
      ...PERIOD,
    });

    expect(check.valid).toBe(true);
    expect(check.reconciliation?.balanced).toBe(true);
    expect(check.paydaySuper?.status).toBe("ran");
    expect(check.paydaySuper?.rates?.financialYear).toBe("2026-27");
    expect(check.paydaySuper?.totals).toMatchObject({
      below: 0,
      shortfall: 0,
      expected: 2731.97,
      actual: 2731.97,
      qualifyingEarnings: 22_766.46,
    });
    // A clean result says nothing in the panel.
    expect(check.warnings).toEqual([]);
  });

  /**
   * A finding is a **warning**, never an error: the figures are the employer's
   * own and refusing their file over the ATO's 12% would be refusing it over a
   * conclusion Clarivo is not entitled to draw (spec 8).
   */
  it("reports a shortfall without blocking the import", async () => {
    const user = await ensureUser(ctx.db, "clerk_au_short", { email: "aushort@gate.test" });
    await setCurrency(user.companyId, "AUD");

    const rows = sheet(XERO_P1).map((r) =>
      r["Employee ID"] === "AU-0003"
        ? { ...r, "Superannuation Guarantee Contribution": "123.12" }
        : r,
    );

    const check = await caller("clerk_au_short").checkData({
      rows,
      mappings: mappingsFor(XERO_P1, true),
      currencyCode: "AUD",
      ...PERIOD,
    });

    // The register still adds up — employer super sits outside both identities.
    expect(check.reconciliation?.balanced).toBe(true);
    expect(check.valid).toBe(true);
    expect(check.errors).toEqual([]);
    expect(check.paydaySuper?.totals.below).toBe(1);

    const texts = check.warnings.map((w) => w.message);
    expect(texts.some((t) => t.includes("below 12% of their qualifying earnings"))).toBe(true);
    expect(texts.some((t) => t.includes("AU-0003"))).toBe(true);
    // Section 1.1: the card states its basis, so a reader who knows the company
    // is not Australian can see why it is there.
    expect(texts.some((t) => t.includes("reporting in AUD"))).toBe(true);
  });

  /**
   * Section 1.2: the proxy is the **company's** currency, not the period's.
   * `payroll_periods.currency_code` is a second field and the two can disagree;
   * a per-period read would turn the check on and off between periods of one
   * year.
   */
  it("reads the company's currency, not the one chosen for the upload", async () => {
    const user = await ensureUser(ctx.db, "clerk_au_period", { email: "auperiod@gate.test" });
    await setCurrency(user.companyId, "USD");

    const check = await caller("clerk_au_period").checkData({
      rows: sheet(XERO_P1),
      // AUD for this upload, while the company is still on the USD default.
      mappings: mappingsFor(XERO_P1, true),
      currencyCode: "AUD",
      ...PERIOD,
    });

    expect(check.paydaySuper?.status).toBe("not_australian");
    // And the miss is loud, because this is the likelier direction to be wrong
    // in: `companies.currency_code` defaults to USD.
    expect(check.warnings.map((w) => w.message)).toEqual([
      "This register has a superannuation column (Superannuation Guarantee Contribution), " +
        "but the company currency is not AUD. Set it to AUD to enable the Payday Super check.",
    ]);
    // Still only a warning: the upload is not blocked over a currency setting.
    expect(check.valid).toBe(true);
  });

  it("does not run at all when the caller sends no period dates", async () => {
    const user = await ensureUser(ctx.db, "clerk_au_nodates", { email: "aunodates@gate.test" });
    await setCurrency(user.companyId, "AUD");

    const check = await caller("clerk_au_nodates").checkData({
      rows: sheet(XERO_P1),
      mappings: mappingsFor(XERO_P1, true),
      currencyCode: "AUD",
    });

    expect(check.paydaySuper).toBeNull();
    expect(check.reconciliation?.balanced).toBe(true);
    expect(check.valid).toBe(true);
  });
});
