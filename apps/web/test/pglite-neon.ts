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

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite({ parsers: identityParsers() });
  await pg.waitReady;
  await applyMigrations(pg);

  // drizzle-orm/neon-http calls client(query, params, opts) and reads `.rows`.
  const client = async (query: string, params: unknown[] = [], _opts?: unknown) => {
    const result = await pg.query(query, params as never[], {
      rowMode: "object",
      parsers: identityParsers(),
    });
    return {
      rows: result.rows,
      fields: result.fields ?? [],
      rowCount: result.rows.length,
      command: "",
      rowAsArray: false,
    };
  };

  // NeonQueryFunction is a callable carrying statics (`transaction`, `query`) the
  // neon-http driver does not use for plain queries. Its type lives in
  // @neondatabase/serverless, which is a dependency of @saas/db and therefore not
  // resolvable from apps/web, so the shim is widened instead of implementing them.
  const db = drizzle(client as never, { schema });

  return {
    db,
    raw: pg,
    close: async () => {
      await pg.close();
    },
  };
}
