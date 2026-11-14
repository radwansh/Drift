import { sql, SQL } from "drizzle-orm";
import { companies } from "@saas/db";

/**
 * Writing `companies.settings` **in the UPDATE**, rather than reading it,
 * editing the object in application code and writing the whole thing back.
 *
 * It is one free-form jsonb column shared by five features — `plan`, the three
 * Stripe keys, `integrations`, `fiscalStartMonth`, `aiEnabled` and
 * `tolerances`; `routers/settings.ts` carries the table of which endpoint owns
 * which key. Because they share a column, a read-modify-write does not lose a
 * concurrent write to its *own* key — the second writer wins, which is what
 * anyone would expect, and is why nothing ever noticed. What it loses is a
 * concurrent write to a **different** key: two admins acting at once, one
 * turning AI off and one setting the fiscal start month, and whichever UPDATE
 * lands second writes back the object it read before the first one ran. Among
 * the keys that disappear that way is the company's billing state.
 *
 * Merging in SQL puts the read and the write under the same row lock, so there
 * is no window at all. These are the pieces every writer of the column shares,
 * in one place rather than in five copies that merely agree today.
 *
 * `test/company-settings-atomic.test.ts` interleaves a second caller's write
 * into the middle of each of them.
 */

/**
 * The column as an object, guaranteed.
 *
 * `jsonb || jsonb` merges two objects but **appends** when either side is not
 * one, so a column somehow holding `'null'::jsonb` or a scalar would
 * concatenate into an array, and every `settings.plan` read would then go
 * quietly undefined. The column is `NOT NULL DEFAULT '{}'`, but a direct write
 * is how `plan` is set today, so a typo there is reachable. Treating a
 * non-object as `{}` keeps the merge a merge.
 */
export function companySettingsObject(): SQL {
  return sql`CASE WHEN jsonb_typeof(${companies.settings}) = 'object' THEN ${companies.settings} ELSE '{}'::jsonb END`;
}

/**
 * The column merged with `patch`, as one expression for an UPDATE's `SET`.
 *
 * `patch` is either a plain object — serialised and sent as a single bind
 * parameter — or a jsonb expression built in SQL, which is what
 * `integrations.configure` needs: its edit is per element inside an array, so
 * the value it merges has to be computed from the column rather than supplied
 * with the call.
 */
export function mergeCompanySettings(patch: Record<string, unknown> | SQL): SQL {
  const value = patch instanceof SQL ? patch : sql`${JSON.stringify(patch)}::jsonb`;
  return sql`${companySettingsObject()} || ${value}`;
}

/**
 * `expr` with each key in `keys` deleted — one `- 'key'::text` per key, each a
 * bind parameter. An empty list returns `expr` untouched.
 *
 * The cast is required rather than decorative: `jsonb - integer` deletes an
 * array *element*, so an untyped parameter leaves Postgres unable to choose
 * the operator at all (42725).
 */
export function unsetCompanySettingsKeys(expr: SQL, keys: readonly string[]): SQL {
  let out = expr;
  for (const key of keys) out = sql`(${out}) - ${key}::text`;
  return out;
}
