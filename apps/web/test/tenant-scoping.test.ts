import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { employeesRouter } from "@/server/routers/employees";
import { exportsRouter } from "@/server/routers/exports";
import { columnMappingsRouter } from "@/server/routers/column-mappings";

/**
 * Tenant isolation for the employees and exports routers.
 *
 * Both were `protectedProcedure` with no `companyId` filter: `employees.*`
 * answered any period or snapshot UUID from any tenant with names, components,
 * gross and net, and `exports.getStatus` returned any export record including
 * its `fileKey`. `exports.requestExport` stamped the caller's own company onto
 * a row without checking the comparison run belonged to it.
 *
 * Nothing in the app called either router, so there was no failing page to
 * notice — which is precisely why these need a test rather than a fix alone.
 *
 * Two companies throughout: Acme reads its own data and must be refused
 * Globex's. The refusal is NOT_FOUND rather than FORBIDDEN so the error does
 * not confirm the id exists.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  users: Record<Role, { id: string; clerkUserId: string }>;
  periodId: string;
  snapshotId: string;
  runId: string;
  exportId: string;
}

let ctx: TestDb;
let acme: Seeded;
let globex: Seeded;

async function seedCompany(db: TestDb["db"], slug: string, currency: string): Promise<Seeded> {
  const companyRes = await db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES (${slug}, ${slug}, ${currency})
    RETURNING id
  `);
  const companyId = (companyRes.rows[0] as { id: string }).id;

  const users = {} as Seeded["users"];
  for (const role of ["admin", "manager", "viewer"] as Role[]) {
    const clerkUserId = `clerk_${slug}_${role}`;
    const res = await db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@${slug}.test`}, ${role}, ${role}, ${clerkUserId})
      RETURNING id
    `);
    users[role] = { id: (res.rows[0] as { id: string }).id, clerkUserId };
  }

  const periodRes = await db.execute(sql`
    INSERT INTO payroll_periods
      (company_id, period_type, period_start, period_end, currency_code, status, source)
    VALUES (${companyId}, 'monthly', '2026-01-01', '2026-01-31', ${currency}, 'ready', 'upload')
    RETURNING id
  `);
  const periodId = (periodRes.rows[0] as { id: string }).id;

  const snapRes = await db.execute(sql`
    INSERT INTO employee_snapshots
      (payroll_period_id, employee_external_id, employee_name, department,
       components, gross_salary, net_salary, currency_code)
    VALUES (${periodId}, ${`${slug}-E1`}, ${`Employee of ${slug}`}, 'Ops',
            ${JSON.stringify({ "Base Salary": "800.00" })}::jsonb,
            '1000.00', '800.00', ${currency})
    RETURNING id
  `);
  const snapshotId = (snapRes.rows[0] as { id: string }).id;

  const runRes = await db.execute(sql`
    INSERT INTO comparison_runs
      (company_id, current_period_id, previous_period_id, status, created_by_id)
    VALUES (${companyId}, ${periodId}, ${periodId}, 'complete', ${users.admin.id})
    RETURNING id
  `);
  const runId = (runRes.rows[0] as { id: string }).id;

  const exportRes = await db.execute(sql`
    INSERT INTO export_history
      (company_id, comparison_run_id, format, status, file_key, requested_by_id)
    VALUES (${companyId}, ${runId}, 'xlsx', 'complete', ${`${slug}/secret-key.xlsx`}, ${users.admin.id})
    RETURNING id
  `);
  const exportId = (exportRes.rows[0] as { id: string }).id;

  return { companyId, users, periodId, snapshotId, runId, exportId };
}

function employeesCaller(seeded: Seeded, role: Role) {
  return employeesRouter.createCaller({ userId: seeded.users[role].clerkUserId, db: ctx.db } as never);
}

function exportsCaller(seeded: Seeded, role: Role) {
  return exportsRouter.createCaller({ userId: seeded.users[role].clerkUserId, db: ctx.db } as never);
}

beforeAll(async () => {
  ctx = await createTestDb();
  acme = await seedCompany(ctx.db, "acme", "USD");
  globex = await seedCompany(ctx.db, "globex", "LBP");
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("employees router is scoped to the caller's company", () => {
  it("listByPeriod returns the caller's own period", async () => {
    const res = await employeesCaller(acme, "admin").listByPeriod({ payrollPeriodId: acme.periodId });
    expect(res.total).toBe(1);
    expect(res.data[0]?.employeeName).toBe("Employee of acme");
  });

  it("listByPeriod refuses another company's period", async () => {
    await expect(
      employeesCaller(acme, "admin").listByPeriod({ payrollPeriodId: globex.periodId }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  it("getById returns the caller's own snapshot", async () => {
    const snap = await employeesCaller(acme, "admin").getById({ id: acme.snapshotId });
    expect(snap.employeeName).toBe("Employee of acme");
  });

  it("getById refuses another company's snapshot", async () => {
    await expect(
      employeesCaller(acme, "admin").getById({ id: globex.snapshotId }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  it("search returns matches within the caller's own period", async () => {
    const res = await employeesCaller(acme, "admin").search({
      payrollPeriodId: acme.periodId,
      query: "Employee",
    });
    expect(res).toHaveLength(1);
  });

  it("search refuses another company's period", async () => {
    await expect(
      employeesCaller(acme, "admin").search({ payrollPeriodId: globex.periodId, query: "Employee" }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  // Individual pay is admin-only, the same rule the annual drill-downs follow.
  it("a manager cannot read employee-level pay", async () => {
    await expect(
      employeesCaller(acme, "manager").listByPeriod({ payrollPeriodId: acme.periodId }),
    ).rejects.toThrow(/FORBIDDEN|admin role/i);
  });

  it("a viewer cannot read employee-level pay", async () => {
    await expect(
      employeesCaller(acme, "viewer").getById({ id: acme.snapshotId }),
    ).rejects.toThrow(/FORBIDDEN|admin role/i);
  });
});

describe("exports router is scoped to the caller's company", () => {
  it("getStatus returns the caller's own export", async () => {
    const rec = await exportsCaller(acme, "admin").getStatus({ id: acme.exportId });
    expect(rec.fileKey).toBe("acme/secret-key.xlsx");
  });

  it("getStatus refuses another company's export", async () => {
    await expect(
      exportsCaller(acme, "admin").getStatus({ id: globex.exportId }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  it("requestExport accepts the caller's own comparison run", async () => {
    const rec = await exportsCaller(acme, "admin").requestExport({
      comparisonRunId: acme.runId,
      format: "csv",
    });
    expect(rec?.companyId).toBe(acme.companyId);
  });

  it("requestExport refuses another company's comparison run", async () => {
    await expect(
      exportsCaller(acme, "admin").requestExport({ comparisonRunId: globex.runId, format: "csv" }),
    ).rejects.toThrow(/NOT_FOUND|not found/i);
  });

  it("list returns only the caller's own company's exports", async () => {
    const res = await exportsCaller(globex, "admin").list({});
    expect(res.data.length).toBeGreaterThan(0);
    for (const row of res.data) expect(row.companyId).toBe(globex.companyId);
  });
});

/**
 * Found while wiring step 9 through this router: `columnMappings.delete`
 * matched on `id` alone, so any signed-in user could delete another tenant's
 * mapping given its UUID — the same shape as finding 4a on
 * `payrollPeriods.delete`.
 *
 * It is `memberProcedure` now, so `ctx.companyId` comes from the middleware and
 * the scope costs no extra query. The id stays in the predicate: scoping by
 * company alone would delete the whole company's mappings.
 */
describe("columnMappings.delete is scoped to the caller's company", () => {
  async function seedMapping(seeded: Seeded, sourceColumn: string): Promise<string> {
    const res = await ctx.db.execute(sql`
      INSERT INTO company_column_mappings (company_id, source_column, mapped_component)
      VALUES (${seeded.companyId}, ${sourceColumn}, ${sourceColumn})
      RETURNING id
    `);
    return (res.rows[0] as { id: string }).id;
  }

  async function exists(id: string): Promise<boolean> {
    const res = await ctx.db.execute(
      sql`SELECT count(*)::int AS n FROM company_column_mappings WHERE id = ${id}`,
    );
    return (res.rows[0] as { n: number }).n === 1;
  }

  function caller(seeded: Seeded, role: Role) {
    return columnMappingsRouter.createCaller({
      userId: seeded.users[role].clerkUserId,
      db: ctx.db,
    } as never);
  }

  it("deletes the caller's own mapping", async () => {
    const id = await seedMapping(acme, "Own Column");
    const deleted = await caller(acme, "admin").delete({ id });
    expect(deleted.id).toBe(id);
    expect(await exists(id)).toBe(false);
  });

  it("refuses another company's mapping, and leaves it in place", async () => {
    const id = await seedMapping(globex, "Globex Column");
    await expect(caller(acme, "admin").delete({ id })).rejects.toThrow(/NOT_FOUND|not found/i);
    // The refusal has to be a no-op, not just an error after the write.
    expect(await exists(id)).toBe(true);
  });
});
