import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies, requireDb } from "@saas/db";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const authRouter = router({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, user.companyId),
    });

    return { ...user, company };
  }),

  createCompany: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(100),
      currencyCode: z.string().length(3),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = requireDb();

      const existing = await db.query.companies.findFirst({
        where: eq(companies.slug, input.slug),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Company slug already taken" });

      const [company] = await db.insert(companies).values({
        name: input.name,
        slug: input.slug,
        currencyCode: input.currencyCode,
      }).returning();

      const [user] = await db.insert(users).values({
        companyId: company.id,
        // `users.email` is UNIQUE NOT NULL, so the literal `""` this used to
        // write could only ever succeed once per database (finding 4c, same
        // class as the invite collision). Nothing calls this procedure — the
        // supported path is `ensureUser` — but it should not be a trap.
        email: `${ctx.userId.toLowerCase()}@no-reply.invalid`,
        name: input.name,
        role: "admin",
        clerkUserId: ctx.userId,
      }).returning();

      return { company, user };
    }),

  inviteUser: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).max(200),
      role: z.enum(["admin", "manager", "viewer"]).default("admin"),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (currentUser.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const [invited] = await ctx.db.insert(users).values({
        companyId: currentUser.companyId,
        email: input.email,
        name: input.name,
        role: input.role,
        // Finding 4c: `""` collided on the UNIQUE index, so only the first
        // invitation in a company ever succeeded. `ensureUser` claims this row
        // by email when the person first signs in.
        clerkUserId: null,
      }).returning();

      return invited;
    }),

  getUsers: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!currentUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

    const companyUsers = await ctx.db.query.users.findMany({
      where: eq(users.companyId, currentUser.companyId),
      orderBy: (u, { asc }) => [asc(u.name)],
    });

    return companyUsers;
  }),
});
