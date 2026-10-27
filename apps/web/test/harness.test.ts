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
  /**
   * Was `it.fails`: re-running migration 0004 failed with 'relation
   * "annual_budgets" already exists' (finding B2). Flipped to `it` by step 30.
   *
   * This asserts the strong property — the whole set re-applies cleanly, not
   * just 0004 — because drizzle keys applied migrations on a hash of the file,
   * so editing any migration makes it run again on a database that already had
   * it. Guarding all of them means that is always a no-op rather than an outage.
   */
  it("re-runs every migration as a no-op", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    try {
      await applyMigrations(pg);
      await applyMigrations(pg);
      // A third pass, to catch anything that is only idempotent once.
      await applyMigrations(pg);
    } finally {
      await pg.close();
    }
  });
});

/**
 * Step 27 (finding B1): the annual filters must be served by an index.
 *
 * PGlite is real Postgres compiled to WASM, so these plans are genuine. The
 * planner only prefers an index when the table is big enough and the statistics
 * are current, hence the row volume and the explicit ANALYZE — on a ten-row
 * table a sequential scan is correctly cheaper and the assertion would say
 * nothing.
 */
describe("annual indexes (step 27)", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    await applyMigrations(pg);

    const company = (await pg.query<{ id: string }>(
      `INSERT INTO companies (name, slug, currency_code) VALUES ('Perf', 'perf', 'USD') RETURNING id`,
    )).rows[0]!.id;

    // Enough periods across several cadences and currencies that a sequential
    // scan is the expensive option.
    await pg.exec(`
      INSERT INTO payroll_periods
        (company_id, period_type, period_start, period_end, currency_code, status, source)
      SELECT '${company}',
             (ARRAY['monthly','weekly','bi_monthly'])[1 + (g % 3)],
             make_date(2020 + (g / 12)::int, 1 + (g % 12), 1),
             make_date(2020 + (g / 12)::int, 1 + (g % 12), 28),
             (ARRAY['USD','LBP','EUR'])[1 + (g % 3)],
             'ready', 'upload'
      FROM generate_series(0, 1199) g
    `);

    // Snapshots spread across many periods. Selectivity is the whole point: if
    // every row shared one payroll_period_id, filtering to that period would
    // select the entire table and a sequential scan would rightly win, so the
    // assertion would prove nothing about the index.
    await pg.exec(`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code)
      SELECT p.id, 'E' || g, 'Employee ' || g, 'Ops',
             '{"Base Salary": "1000.00"}'::jsonb, 1000, 800, 'USD'
      FROM (SELECT id FROM payroll_periods ORDER BY period_end LIMIT 300) p
      CROSS JOIN generate_series(0, 49) g
    `);

    await pg.exec("ANALYZE payroll_periods; ANALYZE employee_snapshots;");
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  async function plan(query: string): Promise<string> {
    const res = await pg.query<{ "QUERY PLAN": string }>(`EXPLAIN ${query}`);
    return res.rows.map((r) => r["QUERY PLAN"]).join("\n");
  }

  it("serves the annual period filter with an index scan", async () => {
    const text = await plan(`
      SELECT id FROM payroll_periods
      WHERE company_id = (SELECT id FROM companies LIMIT 1)
        AND status = 'ready'
        AND period_type = 'monthly'
        AND currency_code = 'USD'
        AND period_end >= '2024-01-01'::date
        AND period_end < '2025-01-01'::date
    `);

    expect(text).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
    expect(text).toContain("payroll_periods_annual_idx");
  });

  it("serves the snapshot de-duplication with an index scan", async () => {
    const text = await plan(`
      SELECT DISTINCT ON (payroll_period_id, employee_external_id) id
      FROM employee_snapshots
      WHERE payroll_period_id = (SELECT id FROM payroll_periods LIMIT 1)
      ORDER BY payroll_period_id, employee_external_id, created_at DESC
    `);

    expect(text).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
    expect(text).toContain("employee_snapshots_period_employee_idx");
  });
});

/**
 * Step 9: the journal and the folder must agree.
 *
 * `applyMigrations` above globs the migrations folder, but `pnpm db:migrate` is
 * `drizzle-kit migrate`, which reads `meta/_journal.json` and runs only what is
 * listed there. So a migration file with no journal entry passes every test in
 * this file and then never runs on production — and one listed with no file
 * makes drizzle-kit fail outright. Neither is detectable from the globbing side,
 * which is why this asserts the two sides match.
 */
describe("migration journal (step 9)", () => {
  interface JournalEntry {
    idx: number;
    tag: string;
  }

  it("lists every migration file, in order, and nothing else", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { default: path } = await import("node:path");

    const dir = path.resolve(import.meta.dirname, "../../../packages/db/src/migrations");
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();

    const journal = JSON.parse(
      await readFile(path.join(dir, "meta", "_journal.json"), "utf8"),
    ) as { entries: JournalEntry[] };

    expect(journal.entries.map((e) => e.tag)).toEqual(files);
    // `idx` is what drizzle-kit orders by, so it has to match the file's own
    // numeric prefix rather than merely being unique.
    expect(journal.entries.map((e) => e.idx)).toEqual(
      files.map((f) => Number(f.slice(0, 4))),
    );
  });
});
