import journal from "./meta/_journal.json";

/**
 * Every migration tag this build expects, in the order drizzle applies them.
 *
 * It exists so the app can say *which* migrations a database is missing. A
 * preview deployment once threw `column "control_total_gross" does not exist`
 * on two pages because the code was at 0011 and the database at 0008 — and the
 * only thing on screen was the driver's sentence, which names a column rather
 * than the thing that was actually wrong.
 *
 * drizzle appends to `meta/_journal.json` as it generates, so `entries` is
 * already in apply order; it is re-sorted by `idx` here anyway, because that
 * ordering is the whole basis of the pending-migration inference in
 * `apps/web/src/server/schema-drift.ts` and a hand-merged journal must not be
 * able to make that inference lie.
 */
export const MIGRATION_TAGS: readonly string[] = [...journal.entries]
  .sort((a, b) => a.idx - b.idx)
  .map((entry) => entry.tag);
