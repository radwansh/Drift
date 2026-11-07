import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { MIGRATION_TAGS } from "@saas/db";
import { createTestDb, type TestDb } from "./pglite-neon";
import { router, publicProcedure } from "@/server/trpc";
import {
  SCHEMA_DRIFT_GENERIC_MESSAGE,
  describeMigrationStatus,
  readMigrationStatus,
  schemaDriftSqlState,
  scrubSchemaDriftShape,
} from "@/server/schema-drift";

/**
 * The schema-drift guard, against a Postgres-shaped database.
 *
 * The incident: migration-0011 code against an 0008 database raised
 * `column "control_total_gross" does not exist`, and two pages render
 * `{error.message}` straight into an alert, so that sentence is what the user
 * read. These tests pin the things that must stay true - the SQLSTATE is
 * recognised, the replacement names the pending migrations, a database with no
 * `drizzle.__drizzle_migrations` at all still produces a message instead of an
 * exception raised inside the error handler, and a router that already wrote a
 * better message keeps it.
 *
 * `apps/web/test/pglite-neon.ts` does not create that journal table: it runs the
 * migration SQL directly rather than through drizzle's migrator, so the default
 * state of this harness *is* the wholly-unmigrated case. The tests that need a
 * journal table create it themselves.
 */

let ctx: TestDb;

/**
 * Procedures that provoke real errors from the driver.
 *
 * `payroll_periods` is the table the incident hit, and a column that exists in
 * no migration produces the same SQLSTATE the real one did. They are built on
 * `publicProcedure`, the procedure with the fewest middlewares, so what they
 * prove is that the guard sits below all of them.
 */
const driftRouter = router({
  missingColumn: publicProcedure.query(async ({ ctx: c }) => {
    await c.db!.execute(sql`SELECT not_a_real_column FROM payroll_periods`);
    return null;
  }),
  missingTable: publicProcedure.query(async ({ ctx: c }) => {
    await c.db!.execute(sql`SELECT 1 FROM a_table_no_migration_creates`);
    return null;
  }),
  ordinaryFailure: publicProcedure.query(() => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to do with the schema." });
  }),
  /**
   * The shape `payrollPeriods.ingest` has: it catches the driver error, writes
   * a message only it could write, and keeps the original on `cause`.
   */
  explainedFailure: publicProcedure.query(async ({ ctx: c }) => {
    try {
      await c.db!.execute(sql`SELECT 1 FROM a_table_no_migration_creates`);
      return null;
    } catch (cause) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "This database is missing tables. Nothing was saved.",
        cause,
      });
    }
  }),
});

function caller() {
  return driftRouter.createCaller({ userId: null, db: ctx.db } as never);
}

/** The `TRPCError` a call rejected with. Fails the test if it resolved. */
async function failureOf(call: Promise<unknown>): Promise<TRPCError> {
  try {
    await call;
  } catch (error) {
    return error as TRPCError;
  }
  throw new Error("Expected the call to reject, and it resolved.");
}

/** Puts `rowCount` rows in `drizzle.__drizzle_migrations`, as drizzle would. */
async function seedJournalTable(rowCount: number) {
  await ctx.db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await ctx.db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  await ctx.db.execute(sql`TRUNCATE drizzle.__drizzle_migrations`);
  for (let i = 0; i < rowCount; i += 1) {
    await ctx.db.execute(sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${`hash_${i}`}, ${1700000000000 + i})
    `);
  }
}

async function dropJournalTable() {
  await ctx.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
}

/**
 * The incident's exact state: the code is at 0011 and the database at 0008, so
 * the nine migrations 0000 through 0008 are applied and three are not.
 */
const APPLIED_AT_INCIDENT = 9;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe("schemaDriftSqlState", () => {
  it("finds the SQLSTATE through the cause chain tRPC builds", () => {
    const driver = Object.assign(new Error('column "control_total_gross" does not exist'), {
      code: "42703",
    });
    const wrapped = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: driver });
    // One more link, as a procedure that catches and re-throws would add.
    const reWrapped = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: wrapped });

    expect(schemaDriftSqlState(driver)).toBe("42703");
    expect(schemaDriftSqlState(wrapped)).toBe("42703");
    expect(schemaDriftSqlState(reWrapped)).toBe("42703");
  });

  it("recognises undefined_table and undefined_function, and nothing else", () => {
    const withCode = (code: string) => Object.assign(new Error("x"), { code });
    expect(schemaDriftSqlState(withCode("42P01"))).toBe("42P01");
    expect(schemaDriftSqlState(withCode("42883"))).toBe("42883");
    // Ordinary failures must pass through untouched: a syntax error, a unique
    // violation and a refused connection are not schema drift.
    expect(schemaDriftSqlState(withCode("42601"))).toBeNull();
    expect(schemaDriftSqlState(withCode("23505"))).toBeNull();
    expect(schemaDriftSqlState(withCode("ECONNREFUSED"))).toBeNull();
    // `TRPCError.code` is a string too; it must not be read as a SQLSTATE.
    expect(schemaDriftSqlState(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }))).toBeNull();
    expect(schemaDriftSqlState(null)).toBeNull();
    expect(schemaDriftSqlState("42703")).toBeNull();
  });

  it("does not follow a self-referencing cause chain forever", () => {
    const loop: { cause?: unknown; code: string } = { code: "nope" };
    loop.cause = loop;
    expect(schemaDriftSqlState(loop)).toBeNull();
  });
});

describe("the error the user sees", () => {
  it("translates a 42703 into the pending migration tags", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);

    await expect(caller().missingColumn()).rejects.toThrow(/expects a newer database schema/i);

    const error = await failureOf(caller().missingColumn());

    expect(error.message).toContain(
      `${APPLIED_AT_INCIDENT} of ${MIGRATION_TAGS.length} migrations are applied`,
    );
    for (const tag of MIGRATION_TAGS.slice(APPLIED_AT_INCIDENT)) {
      expect(error.message).toContain(tag);
    }
    expect(error.message).toContain(
      "0009_snapshot_dimensions_and_minor_units, 0010_mapping_column_roles and " +
        "0011_employee_file are not",
    );
    // ...and names none of the applied ones, so the list is a to-do rather than
    // an inventory.
    expect(error.message).not.toContain("0008_nullable_clerk_user_id");
  });

  it("leaks nothing from the driver", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const error = await failureOf(caller().missingColumn());

    // The driver's error object carries `message`, `query`, `params`, `column`,
    // `table`, `detail` and `hint`. None of it may appear in the replacement.
    expect(error.message).not.toContain("not_a_real_column");
    expect(error.message).not.toContain("does not exist");
    expect(error.message).not.toContain("SELECT");
    expect(error.message).not.toContain("payroll_periods");
    expect(error.message).not.toContain("postgres");
  });

  it("translates an undefined table the same way", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const error = await failureOf(caller().missingTable());

    expect(error.message).toMatch(/expects a newer database schema/i);
    expect(error.message).not.toContain("a_table_no_migration_creates");
  });

  it("leaves an ordinary failure alone", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const error = await failureOf(caller().ordinaryFailure());

    expect(error.message).toBe("Nothing to do with the schema.");
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("defers to a message a router already wrote", async () => {
    // `payrollPeriods.ingest` knows something this module cannot: that nothing
    // was saved. Overwriting that with a migration count would lose the only
    // part the person holding the spreadsheet needs.
    // `test/provision-and-ingest.test.ts` pins the real one.
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const error = await failureOf(caller().explainedFailure());

    expect(error.message).toBe("This database is missing tables. Nothing was saved.");
    expect(schemaDriftSqlState(error.cause)).toBe("42P01");
  });

  it("keeps the driver error on `cause`, for the server-side log", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const error = await failureOf(caller().missingColumn());

    expect(schemaDriftSqlState(error.cause)).toBe("42703");
  });

  it("survives a database with no drizzle.__drizzle_migrations at all", async () => {
    // The wholly unmigrated case. Reading the journal table is itself a 42P01,
    // the same class of error that got us here, so this is the path where a
    // naive implementation throws inside the error handler.
    await dropJournalTable();

    const error = await failureOf(caller().missingColumn());

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.message).toMatch(/may expect a newer database schema/i);
    expect(error.message).toContain(String(MIGRATION_TAGS.length));
    expect(error.message).toContain(MIGRATION_TAGS[MIGRATION_TAGS.length - 1]!);
    expect(error.message).not.toContain("__drizzle_migrations");
    expect(error.message).not.toContain("not_a_real_column");
  });
});

describe("readMigrationStatus", () => {
  it("reports `behind` with the un-applied tags, inferred from the row count", async () => {
    await seedJournalTable(9);
    const status = await readMigrationStatus(ctx.db);
    expect(status).toEqual({
      kind: "behind",
      applied: 9,
      expected: MIGRATION_TAGS.length,
      pending: MIGRATION_TAGS.slice(9),
    });
  });

  it("reports `aligned` when every migration is applied", async () => {
    await seedJournalTable(MIGRATION_TAGS.length);
    const status = await readMigrationStatus(ctx.db);
    expect(status).toEqual({
      kind: "aligned",
      applied: MIGRATION_TAGS.length,
      expected: MIGRATION_TAGS.length,
    });
  });

  it("reports `aligned` rather than negative pending when the database is ahead", async () => {
    // A rolled-back deployment against a database a newer build migrated.
    await seedJournalTable(MIGRATION_TAGS.length + 2);
    const status = await readMigrationStatus(ctx.db);
    expect(status.kind).toBe("aligned");
    expect(describeMigrationStatus(status)).toMatch(/migrated by a newer build/);
  });

  it("reports `unknown` without throwing when the journal table is missing", async () => {
    await dropJournalTable();
    expect(await readMigrationStatus(ctx.db)).toEqual({
      kind: "unknown",
      expected: MIGRATION_TAGS.length,
      reason: "unreadable",
    });
  });

  it("reports `unknown` without throwing when there is no database at all", async () => {
    expect(await readMigrationStatus(null)).toEqual({
      kind: "unknown",
      expected: MIGRATION_TAGS.length,
      reason: "no_database",
    });
  });

  it("reports `unknown` without throwing when the connection is dead", async () => {
    const dead = {
      execute: () =>
        Promise.reject(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" })),
    } as unknown as Parameters<typeof readMigrationStatus>[0];
    expect(await readMigrationStatus(dead)).toEqual({
      kind: "unknown",
      expected: MIGRATION_TAGS.length,
      reason: "unreadable",
    });
  });
});

describe("describeMigrationStatus", () => {
  it("lists three pending migrations in full", () => {
    const message = describeMigrationStatus({
      kind: "behind",
      applied: 9,
      expected: 12,
      pending: ["0009_a", "0010_b", "0011_c"],
    });
    expect(message).toBe(
      "This deployment expects a newer database schema. 9 of 12 migrations are applied; " +
        "0009_a, 0010_b and 0011_c are not. " +
        "Applying the pending migrations to that database fixes it.",
    );
  });

  it("agrees with the verb for a single pending migration", () => {
    expect(
      describeMigrationStatus({ kind: "behind", applied: 11, expected: 12, pending: ["0011_c"] }),
    ).toContain("0011_c is not");
  });

  it("abbreviates a long list rather than printing twenty tags", () => {
    const pending = Array.from({ length: 12 }, (_, i) => `00${i}_tag`);
    const message = describeMigrationStatus({ kind: "behind", applied: 0, expected: 12, pending });
    expect(message).toContain("000_tag, 001_tag and 10 more, ending at 0011_tag");
  });
});

describe("the synchronous errorFormatter backstop", () => {
  const driverMessage = 'column "control_total_gross" does not exist';

  it("replaces the message and drops the development stack", () => {
    const driver = Object.assign(new Error(driverMessage), { code: "42703" });
    const scrubbed = scrubSchemaDriftShape(
      new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: driver }),
      { message: driverMessage, data: { stack: `Error: ${driverMessage}\n  at pg` } },
    );
    expect(scrubbed.message).toBe(SCHEMA_DRIFT_GENERIC_MESSAGE);
    expect(scrubbed.message).toContain("/api/schema-status");
    expect(scrubbed.message).not.toContain("control_total_gross");
    expect(scrubbed.data.stack).toBeUndefined();
  });

  it("leaves a shape that is not schema drift exactly as it was", () => {
    const error = new TRPCError({ code: "FORBIDDEN", message: "nope" });
    const original = { message: "nope", data: { stack: "at handler" } };
    expect(scrubSchemaDriftShape(error, original)).toBe(original);
  });

  it("defers to a message a router already wrote", () => {
    // This is the layer that actually runs over `payrollPeriods.ingest`'s
    // message in production: `createCaller` never reaches an errorFormatter, so
    // its own test could not catch a regression here.
    const driver = Object.assign(new Error('relation "period_component_totals" does not exist'), {
      code: "42P01",
    });
    const written = "This database is missing tables that the application needs.";
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: written,
      cause: driver,
    });
    const shape = { message: written, data: {} };
    expect(scrubSchemaDriftShape(error, shape)).toBe(shape);
  });

  it("does not overwrite a message the middleware already translated", async () => {
    // The middleware keeps the driver error on `cause`, so without the marker
    // the formatter would see the SQLSTATE again and replace the detailed
    // message with the generic one.
    await seedJournalTable(APPLIED_AT_INCIDENT);
    const translated = await failureOf(caller().missingColumn());

    const scrubbed = scrubSchemaDriftShape(translated, {
      message: translated.message,
      data: { stack: "at resolver" },
    });
    expect(scrubbed.message).toBe(translated.message);
    expect(scrubbed.message).toContain("migrations are applied");
  });
});

describe("the round-trip budget", () => {
  it("spends nothing on a request that succeeds", async () => {
    await seedJournalTable(MIGRATION_TAGS.length);
    const ok = router({
      fine: publicProcedure.query(async ({ ctx: c }) => {
        await c.db!.execute(sql`SELECT 1 AS "one"`);
        return null;
      }),
    });
    ctx.resetRoundTrips();
    await ok.createCaller({ userId: null, db: ctx.db } as never).fine();
    // The procedure's own query, and not one more. The guard must not look
    // anything up unless the call has already failed - `annual-router.test.ts`
    // and `employee-file-router.test.ts` assert exact budgets of 2 and 3.
    expect(ctx.roundTrips()).toBe(1);
  });

  it("spends exactly one extra request on a request that failed", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    ctx.resetRoundTrips();
    await caller()
      .missingColumn()
      .catch(() => undefined);
    // The failed query, plus the one count. The request was already lost.
    expect(ctx.roundTrips()).toBe(2);
  });

  it("spends nothing extra when a router already explained the failure", async () => {
    await seedJournalTable(APPLIED_AT_INCIDENT);
    ctx.resetRoundTrips();
    await caller()
      .explainedFailure()
      .catch(() => undefined);
    expect(ctx.roundTrips()).toBe(1);
  });
});
