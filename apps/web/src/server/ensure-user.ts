import { and, eq, isNull, or } from "drizzle-orm";
import { companies, users, type DbClient } from "@saas/db";

/**
 * Resolves a Clerk session to a `users` row, creating one if it does not exist
 * (step 1 of docs/ANNUAL_PAGE_FIX_PLAN.md).
 *
 * Nothing in the app used to create this row. `auth.createCompany` is the only
 * code that inserts a company and its first user, and no UI ever called it;
 * there is no Clerk webhook either. So a signed-in account had a valid session
 * and no database presence, and `/annual-salaries` — the only page that
 * resolves a user during a server render — redirected to `/login`, which
 * bounced to `/dashboard` via `afterSignInUrl`.
 *
 * Lazy provisioning rather than a `user.created` webhook because this repairs
 * accounts that already exist, needs no new secret, and cannot leave a user
 * stuck if a delivery fails.
 *
 * Every write is idempotent and no interactive transaction is used, because
 * neon-http has none. `users.clerk_user_id`, `users.email` and
 * `companies.slug` are all UNIQUE, so each insert is an
 * insert-or-nothing followed by a re-select. A crash halfway leaves a company
 * with no user, and the next call finds that company by its deterministic slug
 * and completes the job.
 */

export interface CurrentUserRow {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: string;
  /** Nullable on the table, but always set on a row this function returns. */
  clerkUserId: string | null;
}

export interface ClerkProfile {
  email?: string | null;
  name?: string | null;
}

/** Deterministic, so re-entry after a partial failure finds the same company. */
function companySlugFor(clerkUserId: string): string {
  const base = clerkUserId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `co-${base}`.slice(0, 100);
}

/**
 * `users.email` is UNIQUE and NOT NULL, so a row needs a value that is unique
 * per account even when Clerk gives us no address. This is also why
 * `auth.inviteUser`'s `clerkUserId: ""` and `createCompany`'s `email: ""` can
 * each only ever succeed once (finding 4c).
 */
function placeholderEmailFor(clerkUserId: string): string {
  return `${clerkUserId.toLowerCase()}@no-reply.invalid`;
}

async function loadClerkProfile(): Promise<ClerkProfile> {
  // Only ever called on the create path, so this costs one Clerk request per
  // account rather than one per web request.
  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    if (!user) return {};
    const email =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return { email, name: name.length > 0 ? name : null };
  } catch {
    // Clerk unavailable, or called outside a request context (tests). Fall back
    // to placeholders rather than failing provisioning.
    return {};
  }
}

export async function ensureUser(
  db: DbClient,
  clerkUserId: string,
  profile?: ClerkProfile,
): Promise<CurrentUserRow> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  if (existing) return existing;

  const resolved = profile ?? (await loadClerkProfile());
  const email = resolved.email?.trim() || placeholderEmailFor(clerkUserId);
  const displayName = resolved.name?.trim() || "Owner";

  // An invitation created a row with this email and no Clerk id
  // (auth.inviteUser). Claim it so an invited user joins the company they were
  // invited to instead of silently getting a company of their own.
  //
  // Matches NULL as of migration 0008, and `""` as well so rows written before
  // it are still claimable on a database that has not been migrated yet.
  const invited = await db.query.users.findFirst({
    where: and(
      eq(users.email, email),
      or(isNull(users.clerkUserId), eq(users.clerkUserId, "")),
    ),
  });
  if (invited) {
    const [claimed] = await db
      .update(users)
      .set({ clerkUserId, updatedAt: new Date() })
      .where(eq(users.id, invited.id))
      .returning();
    if (claimed) return claimed;
  }

  const slug = companySlugFor(clerkUserId);
  const [created] = await db
    .insert(companies)
    .values({
      name: resolved.name?.trim() ? `${resolved.name.trim()}'s company` : "My company",
      slug,
      currencyCode: "USD",
    })
    .onConflictDoNothing({ target: companies.slug })
    .returning();

  const company =
    created ?? (await db.query.companies.findFirst({ where: eq(companies.slug, slug) }));
  if (!company) {
    throw new Error(`Could not create or find a company for Clerk user ${clerkUserId}`);
  }

  await db
    .insert(users)
    .values({
      companyId: company.id,
      email,
      name: displayName,
      role: "admin",
      clerkUserId,
    })
    // Any of the three unique constraints may fire under a concurrent request.
    .onConflictDoNothing();

  const row = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  if (!row) {
    // The insert was dropped and no row exists for this Clerk id, so the
    // collision was on `email` against a row belonging to someone else.
    throw new Error(
      `Could not provision a user for Clerk user ${clerkUserId}: the address ${email} is already in use by another account.`,
    );
  }
  return row;
}
