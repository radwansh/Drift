import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies } from "@saas/db";
import { editorProcedure, protectedProcedure, router } from "../trpc";

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

  /**
   * Renaming the company, and setting the currency every figure in the product
   * is labelled with, is a **company-wide write**, so this is an
   * `editorProcedure` and not a `protectedProcedure`.
   *
   * It was a `protectedProcedure` while nothing called it, which meant any
   * signed-in viewer could rename the company for everyone in it and relabel
   * every amount on every screen. `(main)/settings/page.tsx` now calls it, so
   * the gate has to arrive in the same change as the form — shipping the form
   * on its own would ship the hole.
   *
   * `editorProcedure` also resolves the caller once in middleware, so the user
   * lookup this procedure used to do itself is gone: `ctx.companyId` is the
   * same value, one query cheaper.
   *
   * **`settings` replaces the whole object, it does not merge.** That is
   * unchanged here, and it matters more than it used to: `companies.settings`
   * is where `plan`, `stripeSubscriptionId`/`stripeSubscriptionStatus` and
   * `integrations` live, so a caller that passes a partial `settings` silently
   * destroys a company's billing and integration state. Nothing in the app
   * passes it — the company form sends `name` and `currencyCode` only, which
   * is why the three fields the form used to show are gone rather than folded
   * into `settings` — and the next caller that needs one key of it should make
   * this a read-modify-write, or take a narrower input, rather than discover
   * the replace from a support ticket.
   */
  updateCompany: editorProcedure
    .input(z.object({
      name: z.string().min(1).max(200).optional(),
      currencyCode: z.string().length(3).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.currencyCode) updateData.currencyCode = input.currencyCode;
      if (input.settings) updateData.settings = input.settings;

      const [updated] = await ctx.db.update(companies)
        .set(updateData)
        .where(eq(companies.id, ctx.companyId))
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
