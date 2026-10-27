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
