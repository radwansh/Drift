import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, companies } from "@saas/db";
import {
  EDITOR_ROLES,
  billingEditorProcedure,
  billingProcedure,
  editorProcedure,
  protectedProcedure,
  router,
} from "../trpc";
import {
  TRIAL_SETTINGS_KEY_NAMES,
  entitlementOf,
  type CompanySettings,
} from "@/lib/entitlement";
import {
  companySettingsObject,
  mergeCompanySettings,
  unsetCompanySettingsKeys,
} from "../company-settings";
import {
  checkoutLinkForCompany,
  createCustomerPortalUrl,
  isPolarConfigured,
  POLAR_SETTINGS_KEYS,
  POLAR_SETTINGS_KEY_NAMES,
  RENAMED_BILLING_KEYS,
  SELLABLE_PLAN_IDS,
} from "../polar";

/**
 * The keys of `companies.settings` this endpoint may write.
 *
 * `settings` is one free-form jsonb column shared by four features, so "write
 * the settings" is not one capability. What actually lives there:
 *
 * | key | read by | written by |
 * |---|---|---|
 * | `plan` | `current-account.ts`, `getBillingInfo` | **`api/webhooks/polar`**, on a paid order |
 * | `polarCustomerId` | `createBillingPortal` | `api/webhooks/polar` |
 * | `polarSubscriptionId` / `…Status` / `polarCurrentPeriodEnd` / `polarProductId` | `getBillingInfo` | `api/webhooks/polar` |
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
/**
 * `country` and `industry` join `tolerances` here: onboarding collects both,
 * an editor may correct either afterwards, and neither gates anything. The
 * trial keys below are the opposite case and are refused by name.
 */
const WRITABLE_SETTINGS_KEYS = ["tolerances", "country", "industry"] as const;

/**
 * Keys that exist in the column and are refused here **by name**, so the error
 * points at the thing that does own them instead of saying "unknown key".
 *
 * A `Map` rather than an object literal: `{}["toString"]` is a function, so an
 * object would treat `{"toString": 1}` as a known key and interpolate a
 * function into the message.
 */
const SETTINGS_OWNED_ELSEWHERE = new Map<string, string>([
  ["plan", "a company's plan is set by the Polar webhook on a paid order, not by this form"],
  /**
   * The five trial keys, refused outright.
   *
   * `trialEndsAt` is the one that matters: the trial is capped at
   * `trialStartedAt + TRIAL_DAYS` by `trialEndOf()` precisely so a stored date
   * cannot stretch it, and letting a form write the date would be handing an
   * admin the other half of that lock. The rest go with it because a trial
   * whose start, completion or email state can be edited is a trial anyone can
   * restart.
   *
   * Three writers only: completing onboarding, the trial-ended email code, and
   * the Polar webhook — all of them through `server/company-settings.ts`.
   */
  ...TRIAL_SETTINGS_KEY_NAMES.map(
    (key): [string, string] => [
      key,
      "the trial is written by onboarding, the trial-ended email and the Polar webhook, not by this form",
    ],
  ),
  ...POLAR_SETTINGS_KEY_NAMES.map(
    (key): [string, string] => [key, "billing state is written by the Polar webhook, not by this form"],
  ),
  /**
   * The three Stripe-shaped names, refused with the name that replaced each.
   *
   * They hold no data in any company — every `companies.settings` was `{}` when
   * the rename landed — so this is a signpost rather than a compatibility
   * shim. Without it a caller that still knows the old name gets the generic
   * "does not write" and has to go and find out why, which is the moment the
   * rename stops being discoverable.
   */
  ...[...RENAMED_BILLING_KEYS].map(
    ([was, now]): [string, string] => [was, `that key is now "${now}", written by the Polar webhook`],
  ),
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
 *
 * Now that `api/webhooks/polar` writes `plan`, the distinction this refusal
 * draws is sharper rather than weaker: the webhook may set it because Polar
 * has confirmed a payment, and a signed-in admin may not because asking for a
 * capability is not paying for it. Two paths to one key, one of them gated on
 * money and the other closed.
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

  /**
   * What the billing page renders.
   *
   * `memberProcedure` rather than `protectedProcedure`, per CLAUDE.md's
   * preference for new code: it resolves the caller in middleware, so the user
   * lookup this procedure used to make itself is gone and `ctx.companyId` is
   * the same value one query cheaper. Still readable by a viewer — a company's
   * own plan is not pay detail.
   *
   * `portalAvailable` is computed here rather than guessed at by the page: the
   * page may only offer a "manage billing" control when there is a real portal
   * behind it, which needs both an access token on this deployment and a Polar
   * customer recorded against this company. Neither is true anywhere today.
   */
  // `billingProcedure`, not `memberProcedure`: the paywall reads this to decide
  // what to offer, so gating it on entitlement would be a lock whose key is
  // behind the lock.
  getBillingInfo: billingProcedure.query(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
    });
    if (!company) throw new TRPCError({ code: "NOT_FOUND" });

    const settings = (company.settings ?? {}) as Record<string, unknown>;
    const customerId = (settings[POLAR_SETTINGS_KEYS.customerId] as string) ?? null;

    /**
     * The entitlement, on the one endpoint the paywall and the trial banner can
     * both reach while the company has no access.
     *
     * **Added here rather than given its own procedure**, because this is
     * already the ungated billing read and both clients already needed it:
     * the paywall polls this after a checkout and must close on `access`
     * turning true, and the banner needs `trialEndsAt` to count the last seven
     * days and to arm its own timer. One procedure means one react-query cache
     * entry shared between them rather than two queries per page view.
     *
     * `trialEndsAt` is an **ISO string, not a `Date`**: this app's tRPC client
     * has no transformer (`app/providers.tsx` uses a bare `httpBatchLink`), so
     * a `Date` would be typed as a Date on the client and actually arrive as a
     * string. The one place that has bitten this repo is recorded in
     * CLAUDE.md's "alias and parse, never cast"; this is the same class of lie.
     */
    const entitlement = entitlementOf(settings as CompanySettings, new Date());

    return {
      subscriptionId: (settings[POLAR_SETTINGS_KEYS.subscriptionId] as string) ?? null,
      status: (settings[POLAR_SETTINGS_KEYS.subscriptionStatus] as string) ?? "inactive",
      plan: (settings.plan as string) ?? "free",
      periodEnd: (settings[POLAR_SETTINGS_KEYS.currentPeriodEnd] as string) ?? null,
      /** Whether `createBillingPortal` can actually produce a URL. */
      portalAvailable: isPolarConfigured() && customerId !== null,
      entitlement: {
        access: entitlement.access,
        reason: entitlement.reason,
        trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
        paymentFailed: entitlement.paymentFailed,
      },
    };
  }),

  /**
   * A real Polar customer-portal session, or nothing at all.
   *
   * **What this replaced.** It returned
   * `https://billing.stripe.com/session/<subscription id>`, assembled by string
   * concatenation, or Stripe's home page when there was no subscription — which
   * was every company, since nothing has ever written a subscription id. That
   * URL has never resolved. It is the same invention as the four paid invoices
   * that were deleted from the billing page, in a procedure instead of in JSX.
   *
   * **Why a session and not a link.** Polar's portal can be reached two ways: a
   * customer asks for a one-time code at `polar.sh/<org>/portal`, or the app
   * creates an authenticated session with `POST /v1/customer-sessions/` and
   * gets back a `customer_portal_url` that opens straight into the right
   * account. Only the second is honest from a screen that already knows who is
   * signed in — and only the second can be produced at all without knowing the
   * organisation slug, which this deployment is not told.
   *
   * **`url` is nullable, and a null is a normal answer**, not an error. No
   * token, no customer, or Polar unreachable all return `{ url: null }` with a
   * reason, and the page keeps the sentence it already had: billing is handled
   * by a person, at an address that works. Throwing would put a red notice on a
   * billing page to say a feature nobody has configured is not configured.
   *
   * **`editorProcedure`, where this used to be `protectedProcedure`.** The
   * portal cancels subscriptions and changes the payment method, so it is a
   * company-wide write by any reading of CLAUDE.md's table, and a viewer should
   * not be able to open one.
   */
  createBillingPortal: billingEditorProcedure
    .input(z.object({ returnUrl: z.string().url().optional() }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { settings: true },
      });
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      if (!isPolarConfigured()) {
        return { url: null, reason: "not_configured" as const };
      }

      const settings = (company.settings ?? {}) as Record<string, unknown>;
      const customerId = settings[POLAR_SETTINGS_KEYS.customerId];
      if (typeof customerId !== "string" || customerId.length === 0) {
        // Nothing has been bought, so Polar holds no customer for this company
        // and there is no portal to open. The previous code answered Stripe's
        // home page here, which is the case this nullable return exists for.
        return { url: null, reason: "no_customer" as const };
      }

      const url = await createCustomerPortalUrl(customerId, input.returnUrl);
      return url === null
        ? { url: null, reason: "unavailable" as const }
        : { url, reason: null };
    }),

  /**
   * The checkout link for each plan that has one.
   *
   * **One link per plan, and only the plans that are configured.** Polar's
   * Checkout Links are per product: the Starter link is Starter, monthly, in
   * EUR, and pointing Growth at it would sell the Starter product at the
   * Starter price under a Growth heading. So each plan reads its own
   * `POLAR_CHECKOUT_LINK_<PLAN>` variable and a plan without one returns null —
   * which is every plan until somebody sets them, and is why this is safe to
   * ship before the pricing question is settled.
   *
   * **This endpoint states no price.** It returns a URL and nothing else. What
   * a plan costs is whatever Polar's checkout says when it opens, and the three
   * figures in this repo's orbit — the €29 the live link charges, the €14
   * founder price the marketing site promises, and "free during the beta" on
   * the billing page — are not reconciled here and must not be assumed by
   * anything downstream of it.
   *
   * `memberProcedure` with the role checked in the body, rather than
   * `editorProcedure`: a viewer opening the billing page should see the plans
   * and a line telling them who can buy, not a FORBIDDEN error where the page
   * should be. `canCheckout` is that distinction, and the links are withheld
   * from a viewer rather than merely hidden by the page.
   *
   * **The URL withholding is the security boundary, and it is server-side.** A
   * viewer receives `url: null` for every plan — not a hidden button over a URL
   * that is in the response anyway — so the paywall and the billing page can
   * both read `canCheckout` to decide what to render rather than re-deriving the
   * role in the browser, and neither can disagree with this. `test/billing-checkout.test.ts`
   * pins the null for every plan with the links configured, which is the only
   * state in which the assertion means anything.
   *
   * **`customer_email` rides on the link.** The buyer's address comes from the
   * middleware's own user row, never from an input: taking it from the client
   * would let a caller pre-fill somebody else's address on a checkout that
   * carries their company's `reference_id`.
   */
  // Ungated for the same reason as `getBillingInfo`: this is the endpoint the
  // paywall's "Continue to payment" button calls, and an expired company is
  // exactly who needs it to work.
  getCheckout: billingProcedure.query(({ ctx }) => {
    const canCheckout = EDITOR_ROLES.includes(
      ctx.currentUser.role as (typeof EDITOR_ROLES)[number],
    );

    const plans = SELLABLE_PLAN_IDS.map((plan) => {
      const link = checkoutLinkForCompany(plan, ctx.companyId, ctx.currentUser.email);
      return { plan, url: canCheckout ? link : null, available: link !== null };
    });

    return {
      canCheckout,
      /**
       * Whether this *deployment* can sell anything, independent of who is
       * asking. Derived from `available` rather than from `url`, which a
       * viewer never receives: computing it from `url` would tell every viewer
       * that billing is unconfigured, and the page would then explain the
       * wrong reason they cannot buy.
       */
      configured: plans.some((entry) => entry.available),
      plans,
    };
  }),
});
