import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";

/**
 * What the database keeps, as opposed to what the engine computes.
 *
 * Steps 8a and 8a-ii made the engine carry a currency's own minor units, so a
 * KWD figure of `3,703.701` survives every calculation. This asserts the other
 * half, which those steps did not touch: that the figure survives being
 * **stored**.
 *
 * Every money column was `numeric(_, 2)`, and Postgres rounds to the declared
 * scale on insert — so a three-decimal currency lost its fils at the storage
 * boundary, before the engine ever saw the row. The engine tests pass because
 * they build `AnnualPeriodInput` directly and never round-trip through a table.
 */

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

async function companyAndPeriod(currency: string) {
  const company = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES ('Kuwait Co', ${`kw-${currency}-${Math.random().toString(36).slice(2, 8)}`}, ${currency})
    RETURNING id
  `);
  const companyId = (company.rows[0] as { id: string }).id;

  const period = await ctx.db.execute(sql`
    INSERT INTO payroll_periods
      (company_id, period_type, period_start, period_end, currency_code, status, source)
    VALUES (${companyId}, 'monthly', '2026-01-01', '2026-01-31', ${currency}, 'ready', 'upload')
    RETURNING id
  `);
  return { companyId, periodId: (period.rows[0] as { id: string }).id };
}

describe("three-decimal money survives storage", () => {
  it("keeps the fils on an employee snapshot", async () => {
    const { periodId } = await companyAndPeriod("KWD");

    await ctx.db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code)
      VALUES (${periodId}, 'E1', 'Fahad', 'Ops',
              ${JSON.stringify({ "Basic Salary": "3703.701" })}::jsonb,
              '3703.701', '3333.331', 'KWD')
    `);

    const read = await ctx.db.execute(sql`
      SELECT gross_salary AS "gross", net_salary AS "net"
      FROM employee_snapshots WHERE payroll_period_id = ${periodId}
    `);
    const row = read.rows[0] as { gross: string; net: string };

    // numeric is returned as a string, per the neon-http convention.
    expect(Number(row.gross)).toBeCloseTo(3703.701, 6);
    expect(Number(row.net)).toBeCloseTo(3333.331, 6);
  });

  it("keeps the fils on a period total", async () => {
    const { periodId } = await companyAndPeriod("KWD");
    await ctx.db.execute(sql`
      UPDATE payroll_periods
      SET total_gross = '11111.103', total_net = '9999.993'
      WHERE id = ${periodId}
    `);

    const read = await ctx.db.execute(sql`
      SELECT total_gross AS "gross", total_net AS "net"
      FROM payroll_periods WHERE id = ${periodId}
    `);
    const row = read.rows[0] as { gross: string; net: string };

    expect(Number(row.gross)).toBeCloseTo(11111.103, 6);
    expect(Number(row.net)).toBeCloseTo(9999.993, 6);
  });

  it("keeps the fils on a per-period component aggregate", async () => {
    // This table reaches tenancy through payroll_periods and carries no
    // company_id of its own, the same shape the step 0 scoping had to work
    // around.
    const { periodId } = await companyAndPeriod("KWD");
    await ctx.db.execute(sql`
      INSERT INTO period_component_totals
        (payroll_period_id, department, component_key, total, pos_rows, neg_rows)
      VALUES (${periodId}, 'Ops', 'Basic Salary', '3703.701', 1, 0)
    `);

    const read = await ctx.db.execute(sql`
      SELECT total FROM period_component_totals WHERE payroll_period_id = ${periodId}
    `);
    expect(Number((read.rows[0] as { total: string }).total)).toBeCloseTo(3703.701, 6);
  });

  it("still keeps two-decimal money exactly as before", async () => {
    const { periodId } = await companyAndPeriod("USD");
    await ctx.db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code)
      VALUES (${periodId}, 'E1', 'Ada', 'Eng', '{}'::jsonb, '5000.00', '4000.00', 'USD')
    `);

    const read = await ctx.db.execute(sql`
      SELECT gross_salary AS "gross" FROM employee_snapshots
      WHERE payroll_period_id = ${periodId}
    `);
    expect(Number((read.rows[0] as { gross: string }).gross)).toBe(5000);
  });
});
