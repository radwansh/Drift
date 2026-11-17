import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies } from "@saas/db";
import { editorProcedure, protectedProcedure, router } from "../trpc";
import {
  companySettingsObject,
  mergeCompanySettings,
  unsetCompanySettingsKeys,
} from "../company-settings";

/**
 * The keys of `companies.settings` this endpoint may write.
 *
 * `settings` is one free-form jsonb column shared by four features, so "write
 * the settings" is not one capability. What actually lives there:
 *
 * | key | read by | written by |
 * |---|---|---|
 * | `plan` | `current-account.ts`, `getBillingInfo` | nothing — a direct SQL write |
 * | `stripeSubscriptionId` / `…Status` / `subscriptionPeriodEnd` | `getBillingInfo`, `createBillingPortal` | nothing yet |
 * | `integrations` | `integrations.list`, `components/integrations/providers.ts` | `integrations.configure` / `.disconnect` |
 * | `fiscalStartMonth` | `annual.ts`, `employee-file/scope.ts` | `annual.setFiscalStartMonth` |
 * | `aiEnabled` | `annual.ts` | `annual.setAiEnabled` |
 * | `tolerances` | `employee-file/scope.ts` | **nothing** |
 *
 * Every one of those except `tolerances` is either capability state that must
 * not be settable from a settings form, or a preference that already has a
 * narrower endpoint which validates its value. `tolerances` is the only key
 * with a reader and no writer — `scope.ts` says in as many words that its
 * writer is "an operator or a future settings screen" — so it is the only key
 * this endpoint claims.
 *
 * The list is an **allow-list and not a deny-list**, so it fails closed: a
 * billing key added to the column next year is unwritable here until someone
 * adds it deliberately, which is the opposite of the way the replace behaved.
 */
const WRITABLE_SETTINGS_KEYS = ["tolerances"] as const;

/**
 * Keys that exist in the column and are refused here **by name**, so the error
 * points at the thing that does own them instead of saying "unknown key".
 *
 * A `Map` rather than an object literal: `{}["toString"]` is a function, so an
 * object would treat `{"toString": 1}` as a known key and interpolate a
 * function into the message.
 */
const SETTINGS_OWNED_ELSEWHERE = new Map<string, string>([
  ["plan", "a company's plan is set only by a direct database write"],
  ["stripeSubscriptionId", "billing state belongs to Stripe, not to this form"],
  ["stripeSubscriptionStatus", "billing state belongs to Stripe, not to this form"],
  ["subscriptionPeriodEnd", "billing state belongs to Stripe, not to this form"],
  ["integrations", "use integrations.configure or integrations.disconnect"],
  ["fiscalStartMonth", "use annual.setFiscalStartMonth, which bounds the month and clears the summary memo"],
  ["aiEnabled", "use annual.setAiEnabled"],
]);

/**
 * `plan` is the one worth being explicit about: a merge that took arbitrary
 * keys would let any admin put their own company on Enterprise through the
 * settings form — unlocking Integrations — because `hasIntegrations` trusts
 * `settings.plan` and nothing audits it. The replace could not do that (it
 * could only destroy the key), so merging without this check would have opened
 * a hole rather than closed one.
 */
function assertWritableSettingsKey(key: string): void {
  if ((WRITABLE_SETTINGS_KEYS as readonly string[]).includes(key)) return;
  const owner = SETTINGS_OWNED_ELSEWHERE.get(key);
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: owner
      ? `settings.updateCompany does not write "${key}": ${owner}.`
      : `settings.updateCompany does not write "${key}". It writes: ${WRITABLE_SETTINGS_KEYS.join(", ")}.`,
  });
}

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
   * **`settings` merges, it does not replace.** It used to replace: a caller
   * passing one key wrote that key over the whole column and silently destroyed
   * the company's plan, its Stripe state, its connectors, its fiscal-year start
   * and its Employee File tolerances. Nothing passed it — the company form
   * sends `name` and `currencyCode` only, which is why the three fields the
   * form used to show are gone rather than folded in here — so it was a latent
   * trap rather than a live bug, and this closes it.
   *
   * **The merge is one `jsonb ||` in the UPDATE, not a read-modify-write.** It
   * is therefore atomic: the read and the write happen under the same row lock,
   * so a concurrent `integrations.configure` cannot be lost between them.
   * Read-then-write in application code was the other option, and was what
   * `integrations.configure`, `integrations.disconnect`,
   * `annual.setFiscalStartMonth` and `annual.setAiEnabled` all did — each able
   * to drop a concurrent write to a different key of the same column. All four
   * have since moved onto the same expressions, in
   * `server/company-settings.ts`.
   *
   * **Deleting a key** is `unsetSettings: ["key"]`, which appends `- 'key'` to
   * the same statement. It is a separate field rather than RFC 7396's
   * "a null value means delete", because that reading makes `{"key": null}`
   * ambiguous and leaves no way to store a JSON `null` at all; an explicit list
   * says which it is at the call site. A key named in both is refused rather
   * than resolved by precedence.
   *
   * Keys are checked against `WRITABLE_SETTINGS_KEYS` above — the merge is what
   * makes that necessary, since a merge that took any key would let an admin
   * write `plan` and unlock Integrations for their own company.
   */
  updateCompany: editorProcedure
    .input(z.object({
      name: z.string().min(1).max(200).optional(),
      currencyCode: z.string().length(3).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
      unsetSettings: z.array(z.string().min(1)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch = input.settings ?? {};
      const patchKeys = Object.keys(patch);
      const unsetKeys = input.unsetSettings ?? [];

      for (const key of [...patchKeys, ...unsetKeys]) assertWritableSettingsKey(key);

      const both = patchKeys.filter((key) => unsetKeys.includes(key));
      if (both.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `settings and unsetSettings both name ${both.join(", ")}; say which one.`,
        });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.currencyCode) updateData.currencyCode = input.currencyCode;

      if (patchKeys.length > 0 || unsetKeys.length > 0) {
        // `server/company-settings.ts` holds the merge, the non-object guard
        // and the `::text` cast on a delete, because this is no longer the only
        // writer doing it in SQL: `annual.setFiscalStartMonth`,
        // `annual.setAiEnabled`, `integrations.configure` and
        // `integrations.disconnect` all moved onto the same expressions, and
        // five copies of a guard are five things to keep in step.
        const base = patchKeys.length > 0 ? mergeCompanySettings(patch) : companySettingsObject();
        updateData.settings = unsetCompanySettingsKeys(base, unsetKeys);
      }

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
