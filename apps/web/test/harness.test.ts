import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { createTestDb, applyMigrations, type TestDb } from "./pglite-neon";

describe("PGlite harness (step 4)", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("applies the migrations and exposes the annual tables", async () => {
    const res = await ctx.db.execute(sql`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const names = res.rows.map((r) => (r as { tableName: string }).tableName);

    expect(names).toContain("payroll_periods");
    expect(names).toContain("employee_snapshots");
    expect(names).toContain("component_categories");
    expect(names).toContain("annual_budgets");
    expect(names).toContain("annual_insight_caches");
  });

  it("returns numeric, date and timestamp columns as strings, like neon-http", async () => {
    const res = await ctx.db.execute(sql`
      SELECT 1234.56::numeric       AS "num",
             '2026-06-30'::date     AS "d",
             now()::timestamptz     AS "ts"
    `);
    const row = res.rows[0] as { num: unknown; d: unknown; ts: unknown };

    // This is the property that makes the harness able to catch C1-class bugs.
    expect(typeof row.num).toBe("string");
    expect(typeof row.d).toBe("string");
    expect(row.d).toBe("2026-06-30");
    expect(typeof row.ts).toBe("string");
  });

  it("preserves the column case that the query asked for", async () => {
    // An unaliased snake_case column stays snake_case: reading `.periodType` off
    // such a row is undefined, which is finding C1.
    const res = await ctx.db.execute(sql`SELECT 'monthly'::text AS period_type`);
    const row = res.rows[0] as Record<string, unknown>;

    expect(Object.keys(row)).toEqual(["period_type"]);
    expect(row["periodType"]).toBeUndefined();
  });
});

describe("migration idempotency (finding B2, step 30)", () => {
  // The review found that re-running migration 0004 fails with
  // "relation annual_budgets already exists". Marked `it.fails` per step 5 and
  // flipped to `it` by step 30.
  it.fails("re-runs every migration as a no-op", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    try {
      await applyMigrations(pg);
      await applyMigrations(pg);
    } finally {
      await pg.close();
    }
  });
});
