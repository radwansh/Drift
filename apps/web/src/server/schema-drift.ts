import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { MIGRATION_TAGS, type DbClient } from "@saas/db";

/**
 * Turns "the database is behind the code" into a sentence a person can act on.
 *
 * A preview deployment threw `column "control_total_gross" does not exist` on
 * the periods list and the dashboard. The code was at migration 0011 and the
 * database at 0008; that column arrives in 0009 and is declared in
 * `schema/payrollPeriods.ts`, so drizzle names it in **every** generated SELECT
 * against `payroll_periods` — one missing column broke every query on the
 * table, not only the control-total feature. Two pages render
 * `{error.message}` straight into an `AlertDescription`
 * (`payroll-periods/page.tsx:210`, `dashboard/page.tsx:127`), so what reached
 * the user was the driver's own sentence: it names a column, which is not the
 * thing that was wrong, and it says nothing about what to do.
 *
 * This module is wired into `server/trpc.ts`, the single place every tRPC error
 * passes through, so it covers every router at once rather than patching the
 * two pages that happened to show it.
 *
 * Three rules it has to keep:
 *
 * 1. **The lookup happens only on the error path.** `annual.getSummary` is
 *    budgeted at 2 round trips and `employeeFile.list`/`.get` at 3 each, and
 *    `test/annual-router.test.ts` and `test/employee-file-router.test.ts`
 *    assert those numbers (the latter with `toBe(3)`). Nothing here runs unless
 *    a query has already failed, at which point the request is lost anyway and
 *    one more request costs nothing. There is deliberately no memo: the state
 *    being reported changes exactly when someone applies the migrations, and
 *    the one moment this message must be right is the moment you look at it
 *    after doing that.
 * 2. **It degrades, never breaks.** `db` is `DbClient | null`, the connection
 *    may be down, and on a wholly unmigrated database `drizzle.__drizzle_migrations`
 *    does not exist at all (it is `42P01` — the same class of error that got us
 *    here). Every path returns a message; throwing while formatting an error
 *    would replace a legible failure with an opaque one.
 * 3. **It leaks nothing.** Migration tags and counts only. The driver's error
 *    object carries `query`, `params`, `column`, `table` and `detail` (see
 *    `test/schema-drift.test.ts`), and none of them — nor the connection
 *    string, nor the raw message — appears in anything returned here.
 */

/**
 * The SQLSTATEs that mean "the schema this code was written against is not the
 * schema it is talking to".
 *
 * - `42703` undefined_column — what the incident actually raised.
 * - `42P01` undefined_table — the same drift one migration earlier, when a
 *   whole table is missing rather than a column.
 * - `42883` undefined_function — included. The argument against it is that it
 *   also fires on a genuine programming error, like calling a Postgres function
 *   that never existed; the argument for it is that this repo's migrations do
 *   create database objects beyond tables and columns, so a build calling
 *   something a pending migration installs would land here, and a developer who
 *   wrote a bad function call reads "the database may be behind" and checks
 *   `/api/schema-status`, which tells them in one request that it is not. A
 *   slightly wrong hint on a developer's own bug is a much smaller cost than a
 *   raw driver string on a user's screen, so it is in.
 *
 * `42804` (datatype_mismatch) and `42P07` are deliberately out: the first fires
 * on ordinary bad SQL far more often than on drift, and the second only ever
 * happens while migrating.
 */
const SCHEMA_DRIFT_SQLSTATES: ReadonlySet<string> = new Set(["42703", "42P01", "42883"]);

/** How far down a `cause` chain to look before giving up. */
const MAX_CAUSE_DEPTH = 8;

/**
 * The schema-drift error in `error`'s cause chain, if there is one.
 *
 * It walks the chain because drizzle's neon-http session does not wrap query
 * errors (checked against drizzle-orm 0.42: it has no `DrizzleQueryError`), but
 * tRPC does — `getTRPCErrorFromUnknown` puts the driver error on `cause` of an
 * `INTERNAL_SERVER_ERROR`, and a procedure that catches and re-throws adds
 * another link. `TRPCError.code` is a string too (`"INTERNAL_SERVER_ERROR"`),
 * which is why this matches against the SQLSTATE set rather than any truthy
 * `code`. The depth bound also stops a self-referencing `cause` from spinning.
 */
function findSchemaDrift(error: unknown): { sqlState: string; driverMessage: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (current === null || typeof current !== "object") return null;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SCHEMA_DRIFT_SQLSTATES.has(code)) {
      const driverMessage = (current as { message?: unknown }).message;
      return { sqlState: code, driverMessage: typeof driverMessage === "string" ? driverMessage : "" };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** The SQLSTATE of the schema-drift error in `error`'s cause chain, or `null`. */
export function schemaDriftSqlState(error: unknown): string | null {
  return findSchemaDrift(error)?.sqlState ?? null;
}

/**
 * Whether this error still needs a message written for it.
 *
 * It does **not** if a router already wrote one. `payrollPeriods.ingest`
 * catches its own failures and throws `describeIngestFailure(cause)` — "This
 * database is missing tables that the application needs. Apply the pending
 * migrations, then import again. Nothing was saved." — keeping the driver error
 * on `cause`. That message is better than anything this module can produce,
 * because only the ingest path knows that nothing was saved, and whoever is
 * holding the spreadsheet needs to hear exactly that.
 * `test/provision-and-ingest.test.ts` pins it.
 *
 * The test for "already written" is that the outermost error's message is not
 * the driver's own. tRPC's `TRPCError` falls back to `cause.message` when it is
 * given no message of its own, so a driver string that bubbled up untouched
 * arrives here with the two identical — and a message a router chose arrives
 * with them different. Nothing needs to be marked or registered for that to
 * hold.
 */
function needsMessage(error: unknown, drift: { driverMessage: string }): boolean {
  const outer = typeof error === "object" && error !== null
    ? (error as { message?: unknown }).message
    : undefined;
  if (typeof outer !== "string" || outer.length === 0) return true;
  return outer === drift.driverMessage;
}

export type MigrationStatus =
  | { kind: "behind"; applied: number; expected: number; pending: readonly string[] }
  | { kind: "aligned"; applied: number; expected: number }
  | { kind: "unknown"; expected: number; reason: "no_database" | "unreadable" };

/**
 * Compares the number of rows in `drizzle.__drizzle_migrations` against
 * `MIGRATION_TAGS`.
 *
 * **Why count rows instead of matching names.** That table stores a hash of
 * each migration's file contents and a timestamp — it does not store the tag —
 * so there is nothing to join on by name, and reproducing drizzle's hash here
 * would mean copying its hashing scheme and keeping it in step with the version
 * in the lockfile. But drizzle applies migrations strictly in journal order and
 * writes one row per migration, so N rows means `MIGRATION_TAGS[0..N-1]` are
 * applied and `MIGRATION_TAGS[N..]` are not. That inference needs only the
 * count, and the count is one cheap query. The next person to read this will
 * wonder why it is not matching on names: that is why.
 *
 * The schema and table names are drizzle-kit's defaults, which
 * `packages/db/drizzle.config.ts` does not override (it sets no
 * `migrationsSchema` or `migrationsTable`). If it ever does, this query is the
 * other half of that change.
 *
 * Never throws. A missing table, a dead connection and an unparseable row all
 * come back as `kind: "unknown"`.
 */
export async function readMigrationStatus(db: DbClient | null): Promise<MigrationStatus> {
  const expected = MIGRATION_TAGS.length;
  if (!db) return { kind: "unknown", expected, reason: "no_database" };

  let applied: number;
  try {
    // Aliased and parsed rather than cast, per the raw-SQL rule: Postgres
    // returns the column name as written, and `count(*)` would otherwise come
    // back under the name "count".
    const result = await db.execute(
      sql`SELECT count(*)::int AS "applied" FROM drizzle.__drizzle_migrations`,
    );
    // `safeParse`, not `parseRows`: that helper throws a TRPCError, and nothing
    // in this module may throw.
    const parsed = z
      .object({ applied: z.union([z.string(), z.number()]).transform(Number) })
      .safeParse(result.rows[0]);
    if (!parsed.success || !Number.isFinite(parsed.data.applied)) {
      return { kind: "unknown", expected, reason: "unreadable" };
    }
    applied = Math.trunc(parsed.data.applied);
  } catch {
    // A wholly unmigrated database raises 42P01 here, which is the expected
    // answer rather than a surprise; an unreachable one raises something else.
    // Neither is worth distinguishing to the reader, and the driver's text for
    // either must not be passed on.
    return { kind: "unknown", expected, reason: "unreadable" };
  }

  if (applied >= expected) return { kind: "aligned", applied, expected };
  return { kind: "behind", applied, expected, pending: MIGRATION_TAGS.slice(applied) };
}

/** "a", "a and b", "a, b and c", "a, b and 7 more, ending at z". */
function formatTagList(tags: readonly string[]): string {
  if (tags.length <= 3) {
    if (tags.length === 0) return "none";
    if (tags.length === 1) return String(tags[0]);
    return `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}`;
  }
  return `${tags[0]}, ${tags[1]} and ${tags.length - 2} more, ending at ${tags[tags.length - 1]}`;
}

const FIX = "Applying the pending migrations to that database fixes it.";

/** The user-facing sentence for a migration status. Pure; never throws. */
export function describeMigrationStatus(status: MigrationStatus): string {
  switch (status.kind) {
    case "behind":
      return (
        `This deployment expects a newer database schema. ` +
        `${status.applied} of ${status.expected} migrations are applied; ` +
        `${formatTagList(status.pending)} ${status.pending.length === 1 ? "is" : "are"} not. ` +
        FIX
      );
    case "aligned":
      return (
        `This deployment could not read part of the database schema it expects, ` +
        `and migrations are not the reason: all ${status.expected} this build knows about ` +
        `are reported as applied` +
        (status.applied > status.expected
          ? `, and the database reports ${status.applied}, so it may have been migrated by a newer build` +
            ` than the one serving this request`
          : "") +
        `. Check that this deployment and this database belong together.`
      );
    case "unknown":
      return (
        `This deployment may expect a newer database schema than the database it is ` +
        `connected to. It expects ${status.expected} migrations` +
        (status.expected > 0 ? ` through ${MIGRATION_TAGS[status.expected - 1]}` : "") +
        `, but how many are applied could not be read` +
        (status.reason === "no_database" ? ` — no database is configured for it` : "") +
        `. ${FIX}`
      );
  }
}

/**
 * The message used when the applied count cannot be looked up at all, because
 * the code path replacing the message is synchronous.
 *
 * tRPC's `errorFormatter` returns a shape, not a promise (`ErrorFormatter` in
 * @trpc/server 11.18 is `(opts) => TShape`), so it cannot await the count. It
 * is still the backstop that guarantees no driver string ever reaches a client,
 * and it names the route that does report the counts.
 */
export const SCHEMA_DRIFT_GENERIC_MESSAGE =
  "This deployment expects a database schema it could not read. " +
  "It may be connected to a database that is behind it; /api/schema-status reports " +
  "which migrations are applied and which are pending.";

/**
 * Marks a `TRPCError` as already carrying a schema-drift message, so the
 * synchronous formatter leaves it alone.
 *
 * Without it the formatter would see the driver error still on `cause` — which
 * is kept on purpose, so server-side logging and `onError` still get the real
 * failure — and overwrite the detailed message with the generic one. Defined
 * with `defineProperty` so it is non-enumerable and cannot be serialised into a
 * response.
 */
const TRANSLATED = Symbol.for("clarivo.schemaDriftTranslated");

function markTranslated(error: TRPCError): TRPCError {
  Object.defineProperty(error, TRANSLATED, { value: true, enumerable: false });
  return error;
}

function isTranslated(error: unknown): boolean {
  return typeof error === "object" && error !== null && TRANSLATED in error;
}

/**
 * If `error` is schema drift, the replacement to throw in its place; otherwise
 * `null`.
 *
 * This is the half that can await, and it is called from a middleware on every
 * procedure rather than from `errorFormatter` for the reason given above.
 */
export async function translateSchemaDriftError(
  error: TRPCError,
  db: DbClient | null,
): Promise<TRPCError | null> {
  const drift = findSchemaDrift(error);
  if (!drift || !needsMessage(error, drift)) return null;
  let message: string;
  try {
    message = describeMigrationStatus(await readMigrationStatus(db));
  } catch {
    // `readMigrationStatus` and `describeMigrationStatus` are both written not
    // to throw; this is the belt to their braces, because an exception raised
    // while handling an exception is the worst outcome available here.
    message = SCHEMA_DRIFT_GENERIC_MESSAGE;
  }
  return markTranslated(
    new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: error.cause }),
  );
}

/**
 * The synchronous backstop, wired as tRPC's `errorFormatter`.
 *
 * Replaces the message on any schema-drift error that reached the formatter
 * untranslated — one raised outside the middleware chain, or by a procedure
 * built from a raw `t.procedure` rather than one of this app's exported ones.
 * It also drops `data.stack`, which tRPC includes outside production and whose
 * first line is the driver's own message.
 *
 * It honours `needsMessage` for the same reason the middleware does: this is
 * the layer that actually runs over `payrollPeriods.ingest`'s "Nothing was
 * saved" message in production, where `createCaller` — and so that message's
 * test — never reaches it.
 */
export function scrubSchemaDriftShape<
  TShape extends { message: string; data: { stack?: string } },
>(error: unknown, shape: TShape): TShape {
  if (isTranslated(error)) return shape;
  const drift = findSchemaDrift(error);
  if (!drift || !needsMessage(error, drift)) return shape;
  return {
    ...shape,
    message: SCHEMA_DRIFT_GENERIC_MESSAGE,
    data: { ...shape.data, stack: undefined },
  };
}
