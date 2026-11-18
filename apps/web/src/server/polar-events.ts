import { z } from "zod";
import { eq } from "drizzle-orm";
import { companies, type DbClient } from "@saas/db";
import { mergeCompanySettings } from "./company-settings";
import { planForPolarProduct, POLAR_SETTINGS_KEYS } from "./polar";
import { DEFAULT_PLAN, type PlanId } from "@/lib/plans";

/**
 * Turning a Polar webhook event into the patch to merge into
 * `companies.settings`.
 *
 * Pure, and separate from `api/webhooks/polar/route.ts`, for the reason every
 * other piece of domain logic in this repo is separate from its transport: the
 * interesting cases here are "which company is this", "which plan is this" and
 * "does this event end access", and none of them should need an HTTP request to
 * exercise. `test/polar-webhook.test.ts` drives this directly.
 *
 * **It never guesses.** An event whose product this deployment has not been
 * told about records the subscription state and leaves `plan` alone; an event
 * carrying no company reference is ignored rather than applied to somebody. A
 * webhook is the one path that can grant a paid capability, so the failure mode
 * has to be "nothing happened", not "something plausible happened".
 */

/** The `companies.settings` keys this webhook owns, in one place. */
export const BILLING_KEYS = POLAR_SETTINGS_KEYS;

/**
 * Events that mean the company no longer has what it paid for.
 *
 * `subscription.revoked` is Polar's end-of-access signal — under end-of-period
 * cancellation it arrives when the period actually ends, after
 * `subscription.canceled`. `subscription.paused` revokes benefits too, until
 * the subscription resumes.
 *
 * `subscription.canceled` is deliberately **not** here: it means a cancellation
 * was *requested*, and the subscription stays active with
 * `cancel_at_period_end` set until the period runs out. Downgrading on it would
 * take a paying customer's features away early.
 */
const ACCESS_ENDING_EVENTS = new Set(["subscription.revoked", "subscription.paused"]);

/** Events that carry a subscription object and keep the stored state in step. */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.uncanceled",
  "subscription.cycled",
  "subscription.past_due",
  "subscription.canceled",
  "subscription.revoked",
  "subscription.paused",
  "subscription.resumed",
  "subscription.migrated",
]);

/** The event this app acts on when money actually moves. */
const ORDER_PAID = "order.paid";

/**
 * Loose on purpose. Polar sends many more fields than these and adds more over
 * time; a strict schema would reject a delivery for carrying something new,
 * which turns an additive change at the vendor into an outage here.
 */
const metadataSchema = z.record(z.string(), z.unknown()).nullish();

const subscriptionSchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  current_period_end: z.string().nullish(),
  customer_id: z.string().nullish(),
  product_id: z.string().nullish(),
  metadata: metadataSchema,
});

const eventDataSchema = z.object({
  id: z.string().nullish(),
  status: z.string().nullish(),
  customer_id: z.string().nullish(),
  product_id: z.string().nullish(),
  subscription_id: z.string().nullish(),
  current_period_end: z.string().nullish(),
  metadata: metadataSchema,
  subscription: subscriptionSchema.nullish(),
  customer: z.object({ external_id: z.string().nullish() }).nullish(),
});

export const polarEventSchema = z.object({
  type: z.string(),
  data: eventDataSchema,
});

export type PolarEvent = z.infer<typeof polarEventSchema>;

export type PolarEventOutcome =
  | {
      kind: "apply";
      companyId: string;
      patch: Record<string, unknown>;
      /** The plan this event sets, or null when it leaves `plan` alone. */
      plan: PlanId | null;
    }
  | { kind: "ignored"; reason: string };

/** Companies are keyed on a uuid; anything else in `reference_id` is not one of ours. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringAt(source: unknown, key: string): string | null {
  if (source === null || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Which company this event belongs to.
 *
 * `reference_id` is the query parameter `checkoutLinkForCompany` appends to the
 * checkout link; Polar copies it into the checkout session's metadata and from
 * there onto the order and the subscription. `company_id` is accepted beside it
 * so a link configured by hand in Polar's dashboard, with metadata set there,
 * works without anybody having to know which of the two names was chosen.
 *
 * The customer's `external_id` is the last resort, for a customer created
 * through Polar's API with this company's id attached.
 *
 * Validated as a uuid before it is used: the value is attacker-influenced in
 * principle — anyone can append a `reference_id` to a public checkout link —
 * and while every query is parameterised, a non-uuid reaches Postgres as a type
 * error rather than as a miss.
 */
function companyIdOf(event: PolarEvent): string | null {
  const { data } = event;
  const candidates = [
    stringAt(data.metadata, "reference_id"),
    stringAt(data.metadata, "company_id"),
    stringAt(data.subscription?.metadata, "reference_id"),
    stringAt(data.subscription?.metadata, "company_id"),
    data.customer?.external_id ?? null,
  ];
  for (const candidate of candidates) {
    if (candidate && UUID.test(candidate)) return candidate;
  }
  return null;
}

/**
 * What to write for `event`, or why nothing is written.
 *
 * The patch is always a flat object of `companies.settings` keys, merged in one
 * statement by the caller. Keys this event knows nothing about are omitted
 * rather than written as null, so a subscription update cannot blank the
 * customer id an earlier order recorded.
 */
export function settingsPatchForEvent(event: PolarEvent): PolarEventOutcome {
  const { type, data } = event;

  const relevant = type === ORDER_PAID || SUBSCRIPTION_EVENTS.has(type);
  if (!relevant) return { kind: "ignored", reason: `event type ${type} is not acted on` };

  const companyId = companyIdOf(event);
  if (companyId === null) {
    return {
      kind: "ignored",
      reason: `${type} carries no reference_id, company_id or customer external_id`,
    };
  }

  // On `order.paid` the subscription travels nested; on a `subscription.*`
  // event the subscription IS the payload. Reading both the same way keeps one
  // set of key names rather than a branch per event family.
  const subscription = data.subscription ?? null;
  const subscriptionId = subscription?.id ?? data.subscription_id ?? (isSubscriptionEvent(type) ? data.id : null);
  const status = subscription?.status ?? (isSubscriptionEvent(type) ? data.status : null);
  const periodEnd = subscription?.current_period_end ?? data.current_period_end ?? null;
  const customerId = subscription?.customer_id ?? data.customer_id ?? null;
  const productId = subscription?.product_id ?? data.product_id ?? null;

  const patch: Record<string, unknown> = {};
  if (customerId) patch[BILLING_KEYS.customerId] = customerId;
  if (productId) patch[BILLING_KEYS.productId] = productId;
  if (subscriptionId) patch[BILLING_KEYS.subscriptionId] = subscriptionId;
  if (status) patch[BILLING_KEYS.subscriptionStatus] = status;
  if (periodEnd) patch[BILLING_KEYS.currentPeriodEnd] = periodEnd;

  // Access ending wins over whatever the product says: the company keeps its
  // subscription record, and goes back to the plan every company starts on.
  if (ACCESS_ENDING_EVENTS.has(type)) {
    patch.plan = DEFAULT_PLAN;
    return { kind: "apply", companyId, patch, plan: DEFAULT_PLAN };
  }

  const plan = planForPolarProduct(productId);
  if (plan !== null) patch.plan = plan;

  if (Object.keys(patch).length === 0) {
    return { kind: "ignored", reason: `${type} carried nothing to record` };
  }
  return { kind: "apply", companyId, patch, plan };
}

function isSubscriptionEvent(type: string): boolean {
  return SUBSCRIPTION_EVENTS.has(type);
}

/**
 * Merges a patch into one company's `companies.settings`, **in one statement**.
 *
 * Lives here rather than inline in `api/webhooks/polar/route.ts` so that the
 * write itself can be driven against PGlite: `requireDb()` reads
 * `DATABASE_URL`, so a route handler calling it cannot be handed a test
 * database, and the statement that grants a paid capability is the last one
 * that should go untested.
 *
 * It uses `mergeCompanySettings` for the reason CLAUDE.md gives and
 * `test/company-settings-atomic.test.ts` enforces: `companies.settings` is one
 * jsonb column shared by five features, and a read-modify-write of it loses a
 * concurrent write to a **different** key — the fiscal start month, the
 * connectors — rather than to its own. This webhook is now the sixth writer of
 * that column and it writes like the other five.
 *
 * Returns whether a row matched. A `reference_id` naming no company updates
 * nothing and creates nothing.
 */
export async function applyPolarSettingsPatch(
  db: Pick<DbClient, "update">,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const updated = await db
    .update(companies)
    .set({ settings: mergeCompanySettings(patch), updatedAt: new Date() })
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id });
  return updated.length > 0;
}
