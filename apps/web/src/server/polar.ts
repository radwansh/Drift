import { PLAN_IDS, type PlanId } from "@/lib/plans";

/**
 * Polar — the billing provider — read from the environment, and absent from the
 * product entirely when the environment does not carry it.
 *
 * There was never a Stripe integration to replace. "Stripe" in this repo was
 * three key names in `companies.settings`, a `getBillingInfo` that read them,
 * and a `createBillingPortal` that **concatenated a URL that does not exist**
 * (`https://billing.stripe.com/session/<subscription id>`, or Stripe's home
 * page when there was no subscription, which was every company). No SDK, no
 * `STRIPE_*` key read anywhere, no webhook. So this is the first billing
 * integration the product has had, not a swap.
 *
 * **Everything here degrades.** `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET`
 * are unset in CI, in a fresh checkout and in every environment that has not
 * deliberately configured billing. Per CLAUDE.md's "Optional services degrade,
 * never break", a missing key disables the feature and says so: no throw at
 * import, no failed build, no screen that half-works. The shape is the one
 * `server/rate-limit.ts` and `packages/db/src/client.ts` already use — a
 * predicate the callers ask, and a null return rather than an exception.
 *
 * **Nothing in this module invents a URL.** That is the specific failure it
 * exists to not repeat: a link on a billing screen either came from Polar or is
 * not rendered.
 */

/** Polar's two API hosts. Sandbox needs its own token; a production one is refused there. */
const PRODUCTION_API = "https://api.polar.sh";
const SANDBOX_API = "https://sandbox-api.polar.sh";

/**
 * The `companies.settings` keys that hold billing state, named once.
 *
 * These replace `stripeSubscriptionId`, `stripeSubscriptionStatus` and
 * `subscriptionPeriodEnd`. Nothing migrates them, because nothing ever wrote
 * them: checked against the database before the rename, every company's
 * `settings` was `{}` — no `plan`, no billing key, no key of any kind. The old
 * names are still refused **by name** in `routers/settings.ts`, so a caller
 * that knows them is told what they became rather than meeting a generic
 * "unknown key".
 *
 * `polarCurrentPeriodEnd` rather than keeping `subscriptionPeriodEnd`: it holds
 * Polar's `current_period_end` verbatim, and a name that matches the field it
 * came from is one less thing to check when a figure looks wrong.
 *
 * One object rather than five string literals because three unrelated places
 * spell them — the webhook that writes them, `getBillingInfo` that reads them,
 * and the allow-list that refuses them — and a typo in any one of the three is
 * silent: a misspelt key reads as `undefined`, which is also what "not set"
 * looks like.
 */
export const POLAR_SETTINGS_KEYS = {
  customerId: "polarCustomerId",
  subscriptionId: "polarSubscriptionId",
  subscriptionStatus: "polarSubscriptionStatus",
  currentPeriodEnd: "polarCurrentPeriodEnd",
  productId: "polarProductId",
} as const;

/** The same five, as a list, for the places that need to name them all. */
export const POLAR_SETTINGS_KEY_NAMES = Object.values(POLAR_SETTINGS_KEYS);

/**
 * What the three Stripe-shaped keys were called, and what each is now.
 *
 * Kept so the settings form's refusal can name the replacement. They hold no
 * data anywhere — see `POLAR_SETTINGS_KEYS` — so this is a signpost, not a
 * compatibility layer, and nothing reads these names from the column.
 */
export const RENAMED_BILLING_KEYS: ReadonlyMap<string, string> = new Map([
  ["stripeSubscriptionId", POLAR_SETTINGS_KEYS.subscriptionId],
  ["stripeSubscriptionStatus", POLAR_SETTINGS_KEYS.subscriptionStatus],
  ["subscriptionPeriodEnd", POLAR_SETTINGS_KEYS.currentPeriodEnd],
]);

/**
 * A trimmed environment variable, or null for unset-or-blank.
 *
 * Blank counts as unset on purpose: a Vercel environment variable created and
 * left empty is the common way one of these arrives, and `""` passed to the API
 * as a bearer token produces a 401 at the worst moment rather than a clean
 * "not configured" at the first.
 */
function env(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function polarAccessToken(): string | null {
  return env("POLAR_ACCESS_TOKEN");
}

export function polarWebhookSecret(): string | null {
  return env("POLAR_WEBHOOK_SECRET");
}

/** `https://sandbox-api.polar.sh` when `POLAR_SERVER=sandbox`, production otherwise. */
export function polarApiBase(): string {
  return env("POLAR_SERVER")?.toLowerCase() === "sandbox" ? SANDBOX_API : PRODUCTION_API;
}

/** Whether the app can call Polar's API at all. */
export function isPolarConfigured(): boolean {
  return polarAccessToken() !== null;
}

/** Whether the webhook can verify a delivery. Separate from the token: the two are set independently. */
export function isPolarWebhookConfigured(): boolean {
  return polarWebhookSecret() !== null;
}

/**
 * The plans that can be bought. `free` is what a company is on before it buys
 * anything, so it has no product and no checkout link.
 */
export const SELLABLE_PLAN_IDS = PLAN_IDS.filter((id) => id !== "free");

/** `starter` -> `STARTER`, the suffix of this plan's two environment variables. */
function envSuffix(plan: PlanId): string {
  return plan.toUpperCase();
}

/**
 * A checkout link for `plan`, or null.
 *
 * **Per plan, never one link for all of them.** The Starter link Polar issues
 * is Starter, monthly, in EUR; pointing Growth at it would charge a Growth
 * customer the Starter price for the Starter product. So each plan reads its
 * own variable and a plan without one simply has no checkout — which is the
 * state every plan is in until someone sets them.
 *
 * The URL is validated rather than trusted. A Checkout Link is a long-lived
 * `https://buy.polar.sh/polar_cl_…`; anything that is not https on a polar.sh
 * host is dropped with a warning instead of rendered, because the one thing a
 * billing page must never do is link somewhere that does not resolve.
 */
export function polarCheckoutLink(plan: PlanId): string | null {
  const raw = env(`POLAR_CHECKOUT_LINK_${envSuffix(plan)}`);
  if (raw === null) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.warn(`[polar] POLAR_CHECKOUT_LINK_${envSuffix(plan)} is not a URL; ignoring it.`);
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const onPolar = host === "polar.sh" || host.endsWith(".polar.sh");
  if (parsed.protocol !== "https:" || !onPolar) {
    console.warn(
      `[polar] POLAR_CHECKOUT_LINK_${envSuffix(plan)} is not an https polar.sh URL; ignoring it.`,
    );
    return null;
  }
  return parsed.toString();
}

/**
 * The Polar product id backing `plan`, or null.
 *
 * The webhook needs the reverse of this map: an order names a product, and the
 * plan to record is whichever plan that product was configured as. Without it
 * the webhook records the subscription but leaves `plan` alone, rather than
 * guessing which rung was bought.
 */
export function polarProductId(plan: PlanId): string | null {
  return env(`POLAR_PRODUCT_ID_${envSuffix(plan)}`);
}

/**
 * The plan a Polar product id was configured as, or null for one this
 * deployment does not know.
 *
 * Null is not a failure to handle away: an unrecognised product means the
 * webhook writes the subscription state and leaves `plan` untouched. Guessing
 * would hand a company a capability it did not buy.
 */
export function planForPolarProduct(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  for (const plan of SELLABLE_PLAN_IDS) {
    if (polarProductId(plan) === productId) return plan;
  }
  return null;
}

/**
 * A checkout link with this company's id attached as `reference_id`.
 *
 * `reference_id` is Polar's own query parameter: it is copied into the checkout
 * session's metadata and travels on to the resulting order and subscription, so
 * it is what lets the webhook map a payment back to a row in this database
 * without trusting an email address to be unique.
 *
 * Polar's guidance is to link to the Checkout Link itself rather than to a
 * generated session URL, because sessions are short-lived and the link mints a
 * fresh one per visit. That is what this returns.
 */
export function checkoutLinkForCompany(plan: PlanId, companyId: string): string | null {
  const link = polarCheckoutLink(plan);
  if (link === null) return null;
  const url = new URL(link);
  url.searchParams.set("reference_id", companyId);
  return url.toString();
}

/**
 * A customer-portal URL for `customerId`, or null when one cannot be obtained.
 *
 * This replaces the string concatenation that stood here. Polar's portal is
 * reached either by the customer asking for a one-time code at
 * `polar.sh/<org>/portal`, or through an authenticated session created by
 * `POST /v1/customer-sessions/`, which answers a `customer_portal_url` the
 * customer can open directly. Only the second is honest from inside an app that
 * already knows who the caller is, so that is the one called — and only when
 * there is a stored customer id to call it with.
 *
 * Returns null, never a guess, in every failure: no token, no customer, Polar
 * unreachable, or a response without a URL in it. The caller renders nothing
 * rather than a dead link.
 */
export async function createCustomerPortalUrl(
  customerId: string,
  returnUrl?: string,
): Promise<string | null> {
  const token = polarAccessToken();
  if (token === null) return null;

  try {
    const response = await fetch(`${polarApiBase()}/v1/customer-sessions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        returnUrl ? { customer_id: customerId, return_url: returnUrl } : { customer_id: customerId },
      ),
      // Polar's own guidance for webhook handlers is to answer within seconds;
      // the same impatience belongs on a click that is waiting on a redirect.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[polar] customer session failed: ${response.status}`);
      return null;
    }

    const body: unknown = await response.json();
    const url = (body as { customer_portal_url?: unknown })?.customer_portal_url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch (err) {
    // A billing page that cannot reach Polar shows no button. It does not show
    // a broken one, and it does not fail the page it sits on.
    console.error("[polar] customer session request failed:", err);
    return null;
  }
}
