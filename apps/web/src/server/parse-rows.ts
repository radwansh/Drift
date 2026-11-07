import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * Parses the rows `db.execute()` returns against a zod schema.
 *
 * `db.execute()` hands back untyped rows and **Postgres returns the column name
 * as written**, so a `snake_case` column read as `row.camelCase` is `undefined`
 * with nothing to catch it. That shipped once and made the annual page throw
 * `Invalid time value` for every company with data (finding C1). The rule in
 * `routers/annual.ts` is: alias every column in the SQL, parse the result here,
 * and never `as unknown as SomeRow[]`.
 *
 * It lived in `routers/annual.ts` and was private to it. Step 4's check badge
 * on the periods list needs the same guarantee, so it is shared rather than
 * copied — a second copy is a second thing to keep in step with the rule.
 */
/**
 * The four coercions every raw-SQL reader in this app needs.
 *
 * PGlite and neon-http both return `numeric`, `date` and `timestamp` as
 * **strings**, deliberately: a driver handing back JS numbers and Dates hides
 * exactly the class of bug `parseRows` exists to catch. So every schema that
 * reads one of those columns goes through these rather than trusting the type.
 *
 * They were private to `routers/annual.ts`. The Employee File's queries need
 * all four, and a second copy is a second thing to keep in step with the
 * alias-and-parse rule — which is the argument this file and
 * `server/categories.ts` were both extracted on.
 */
export const Numeric = z.union([z.string(), z.number()]).transform(Number);

export const IntLike = z
  .union([z.string(), z.number()])
  .transform((v) => Math.trunc(Number(v)));

/**
 * Postgres `date` arrives as "YYYY-MM-DD" and is kept **verbatim**.
 *
 * `new Date("2026-10-31")` in a negative-offset browser is 30 October, and
 * `assignSlot` then places the period in the wrong month. Nothing here passes a
 * date string through `Date`.
 */
export function toIsoDate(v: string | Date): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.length >= 10 ? v.slice(0, 10) : v;
}

export function toIsoTimestamp(v: string | Date): string {
  if (v instanceof Date) return v.toISOString();
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unparseable timestamp from database: ${JSON.stringify(v)}`,
    });
  }
  return parsed.toISOString();
}

export function parseRows<T extends z.ZodTypeAny>(
  schema: T,
  rows: unknown[],
  label: string,
): z.infer<T>[] {
  const parsed = schema.array().safeParse(rows);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unexpected ${label} row shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    });
  }
  return parsed.data;
}
