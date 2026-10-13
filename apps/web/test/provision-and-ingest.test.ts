import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { ensureUser } from "@/server/ensure-user";
import { payrollPeriodsRouter } from "@/server/routers/payroll-periods";
import { annualRouter } from "@/server/routers/annual";

/**
 * Steps 1-3 of docs/ANNUAL_PAGE_FIX_PLAN.md, against a real Postgres.
 *
 * Two things are pinned here. First, that a signed-in account with no database
 * presence gets one — the cause of the page redirecting to `/login` and
 * bouncing to `/dashboard`. Second, that an upload actually reaches Postgres
 * and shows up in the annual summary, which no upload ever did: the modal
 * faked the whole thing with a `setTimeout` and kept the result in a React
 * context.
 */

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

function periodsCaller(clerkUserId: string) {
  return payrollPeriodsRouter.createCaller({ userId: clerkUserId, db: ctx.db } as never);
}

function annualCaller(clerkUserId: string) {
  return annualRouter.createCaller({ userId: clerkUserId, db: ctx.db } as never);
}

/** A two-employee monthly sheet in the shape the client sends. */
function sheet(gross: number) {
  return {
    rows: [
      {
        "Employee ID": "E1",
        "Employee Name": "Ada",
        Department: "Engineering",
        "Basic Salary": String(gross / 2),
        "Income Tax": String(-(gross * 0.06)),
        "Gross Salary": String(gross / 2),
        "Net Salary": String((gross / 2) * 0.8),
      },
      {
        "Employee ID": "E2",
        "Employee Name": "Grace",
        Department: "Engineering",
        "Basic Salary": String(gross / 2),
        "Income Tax": String(-(gross * 0.06)),
        "Gross Salary": String(gross / 2),
        "Net Salary": String((gross / 2) * 0.8),
      },
    ],
    mappings: [
      { sourceColumn: "Employee ID", mappedComponent: "", isEmployeeId: true, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: false },
      { sourceColumn: "Employee Name", mappedComponent: "", isEmployeeId: false, isEmployeeName: true, isDepartment: false, isGrossSalary: false, isNetSalary: false },
      { sourceColumn: "Department", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: true, isGrossSalary: false, isNetSalary: false },
      { sourceColumn: "Gross Salary", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: true, isNetSalary: false },
      { sourceColumn: "Net Salary", mappedComponent: "", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: true },
      { sourceColumn: "Basic Salary", mappedComponent: "Basic Salary", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: false },
      { sourceColumn: "Income Tax", mappedComponent: "Income Tax", isEmployeeId: false, isEmployeeName: false, isDepartment: false, isGrossSalary: false, isNetSalary: false },
    ],
  };
}

describe("step 1: provisioning a signed-in account", () => {
  it("creates a company and an admin user for an account that has none", async () => {
    const user = await ensureUser(ctx.db, "clerk_fresh_user", {
      email: "fresh@example.test",
      name: "Fresh Person",
    });

    expect(user.clerkUserId).toBe("clerk_fresh_user");
    expect(user.companyId).toBeTruthy();
    expect(user.role).toBe("admin");
    expect(user.email).toBe("fresh@example.test");
  });

  it("is idempotent: a second call returns the same row, not a second company", async () => {
    const first = await ensureUser(ctx.db, "clerk_repeat", { email: "repeat@example.test" });
    const second = await ensureUser(ctx.db, "clerk_repeat", { email: "repeat@example.test" });

    expect(second.id).toBe(first.id);
    expect(second.companyId).toBe(first.companyId);

    const count = await ctx.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE clerk_user_id = 'clerk_repeat'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  it("satisfies the UNIQUE email column without a placeholder collision", async () => {
    // Two accounts with no email from Clerk must not collide on `users.email`,
    // which is UNIQUE NOT NULL. This is the same constraint that lets
    // auth.createCompany's `email: ""` succeed only once.
    const a = await ensureUser(ctx.db, "clerk_no_email_a");
    const b = await ensureUser(ctx.db, "clerk_no_email_b");

    expect(a.email).not.toBe(b.email);
    expect(a.companyId).not.toBe(b.companyId);
  });

  it("claims an invited row instead of creating a separate company", async () => {
    const owner = await ensureUser(ctx.db, "clerk_inviter", { email: "owner@invited.test" });
    await ctx.db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${owner.companyId}, 'colleague@invited.test', 'Colleague', 'manager', '')
    `);

    const joined = await ensureUser(ctx.db, "clerk_colleague", {
      email: "colleague@invited.test",
    });

    // Joined the inviting company, kept the invited role, did not get its own.
    expect(joined.companyId).toBe(owner.companyId);
    expect(joined.role).toBe("manager");
    expect(joined.clerkUserId).toBe("clerk_colleague");
  });
});

describe("step 3: an upload reaches the database", () => {
  it("writes the period, the snapshots and the aggregates, and marks it ready", async () => {
    const user = await ensureUser(ctx.db, "clerk_ingest", { email: "ingest@example.test" });
    const caller = periodsCaller("clerk_ingest");
    const data = sheet(10_000);

    const result = await caller.ingest({
      ...data,
      periodType: "monthly",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      currencyCode: "USD",
      filename: "january.csv",
    });

    expect(result.employeeCount).toBe(2);
    expect(result.totalGross).toBeCloseTo(10_000, 2);

    const period = await ctx.db.execute(sql`
      SELECT status, company_id AS "companyId", total_employees AS "totalEmployees"
      FROM payroll_periods WHERE id = ${result.periodId}
    `);
    const row = period.rows[0] as { status: string; companyId: string; totalEmployees: number };
    expect(row.status).toBe("ready");
    expect(row.companyId).toBe(user.companyId);
    expect(row.totalEmployees).toBe(2);

    const snaps = await ctx.db.execute(sql`
      SELECT count(*)::int AS n FROM employee_snapshots WHERE payroll_period_id = ${result.periodId}
    `);
    expect((snaps.rows[0] as { n: number }).n).toBe(2);

    // Written by rebuildPeriodComponentTotals before the period went ready, so
    // a period is never visible to the annual queries without its aggregates.
    const totals = await ctx.db.execute(sql`
      SELECT count(*)::int AS n FROM period_component_totals
      WHERE payroll_period_id = ${result.periodId}
    `);
    expect((totals.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it("makes the annual summary show the uploaded figures", async () => {
    await ensureUser(ctx.db, "clerk_visible", { email: "visible@example.test" });
    const caller = periodsCaller("clerk_visible");

    for (const month of [1, 2, 3]) {
      const mm = String(month).padStart(2, "0");
      const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
      await caller.ingest({
        ...sheet(10_000),
        periodType: "monthly",
        periodStart: `2026-${mm}-01`,
        periodEnd: `2026-${mm}-${lastDay}`,
        currencyCode: "USD",
        filename: `${mm}.csv`,
      });
    }

    const summary = await annualCaller("clerk_visible").getSummary({ year: 2026 });

    expect(summary.coverage.uploaded).toBe(3);
    expect(summary.bridge.actual.gross).toBeCloseTo(30_000, 2);
    // The reported requirement: a part-filled year still reports a full year.
    expect(summary.bridge.fullYear.gross).toBeGreaterThan(summary.bridge.actual.gross);
    expect(summary.periods).toHaveLength(12);
  });

  it("rejects an upload with no employee identifier mapped", async () => {
    await ensureUser(ctx.db, "clerk_noid", { email: "noid@example.test" });
    const data = sheet(10_000);

    await expect(
      periodsCaller("clerk_noid").ingest({
        ...data,
        mappings: data.mappings.map((m) => ({ ...m, isEmployeeId: false, isEmployeeName: false })),
        periodType: "monthly",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        currencyCode: "USD",
        filename: "bad.csv",
      }),
    ).rejects.toThrow(/employee ID or employee name/i);
  });

  it("rejects a period whose end precedes its start", async () => {
    await ensureUser(ctx.db, "clerk_baddates", { email: "baddates@example.test" });

    await expect(
      periodsCaller("clerk_baddates").ingest({
        ...sheet(10_000),
        periodType: "monthly",
        periodStart: "2026-03-01",
        periodEnd: "2026-01-31",
        currencyCode: "USD",
        filename: "bad.csv",
      }),
    ).rejects.toThrow(/before its start/i);
  });

  it("refuses a viewer, because an import is a company-wide write", async () => {
    const owner = await ensureUser(ctx.db, "clerk_vieweronly_owner", {
      email: "vowner@example.test",
    });
    await ctx.db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${owner.companyId}, 'viewer@example.test', 'Viewer', 'viewer', 'clerk_viewer_ingest')
    `);

    await expect(
      periodsCaller("clerk_viewer_ingest").ingest({
        ...sheet(10_000),
        periodType: "monthly",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        currencyCode: "USD",
        filename: "viewer.csv",
      }),
    ).rejects.toThrow(/admin or manager/i);
  });

  it("refuses to delete another tenant's period, and leaves the row intact", async () => {
    const mine = await ensureUser(ctx.db, "clerk_victim", { email: "victim@tenants.test" });
    await ensureUser(ctx.db, "clerk_attacker", { email: "attacker@tenants.test" });

    const created = await periodsCaller("clerk_victim").ingest({
      ...sheet(10_000),
      periodType: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      currencyCode: "USD",
      filename: "july.csv",
    });

    await expect(
      periodsCaller("clerk_attacker").delete({ id: created.periodId }),
    ).rejects.toThrow(/not found/i);

    const still = await ctx.db.execute(sql`
      SELECT company_id AS "companyId" FROM payroll_periods WHERE id = ${created.periodId}
    `);
    expect(still.rows).toHaveLength(1);
    expect((still.rows[0] as { companyId: string }).companyId).toBe(mine.companyId);

    // The owner can delete it.
    await periodsCaller("clerk_victim").delete({ id: created.periodId });
    const gone = await ctx.db.execute(sql`
      SELECT 1 FROM payroll_periods WHERE id = ${created.periodId}
    `);
    expect(gone.rows).toHaveLength(0);
  });

  it("clears only the caller's own periods", async () => {
    const keeper = await ensureUser(ctx.db, "clerk_keeper", { email: "keeper@clear.test" });
    await ensureUser(ctx.db, "clerk_clearer", { email: "clearer@clear.test" });

    await periodsCaller("clerk_keeper").ingest({
      ...sheet(10_000),
      periodType: "monthly",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      currencyCode: "USD",
      filename: "keeper.csv",
    });
    await periodsCaller("clerk_clearer").ingest({
      ...sheet(10_000),
      periodType: "monthly",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      currencyCode: "USD",
      filename: "clearer.csv",
    });

    const result = await periodsCaller("clerk_clearer").deleteAll();
    expect(result.deleted).toBeGreaterThan(0);

    const keeperRows = await ctx.db.execute(sql`
      SELECT count(*)::int AS n FROM payroll_periods WHERE company_id = ${keeper.companyId}
    `);
    expect((keeperRows.rows[0] as { n: number }).n).toBe(1);
  });

  it("files the period against the caller's own company", async () => {
    const a = await ensureUser(ctx.db, "clerk_tenant_a", { email: "a@tenants.test" });
    const b = await ensureUser(ctx.db, "clerk_tenant_b", { email: "b@tenants.test" });

    const created = await periodsCaller("clerk_tenant_a").ingest({
      ...sheet(10_000),
      periodType: "monthly",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currencyCode: "USD",
      filename: "may.csv",
    });

    const owned = await ctx.db.execute(sql`
      SELECT company_id AS "companyId" FROM payroll_periods WHERE id = ${created.periodId}
    `);
    expect((owned.rows[0] as { companyId: string }).companyId).toBe(a.companyId);
    expect((owned.rows[0] as { companyId: string }).companyId).not.toBe(b.companyId);
  });
});
