import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@saas/db";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Production talks to Neon over HTTP, which returns `numeric`, `date` and
 * `timestamp` columns as **strings**. A local driver that returns JS numbers and
 * Dates would hide exactly the class of bug the review calls C1, so this wraps
 * PGlite in the shape `drizzle-orm/neon-http` expects and keeps those types as
 * strings.
 *
 * It also counts round trips, so a test can assert how many HTTP requests a
 * procedure would make against real Neon (step 26). Queries are therefore lazy:
 * `db.batch()` builds its query objects up front and hands them to
 * `client.transaction()`, which is one request no matter how many queries it
 * carries — counting at build time would over-report.
 */

// Postgres type OIDs that neon-http hands back as strings.
const STRING_OIDS = [
  1700, // numeric
  1082, // date
  1114, // timestamp
  1184, // timestamptz
  20, // int8 / bigint
];

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "../../../packages/db/src/migrations",
);

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>;
  raw: PGlite;
  /** HTTP round trips since the last reset. */
  roundTrips: () => number;
  resetRoundTrips: () => void;
  close: () => Promise<void>;
}

function identityParsers() {
  const parsers: Record<number, (value: string) => unknown> = {};
  for (const oid of STRING_OIDS) parsers[oid] = (value: string) => value;
  return parsers;
}

/**
 * Applies every migration in order. Drizzle's own migrator is skipped because it
 * expects its journal table and a live connection; the review only needs the
 * schema present, and running the raw SQL also exercises whether the migrations
 * are idempotent (finding B2).
 */
export async function applyMigrations(pg: PGlite): Promise<string[]> {
  const entries = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of entries) {
    const sqlText = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    // drizzle-kit separates statements with this marker; fall back to the whole
    // file when it is absent.
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await pg.exec(statement);
    }
  }

  return entries;
}

interface LazyQuery<T> {
  _run: () => Promise<T>;
  _batched: boolean;
  then: (onFulfilled?: (v: T) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
  catch: (onRejected?: (e: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally?: () => void) => Promise<unknown>;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ parsers: identityParsers() });
  await pg.waitReady;
  await applyMigrations(pg);

  let roundTrips = 0;

  /**
   * `arrayMode` must be honoured. Neon returns each row as an array of values
   * when it is set, and drizzle relies on that for `db.select()` and the
   * relational query builder (`db.query.*`) — it maps results positionally
   * against the fields it asked for. Always returning objects silently produced
   * garbage for those two APIs while `db.execute()` looked fine.
   */
  async function exec(query: string, params: unknown[], arrayMode: boolean) {
    const result = await pg.query(query, params as never[], {
      rowMode: arrayMode ? "array" : "object",
      parsers: identityParsers(),
    });
    return {
      rows: result.rows,
      fields: result.fields ?? [],
      rowCount: result.rows.length,
      command: "",
      rowAsArray: arrayMode,
    };
  }

  type ExecResult = Awaited<ReturnType<typeof exec>>;

  // drizzle-orm/neon-http calls client(query, params, opts) and reads `.rows`.
  // The returned object must be thenable but must not execute until awaited.
  const client = (
    query: string,
    params: unknown[] = [],
    opts?: { arrayMode?: boolean },
  ): LazyQuery<ExecResult> => {
    let started: Promise<ExecResult> | null = null;
    const run = () => (started ??= exec(query, params, opts?.arrayMode === true));
    const self: LazyQuery<ExecResult> = {
      _run: run,
      _batched: false,
      then(onFulfilled, onRejected) {
        // A query awaited on its own is its own HTTP request.
        if (!self._batched) roundTrips += 1;
        return run().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return self.then(undefined, onRejected);
      },
      finally(onFinally) {
        return self.then().finally(onFinally);
      },
    };
    return self;
  };

  // One HTTP request carrying every query in the batch.
  client.transaction = async (queries: LazyQuery<ExecResult>[]) => {
    roundTrips += 1;
    for (const q of queries) q._batched = true;
    return Promise.all(queries.map((q) => q._run()));
  };

  // NeonQueryFunction is a callable carrying statics (`transaction`, `query`) the
  // neon-http driver does not use beyond what is shimmed above. Its type lives in
  // @neondatabase/serverless, which is a dependency of @saas/db and therefore not
  // resolvable from apps/web, so the shim is widened instead of implementing them.
  const db = drizzle(client as never, { schema });

  return {
    db,
    raw: pg,
    roundTrips: () => roundTrips,
    resetRoundTrips: () => {
      roundTrips = 0;
    },
    close: async () => {
      await pg.close();
    },
  };
}
