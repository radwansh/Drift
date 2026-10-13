import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db, requireDb } from "@saas/db";
import { ensureUser } from "./ensure-user";

export async function createContext() {
  const authResult = await auth();
  return { userId: authResult.userId, db };
}

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Prefer the client on the context, falling back to requireDb() for its error
  // message when none was provided. In production createContext always supplies
  // the module client, so this is the same object either way; it also lets a test
  // inject a database without DATABASE_URL being set.
  return next({ ctx: { userId: ctx.userId, db: ctx.db ?? requireDb() } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);

/** Roles that may change company-wide settings. Viewers are read-only. */
export const EDITOR_ROLES = ["admin", "manager"] as const;

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

export const memberProcedure = t.procedure.use(withCurrentUser);

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
 * Admin-only (step 44). Stricter than editor: employee-level pay is the one
 * thing the annual feature exposes about individuals, so a manager who can edit
 * company settings should not automatically be able to read every salary.
 */
export const adminProcedure = memberProcedure.use(async ({ ctx, next }) => {
  if (ctx.currentUser.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Employee-level figures require the admin role.",
    });
  }
  return next({ ctx });
});

export type ProtectedContext = { userId: string; db: NonNullable<typeof db> };
export type MemberContext = ProtectedContext & {
  currentUser: { id: string; companyId: string; role: string };
  companyId: string;
};
