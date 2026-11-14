import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, type SQL } from "drizzle-orm";
import { companies } from "@saas/db";
import { hasIntegrations, planOfSettings, type PlanId } from "@/lib/plans";
import { editorProcedure, memberProcedure, router, type MemberContext } from "../trpc";
import { companySettingsObject, mergeCompanySettings } from "../company-settings";

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
 * `settings.integrations` as an array, guaranteed, evaluated against the row
 * the UPDATE is already locking.
 *
 * The guard is the array counterpart of `companySettingsObject`'s: the key is
 * free-form jsonb like everything else in that column, and the JS version
 * crashed outright on a key holding anything but an array
 * (`integrations.findIndex is not a function`). An absent key and a key
 * holding a number both mean "no connectors" here, as `?? []` did for the
 * absent one.
 */
function storedConnectors(): SQL {
  const settings = companySettingsObject();
  return sql`CASE WHEN jsonb_typeof((${settings})->'integrations') = 'array'
                  THEN (${settings})->'integrations'
                  ELSE '[]'::jsonb END`;
}

/**
 * `settings` with its `integrations` key replaced by `connectors`, merged into
 * the column rather than written over it: every other key in that column
 * belongs to another feature and must survive a connector being added.
 */
function writeConnectors(connectors: SQL): SQL {
  return mergeCompanySettings(sql`jsonb_build_object('integrations', ${connectors})`);
}

/**
 * Matches the element of the connector array belonging to `provider`.
 *
 * `jsonb_typeof(e) = 'object'` first, so a scalar that found its way into the
 * array matches nothing and is carried through untouched instead of being
 * merged with a config object — `e || '{"k":1}'` on a scalar appends, which
 * would turn one bad element into two.
 */
function elementMatches(provider: string): SQL {
  return sql`jsonb_typeof(e) = 'object' AND e->>'provider' = ${provider}`;
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

  /**
   * Upsert by provider, **in one statement.**
   *
   * This read the column, edited the array in JS and wrote the whole object
   * back, which loses a concurrent write to any other key of a column shared
   * by five features — including the billing state. It is the awkward half of
   * that change, because the edit is per *element* rather than per key: a
   * plain `||` of one key cannot express "merge the config into the element
   * that is already there, or append a new one", so the array is rebuilt with
   * `jsonb_agg` over `jsonb_array_elements` of the locked row.
   *
   * Being per element, it preserves more than the neighbouring keys: two
   * admins connecting two *different* providers at once now both land, where a
   * whole-object write kept whichever finished second.
   *
   * The semantics are the JS ones, deliberately unchanged:
   * - an existing element is merged with the config **in place**, keeping its
   *   position and its original `connectedAt`, and letting the config override
   *   any key it names — `e || config` is `{...element, ...config}`;
   * - a new element is appended as `{provider, ...config, connectedAt}`, so a
   *   config carrying `provider` still overrides it and one carrying
   *   `connectedAt` still does not. The stamp is taken here rather than from
   *   `now()` so that it stays the ISO-8601 string the page reads.
   *
   * `WITH ORDINALITY` and the `ORDER BY` are what keep the array in its own
   * order: `jsonb_agg` over a set has no inherent order to rely on.
   */
  configure: integrationsWriteProcedure
    .input(z.object({
      provider: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const stored = storedConnectors();
      const appended = {
        provider: input.provider,
        ...input.config,
        connectedAt: new Date().toISOString(),
      };

      const connectors = sql`
        CASE WHEN EXISTS (SELECT 1
                          FROM jsonb_array_elements(${stored}) AS e
                          WHERE ${elementMatches(input.provider)})
             THEN (SELECT jsonb_agg(CASE WHEN ${elementMatches(input.provider)}
                                         THEN e || ${JSON.stringify(input.config)}::jsonb
                                         ELSE e END
                                    ORDER BY ord)
                   FROM jsonb_array_elements(${stored}) WITH ORDINALITY AS t(e, ord))
             ELSE (${stored}) || jsonb_build_array(${JSON.stringify(appended)}::jsonb)
        END`;

      await ctx.db.update(companies)
        .set({ settings: writeConnectors(connectors), updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));

      return { provider: input.provider, configured: true };
    }),

  /**
   * The same, filtering instead of upserting. `COALESCE` because `jsonb_agg`
   * over an empty set is SQL NULL, and disconnecting the last connector has to
   * leave the empty array the JS `filter` left rather than a null key.
   */
  disconnect: integrationsWriteProcedure
    .input(z.object({ provider: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const connectors = sql`
        COALESCE((SELECT jsonb_agg(e ORDER BY ord)
                  FROM jsonb_array_elements(${storedConnectors()}) WITH ORDINALITY AS t(e, ord)
                  WHERE NOT (${elementMatches(input.provider)})), '[]'::jsonb)`;

      await ctx.db.update(companies)
        .set({ settings: writeConnectors(connectors), updatedAt: new Date() })
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
