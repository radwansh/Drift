import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies } from "@saas/db";
import { protectedProcedure, router } from "../trpc";

export const integrationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, currentUser.companyId),
    });
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });

    const settings = company.settings as Record<string, unknown>;
    const integrations = (settings.integrations as Record<string, unknown>[]) ?? [];
    return integrations;
  }),

  configure: protectedProcedure
    .input(z.object({
      provider: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, currentUser.companyId),
      });
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      const settings = (company.settings as Record<string, unknown>) ?? {};
      const integrations = (settings.integrations as Record<string, unknown>[]) ?? [];
      const existing = integrations.findIndex((i: Record<string, unknown>) => i.provider === input.provider);

      if (existing >= 0) {
        integrations[existing] = { ...integrations[existing], ...input.config };
      } else {
        integrations.push({ provider: input.provider, ...input.config, connectedAt: new Date().toISOString() });
      }

      await ctx.db.update(companies)
        .set({ settings: { ...settings, integrations }, updatedAt: new Date() })
        .where(eq(companies.id, currentUser.companyId));

      return { provider: input.provider, configured: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, currentUser.companyId),
      });
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      const settings = (company.settings as Record<string, unknown>) ?? {};
      const integrations = (settings.integrations as Record<string, unknown>[]) ?? [];
      const filtered = integrations.filter((i: Record<string, unknown>) => i.provider !== input.provider);

      await ctx.db.update(companies)
        .set({ settings: { ...settings, integrations: filtered }, updatedAt: new Date() })
        .where(eq(companies.id, currentUser.companyId));

      return { provider: input.provider, disconnected: true };
    }),

  syncStatus: protectedProcedure
    .input(z.object({
      provider: z.string().min(1),
      periodId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        provider: input.provider,
        periodId: input.periodId,
        status: "not_synced",
        lastSyncAt: null,
      };
    }),
});
