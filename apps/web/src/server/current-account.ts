import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { companies, requireDb, users, type DbClient } from "@saas/db";
import { planOfSettings, type PlanId } from "@/lib/plans";
import { ensureUser, type CurrentUserRow } from "./ensure-user";

/**
 * The signed-in account **and the plan its company is on**, resolved once per
 * request.
 *
 * `(main)/layout.tsx` needs the role to gate the sidebar and every page under
 * it needs the account to gate itself, so each page view resolved the same user
 * twice: one indexed lookup each, on paths that are already dynamic. React's
 * `cache()` memoises per request, so the layout and the page share one.
 *
 * Returning `null` for "not signed in" rather than throwing, because the two
 * callers want different things from that case — the layout hides the gated
 * links, a page redirects to `/login` — and a thrown error cannot be told apart
 * from a database failure, which they also handle differently.
 *
 * No Clerk profile argument. `ensureUser` loads the profile itself, and only on
 * the create path, so passing one from a page meant every page view called
 * `currentUser()` to supply something used once per account. That is one fewer
 * Clerk request per view as well as one fewer query.
 *
 * `cache()` is per request, never across them: it is not a cache of the user
 * row, and a role change takes effect on the next request as it did before.
 */

export type CurrentAccount = CurrentUserRow & {
  /**
   * `companies.settings.plan`, parsed against `lib/plans.ts`.
   *
   * `"free"` when the key is absent — the same default `getBillingInfo`
   * applies — and `null` when it holds something the vocabulary does not
   * recognise. `null` rather than a fallback to `"free"` because "free" is a
   * real plan with real consequences; a gate must not be told a company is on
   * a plan nobody put it on. Either way it is not Enterprise, so both close
   * the capability.
   */
  plan: PlanId | null;
};

/**
 * The account in one query.
 *
 * Exported for `test/current-account.test.ts`, which asserts that round-trip
 * count and the plan defaults: the `cache()`d wrapper below cannot be called
 * from a test, because `auth()` needs a request context.
 *
 * The plan lives on `companies`, not on `users`, so carrying it could have
 * cost a second lookup per request. It does not: the common path is one join
 * on `users.clerk_user_id`, which is UNIQUE, selecting the same six user
 * columns `ensureUser` returns plus the company's `settings`. So the layout
 * and the page still share **one** query between them, and the plan reaches
 * the sidebar for free rather than adding a request per page view — the
 * round-trip discipline the annual and Employee File routers are held to.
 *
 * `ensureUser` is still the authority on provisioning, and runs only when the
 * join finds nothing: a first-ever sign-in, where it creates the company and
 * the user row (or claims an invited one). That path pays for the extra reads
 * once per account rather than once per request.
 */
export async function loadAccount(db: DbClient, clerkUserId: string): Promise<CurrentAccount> {
  const [joined] = await db
    .select({
      id: users.id,
      companyId: users.companyId,
      email: users.email,
      name: users.name,
      role: users.role,
      clerkUserId: users.clerkUserId,
      settings: companies.settings,
    })
    .from(users)
    .innerJoin(companies, eq(companies.id, users.companyId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (joined) {
    const { settings, ...row } = joined;
    return { ...row, plan: planOfSettings(settings) };
  }

  // No row for this Clerk id, so provision — then read the plan the new (or
  // claimed) company is on.
  const provisioned = await ensureUser(db, clerkUserId);
  const [company] = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, provisioned.companyId))
    .limit(1);

  return { ...provisioned, plan: planOfSettings(company?.settings) };
}

export const currentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  return loadAccount(requireDb(), userId);
});
