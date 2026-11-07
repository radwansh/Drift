import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { ensureUser, type CurrentUserRow } from "./ensure-user";

/**
 * The signed-in account, resolved **once per request**.
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
export const currentAccount = cache(async (): Promise<CurrentUserRow | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  return ensureUser(requireDb(), userId);
});
