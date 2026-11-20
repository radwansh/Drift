import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, requireDb, users, companies } from "@saas/db";
import { EDITOR_ROLES, PAY_DETAIL_ROLES } from "@/lib/roles";
import { entitlementOf, type CompanySettings } from "@/lib/entitlement";
import { ensureUser } from "./ensure-user";
import { scrubSchemaDriftShape, translateSchemaDriftError } from "./schema-drift";

export async function createContext() {
  const authResult = await auth();
  return { userId: authResult.userId, db };
}

/**
 * The schema-drift guard is wired in here, in the two places that see every
 * tRPC error, rather than in the two pages that happened to render one.
 *
 * A preview deployment ran migration-0011 code against an 0008 database and put
 * `column "control_total_gross" does not exist` on the user's screen, because
 * `payroll-periods/page.tsx:285` and `dashboard/page.tsx:130` both render
 * `{error.message}` verbatim — into a `Notice tone="danger"` since the Ink &
 * Signal rebuild, an `AlertDescription` before it. `server/schema-drift.ts` has
 * the detection, the reasoning and the message.
 *
 * It takes two halves because `errorFormatter` is **synchronous** — in
 * @trpc/server 11.18 `ErrorFormatter` is `(opts) => TShape`, not
 * `(opts) => Promise<TShape>` — so it cannot await the applied-migration count
 * that makes the message worth reading:
 *
 * - `schemaDriftGuard`, below, is a middleware on every exported procedure. It
 *   can await, so it produces the message naming the pending tags.
 * - `errorFormatter` is the backstop. It cannot name the tags, but it
 *   guarantees the invariant — no driver string reaches a client — for any
 *   drift error that did not pass through the middleware chain.
 */
const t = initTRPC.context<typeof createContext>().create({
  errorFormatter: ({ error, shape }) => scrubSchemaDriftShape(error, shape),
});

export const router = t.router;

/**
 * Costs nothing on the happy path: `next()` has already succeeded, and the
 * lookup runs only for a failure whose SQLSTATE says the database is behind the
 * code. That matters because `test/annual-router.test.ts` and
 * `test/employee-file-router.test.ts` assert exact round-trip budgets (2, and
 * 3 with `toBe`), which a query added here on success would fail — correctly.
 *
 * A middleware returns `{ ok: false, error }` rather than throwing, so the
 * failed result is inspected and either replaced or passed through untouched.
 */
const schemaDriftGuard = t.middleware(async ({ ctx, next }) => {
  const result = await next();
  if (result.ok) return result;
  const translated = await translateSchemaDriftError(result.error, ctx.db);
  if (translated) throw translated;
  return result;
});

/**
 * Every exported procedure is built from this, so the guard covers the whole
 * API surface. `t` itself is not exported, which is what keeps a new router
 * from accidentally building on a bare `t.procedure` and slipping past it.
 */
const baseProcedure = t.procedure.use(schemaDriftGuard);

export const publicProcedure = baseProcedure;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Prefer the client on the context, falling back to requireDb() for its error
  // message when none was provided. In production createContext always supplies
  // the module client, so this is the same object either way; it also lets a test
  // inject a database without DATABASE_URL being set.
  return next({ ctx: { userId: ctx.userId, db: ctx.db ?? requireDb() } });
});

export const protectedProcedure = baseProcedure.use(isAuthenticated);

/**
 * Both role sets come from `lib/roles.ts` and are re-exported here, so every
 * existing `from "../trpc"` import keeps working.
 *
 * They live in a dependency-free module because `lib/constants.ts` needs
 * `PAY_DETAIL_ROLES` to gate the sidebar entry, and `lib/constants.ts` is
 * imported by a client component — importing this file from there would pull
 * Clerk's server SDK and the Neon driver into the client bundle.
 */
export { EDITOR_ROLES, PAY_DETAIL_ROLES };

/**
 * Loads the caller's user row **and their company's settings** once, and
 * attaches both to the context.
 *
 * Every annual procedure previously re-queried the user to get its companyId,
 * which is part of the 13 round trips per page view (finding A5). Resolving it in
 * middleware means one query shared by the whole call.
 *
 * **The settings ride on that same query, by a join.** Entitlement — whether
 * the company's trial or subscription is live — has to be checked by every data
 * procedure, and reading `companies.settings` separately would have cost one
 * request per call and broken the round-trip budgets that
 * `test/annual-router.test.ts` and `test/employee-file-router.test.ts` assert.
 * Those tests are exact rather than `<=`, so a second request would fail them
 * rather than quietly costing money; they pass unchanged.
 *
 * This is the shape `server/current-account.ts` already uses for the plan, for
 * the same reason, and `ensureUser` stays the authority on provisioning: it
 * runs only when the join finds nothing, which is a first-ever sign-in. That
 * path pays for the extra reads once per account instead of once per request.
 */
const withCurrentUser = isAuthenticated.unstable_pipe(async ({ ctx, next }) => {
  let currentUser;
  let companySettings: CompanySettings;
  try {
    const [joined] = await ctx.db
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
      .where(eq(users.clerkUserId, ctx.userId))
      .limit(1);

    if (joined) {
      const { settings, ...row } = joined;
      currentUser = row;
      companySettings = settings as CompanySettings;
    } else {
      // Provisions the company and user on first use rather than 404ing (step 1
      // of docs/ANNUAL_PAGE_FIX_PLAN.md). Nothing else creates that row, so
      // every member procedure used to fail for a freshly signed-up account.
      currentUser = await ensureUser(ctx.db, ctx.userId);
      const [company] = await ctx.db
        .select({ settings: companies.settings })
        .from(companies)
        .where(eq(companies.id, currentUser.companyId))
        .limit(1);
      companySettings = company?.settings as CompanySettings;
    }
  } catch (cause) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not resolve your account.",
      cause,
    });
  }
  return next({
    ctx: { ...ctx, currentUser, companySettings, companyId: currentUser.companyId },
  });
});

/**
 * The company's trial or subscription must be live, or the data is refused.
 *
 * **This is the paywall, not the dialog.** `TrialPaywall` is a sentence a
 * customer can read; deleting it in the browser unlocks nothing because this
 * middleware answers the same `entitlementOf()` question on the server. The two
 * cannot disagree, because there is one function and they both call it.
 *
 * `cause: "PAYMENT_REQUIRED"` rather than a bare FORBIDDEN so the client can
 * tell "you have not paid" from "you are the wrong role" and open the paywall
 * on the spot — which is what makes the dialog appear the moment a trial lapses
 * under an open tab, without a reload.
 *
 * **It refuses `trial_ended` and `subscription_ended` only, and deliberately
 * not `onboarding_incomplete`.** A company with no `onboardingCompletedAt` is
 * one that existed before this release; the app layout sends its admin through
 * onboarding once, pre-filled, and refusing its data as well would lock out
 * every existing customer on release day for a trial they were never offered.
 * The brief's own rule — nobody is locked out on release day — is this branch.
 */
const withEntitlement = withCurrentUser.unstable_pipe(async ({ ctx, next }) => {
  const { access, reason } = entitlementOf(ctx.companySettings, new Date());
  if (!access && (reason === "trial_ended" || reason === "subscription_ended")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        reason === "trial_ended"
          ? "Your free trial has ended. Choose a plan to keep using Clarivo."
          : "Your subscription has ended. Choose a plan to keep using Clarivo.",
      cause: "PAYMENT_REQUIRED",
    });
  }
  return next({ ctx });
});

export const memberProcedure = baseProcedure.use(withEntitlement);

/**
 * A member procedure **without** the entitlement gate, for the few endpoints
 * the paywall itself needs: `getBillingInfo`, `getCheckout` and
 * `createBillingPortal`.
 *
 * Gating these would be a lock whose key is behind the lock — the customer
 * would see a dialog asking them to choose a plan and every button on it would
 * fail. Nothing that reads payroll data may use this.
 */
export const billingProcedure = baseProcedure.use(withCurrentUser);

/**
 * Editor-only (step 22, finding A4).
 *
 * Nothing checked roles before this: a viewer could recategorise components —
 * moving money between every bucket on the dashboard for the whole company — and
 * set the annual budget.
 */
export const editorProcedure = memberProcedure.use(async ({ ctx, next }) => {
  if (!EDITOR_ROLES.includes(ctx.currentUser.role as (typeof EDITOR_ROLES)[number])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Changing company-wide annual settings requires the admin or manager role.",
    });
  }
  return next({ ctx });
});

/**
 * An editor procedure **without** the entitlement gate, for
 * `createBillingPortal`.
 *
 * The portal is how a company with an ended subscription fixes it, so gating it
 * on having a live subscription would be circular — the paywall's "Manage
 * billing" button would fail for precisely the customer it is shown to. The
 * role check stays: a viewer still may not open one.
 */
export const billingEditorProcedure = billingProcedure.use(async ({ ctx, next }) => {
  if (!EDITOR_ROLES.includes(ctx.currentUser.role as (typeof EDITOR_ROLES)[number])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Managing billing requires the admin or manager role.",
    });
  }
  return next({ ctx });
});

/**
 * Admin and manager, both full pay detail (Employee File, step A1).
 *
 * `PAY_DETAIL_ROLES` is defined in `lib/roles.ts` and re-exported above.
 *
 * Replaces `adminProcedure` on `employees.*` and `annual.drillDownEmployees`.
 * The rule it relaxes was never actually a rule: `comparisons.getById` is a
 * `memberProcedure` that returns every `comparison_results` row — name, gross,
 * net, per-component deltas — to any signed-in member, viewers included, and
 * the Dashboard and Detailed View are built on it. So admin-only here protected
 * nothing while costing coherence.
 *
 * "Manager" cannot mean "my team": Clarivo stores no reporting line, so a
 * manager reads the whole company. `employee_file_access_log` is the control
 * that makes that defensible, which is why the Employee File's reads are logged
 * inside the same batch as their data queries.
 *
 * The message must not contain the words "admin role" on its own: two existing
 * suites match a refusal on /FORBIDDEN|admin role/i and this one has to be
 * distinguishable from `adminProcedure`'s.
 */
export const payDetailProcedure = memberProcedure.use(async ({ ctx, next }) => {
  if (!PAY_DETAIL_ROLES.includes(ctx.currentUser.role as (typeof PAY_DETAIL_ROLES)[number])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Reading individual pay detail requires the admin or manager role.",
    });
  }
  return next({ ctx });
});

/**
 * Admin-only. Reserved: nothing in the app uses it after the Employee File
 * change moved `employees.*` and `annual.drillDownEmployees` onto
 * `payDetailProcedure`.
 *
 * Kept rather than deleted because user and role administration belongs behind
 * it and currently is not — `auth.inviteUser` hand-rolls its own
 * `role !== "admin"` check — so removing the export would widen that change.
 *
 * Its previous comment claimed employee-level pay was admin-only because "a
 * manager who can edit company settings should not automatically be able to
 * read every salary". That is the policy `payDetailProcedure` reverses; the
 * comment is corrected here rather than left to contradict the code.
 */
export const adminProcedure = memberProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires the admin role.",
    });
  }
  return next({ ctx });
});

export type ProtectedContext = { userId: string; db: NonNullable<typeof db> };
export type MemberContext = ProtectedContext & {
  currentUser: { id: string; companyId: string; role: string };
  companyId: string;
  /**
   * The company's `companies.settings`, from the same join that resolved the
   * user. Read it for entitlement rather than querying the column again — that
   * is the whole reason it is here, and the round-trip budget tests are exact.
   */
  companySettings: CompanySettings;
};
