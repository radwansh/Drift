import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies, requireDb } from "@saas/db";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { sendClerkInvitation } from "../clerk-invitations";

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

  /**
   * Invites somebody into the caller's company — **and now actually tells
   * them.**
   *
   * This inserted a `users` row and sent nothing. `ensureUser` claims that row
   * by email when the person signs in, so this side of the plumbing was always
   * right; the invitation itself was never sent, and an admin had no way to
   * notice, because the row appears in the user list exactly as a successful
   * invitation would. `server/clerk-invitations.ts` is the missing half, shared
   * with onboarding's step 5.
   *
   * **Clerk first, the row second.** A Clerk invitation is retryable
   * (`ignoreExisting`), while a row left behind by a failed invitation is a
   * person in the user list who was never told. And because `users.email` is
   * UNIQUE across the whole table, the clash is checked before anything is
   * sent, so the common failure never leaves a sent invitation with no role
   * recorded.
   */
  inviteUser: protectedProcedure
    .input(z.object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().min(1).max(200),
      role: z.enum(["admin", "manager", "viewer"]).default("admin"),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (currentUser.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      if (input.email === currentUser.email.trim().toLowerCase()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is your own address.",
        });
      }

      const existing = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            existing.companyId === currentUser.companyId
              ? "That address is already on your company."
              : "That address already has a Clarivo account.",
        });
      }

      const sent = await sendClerkInvitation(input.email);
      if (!sent.ok) {
        // Nothing is written when nothing was sent: a row in the user list is
        // what this procedure used to offer instead of an invitation.
        throw new TRPCError({ code: "BAD_GATEWAY", message: sent.message });
      }

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

      if (!invited) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The invitation was sent, but the access level could not be recorded. Try again: a repeated invitation to the same address is accepted.",
        });
      }

      return { ...invited, invitationId: sent.invitationId };
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
