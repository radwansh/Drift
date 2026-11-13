import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { companies } from "@saas/db";
import { hasIntegrations, planOfSettings, type PlanId } from "@/lib/plans";
import { editorProcedure, memberProcedure, router, type MemberContext } from "../trpc";

/**
 * Two gates, on two different axes, because they answer two different
 * questions.
 *
 * Every procedure here was a `protectedProcedure`: any signed-in viewer, on
 * any plan, could list a company's connectors and connect or disconnect one by
 * calling the procedure directly. `(main)/integrations/page.tsx` and the
 * sidebar gate the **screen** on the plan, which left the entitlement
 * advisory — that page's own comment said so and asked for this.
 *
 * What is behind the gate is a provider name and a config blob in a JSON
 * column, not pay detail, so this is not the Employee File's problem and the
 * reflex to tighten everything is not this repo's rule: `comparisons.getById`
 * is deliberately wide because the Dashboard and the Detailed View are built
 * on it. It is still worth gating, on both axes, for reasons that survive that
 * comparison — `configure` and `disconnect` are company-wide writes that
 * change what every member sees, and nothing whatever is built on their being
 * open.
 *
 * **The plan gate reads `hasIntegrations`, the same predicate as the nav and
 * the page.** CLAUDE.md warns against sharing a constant between two
 * predicates that merely agree today — `EDITOR_ROLES` and `PAY_DETAIL_ROLES`
 * are the example: two different questions with the same answer. This is the
 * other case, one question with four callers, and `lib/plans.ts` says in as
 * many words that the nav gate, the page gate and the test read one authority
 * so they cannot disagree. A fifth hand-written `=== "enterprise"` is the
 * thing to avoid here, not the reuse.
 *
 * **It costs no extra round trip.** The lookup below is the one each handler
 * was doing for itself, so it is handed on through `ctx.companySettings` and
 * they do not repeat it: `list` was 2 queries and is 2, `configure` and
 * `disconnect` were 3 and are 3.
 */
async function resolveIntegrationsAccess(
  ctx: MemberContext,
): Promise<{ companySettings: Record<string, unknown>; plan: PlanId | null }> {
  const company = await ctx.db.query.companies.findFirst({
    where: eq(companies.id, ctx.companyId),
    columns: { settings: true },
  });
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

  const companySettings = (company.settings ?? {}) as Record<string, unknown>;
  // The same helper `current-account.ts` derives the sidebar's plan with, so an
  // absent key means "free" in both places rather than in two copies of it.
  const plan = planOfSettings(companySettings);
  if (!hasIntegrations(plan)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Connectors are an Enterprise feature. This company is not on a plan that includes them.",
    });
  }
  return { companySettings, plan };
}

/**
 * Reading the connector list. `memberProcedure` rather than
 * `protectedProcedure` for the reason CLAUDE.md gives for new code: it carries
 * `companyId`, so the handler needs no lookup of its own.
 */
const integrationsReadProcedure = memberProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, ...(await resolveIntegrationsAccess(ctx)) } }),
);

/**
 * Connecting and disconnecting. `editorProcedure` is "may change company-wide
 * settings", and these write `companies.settings` for the whole company.
 *
 * The role is checked first, because `editorProcedure` refuses before this
 * middleware runs: a viewer on Enterprise is told about the role, an admin on
 * Starter is told about the plan.
 */
const integrationsWriteProcedure = editorProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, ...(await resolveIntegrationsAccess(ctx)) } }),
);

export const integrationsRouter = router({
  list: integrationsReadProcedure.query(({ ctx }) => {
    return (ctx.companySettings.integrations as Record<string, unknown>[]) ?? [];
  }),

  configure: integrationsWriteProcedure
    .input(z.object({
      provider: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const settings = ctx.companySettings;
      const integrations = (settings.integrations as Record<string, unknown>[]) ?? [];
      const existing = integrations.findIndex((i: Record<string, unknown>) => i.provider === input.provider);

      if (existing >= 0) {
        integrations[existing] = { ...integrations[existing], ...input.config };
      } else {
        integrations.push({ provider: input.provider, ...input.config, connectedAt: new Date().toISOString() });
      }

      await ctx.db.update(companies)
        .set({ settings: { ...settings, integrations }, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));

      return { provider: input.provider, configured: true };
    }),

  disconnect: integrationsWriteProcedure
    .input(z.object({ provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const settings = ctx.companySettings;
      const integrations = (settings.integrations as Record<string, unknown>[]) ?? [];
      const filtered = integrations.filter((i: Record<string, unknown>) => i.provider !== input.provider);

      await ctx.db.update(companies)
        .set({ settings: { ...settings, integrations: filtered }, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));

      return { provider: input.provider, disconnected: true };
    }),

  /**
   * A stub: there is no sync job anywhere in the repo and nothing calls this.
   * Gated with the reads anyway rather than left behind on
   * `protectedProcedure` — a procedure that answers everyone because nobody
   * asks it anything is how the other three got here, and the day it reports
   * something real it should already be behind the plan.
   */
  syncStatus: integrationsReadProcedure
    .input(z.object({
      provider: z.string().min(1),
      periodId: z.string().uuid(),
    }))
    .query(({ input }) => {
      return {
        provider: input.provider,
        periodId: input.periodId,
        status: "not_synced",
        lastSyncAt: null,
      };
    }),
});
