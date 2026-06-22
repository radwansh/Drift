import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db, requireDb } from "@saas/db";

export async function createContext() {
  const authResult = await auth();
  return { userId: authResult.userId, db };
}

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { userId: ctx.userId, db: requireDb() } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
