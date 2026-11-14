import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db, requireDb } from "@saas/db";
import { EDITOR_ROLES, PAY_DETAIL_ROLES } from "@/lib/roles";
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
 * Loads the caller's user row once and attaches it to the context.
 *
 * Every annual procedure previously re-queried the user to get its companyId,
 * which is part of the 13 round trips per page view (finding A5). Resolving it in
 * middleware means one query shared by the whole call.
 */
const withCurrentUser = isAuthenticated.unstable_pipe(async ({ ctx, next }) => {
  // Provisions the company and user on first use rather than 404ing (step 1 of
  // docs/ANNUAL_PAGE_FIX_PLAN.md). Nothing else creates that row, so every
  // member procedure used to fail for a freshly signed-up account. The lookup
  // is unchanged for an account that already has one.
  let currentUser;
  try {
    currentUser = await ensureUser(ctx.db, ctx.userId);
  } catch (cause) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not resolve your account.",
      cause,
    });
  }
  return next({ ctx: { ...ctx, currentUser, companyId: currentUser.companyId } });
});

export const memberProcedure = baseProcedure.use(withCurrentUser);

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
};
