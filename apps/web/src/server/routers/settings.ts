import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies } from "@saas/db";
import { protectedProcedure, router } from "../trpc";

export const settingsRouter = router({
  getCompany: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, currentUser.companyId),
    });
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });
    return company;
  }),

  updateCompany: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200).optional(),
      currencyCode: z.string().length(3).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.currencyCode) updateData.currencyCode = input.currencyCode;
      if (input.settings) updateData.settings = input.settings;

      const [updated] = await ctx.db.update(companies)
        .set(updateData)
        .where(eq(companies.id, currentUser.companyId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      return updated;
    }),

  getBillingInfo: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, currentUser.companyId),
    });
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });

    const settings = company.settings as Record<string, unknown>;
    return {
      subscriptionId: (settings.stripeSubscriptionId as string) ?? null,
      status: (settings.stripeSubscriptionStatus as string) ?? "inactive",
      plan: (settings.plan as string) ?? "free",
      periodEnd: (settings.subscriptionPeriodEnd as string) ?? null,
    };
  }),

  createBillingPortal: protectedProcedure
    .input(z.object({ returnUrl: z.string().url().default("/settings") }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, currentUser.companyId),
      });
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      const settings = company.settings as Record<string, unknown>;
      const subscriptionId = settings.stripeSubscriptionId as string;

      if (!subscriptionId) {
        return { url: "https://billing.stripe.com" };
      }

      return { url: `https://billing.stripe.com/session/${subscriptionId}` };
    }),
});
