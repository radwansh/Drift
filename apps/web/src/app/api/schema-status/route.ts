import { NextResponse } from "next/server";
import { db, MIGRATION_TAGS } from "@saas/db";
import { readMigrationStatus } from "@/server/schema-drift";

/**
 * Applied-versus-expected migrations, so schema drift can be *looked at* rather
 * than waited for.
 *
 * The reactive half of this fix (`server/schema-drift.ts`, wired into
 * `server/trpc.ts`) only speaks once a user has already hit a broken page. The
 * incident it exists for — 0011 code against an 0008 database — was visible
 * from the moment the deployment went up, and nothing would say so. One request
 * here answers it before anyone sees an error, and it is the check to run after
 * a deploy and after a migration.
 *
 * **No auth, on purpose.** A debugging endpoint that needs a session is no use
 * when the thing that is broken is every query against `payroll_periods` — the
 * sign-in path itself reads the database. What it exposes is therefore held to
 * exactly the counts and the migration tags, which are already public in the
 * repository: no company data, no connection string, no driver message, and
 * nothing from the error object the driver hands back (it carries `query`,
 * `params`, `column` and `table`). `readMigrationStatus` is the only thing that
 * touches the database and it collapses every failure into
 * `kind: "unknown"`.
 *
 * Status codes make it usable from a script: 200 when the database is in step
 * with this build, 503 otherwise, including when the count cannot be read.
 *
 * `force-dynamic` because without it Next evaluates a GET handler that reads no
 * request at build time, which would run this query during `next build` and
 * bake its answer into the deployment — the opposite of what it is for.
 *
 * It reads the raw `db` export rather than calling `requireDb()`, which is the
 * one place in the app that should: `requireDb()` throws when `DATABASE_URL` is
 * unset, and "there is no database configured" is an answer this endpoint has
 * to be able to *report*. `readMigrationStatus` takes `DbClient | null` and
 * handles the null, so the null is handled rather than ignored, which is what
 * the rule against the raw export is for.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readMigrationStatus(db);

  const body = {
    expected: status.expected,
    expectedThrough: MIGRATION_TAGS[status.expected - 1] ?? null,
    applied: status.kind === "unknown" ? null : status.applied,
    pending: status.kind === "behind" ? status.pending : [],
    upToDate: status.kind === "aligned",
    // "no_database" when DATABASE_URL is unset for this deployment,
    // "unreadable" when `drizzle.__drizzle_migrations` is missing or the
    // connection failed. Neither carries the driver's text.
    unknownReason: status.kind === "unknown" ? status.reason : null,
  };

  return NextResponse.json(body, { status: status.kind === "aligned" ? 200 : 503 });
}
