/**
 * The plan a company is on, in a module with no dependencies.
 *
 * `companies.settings.plan` is a free-form JSON key — `settings.getBillingInfo`
 * reads it and defaults it to `"free"` — so a value arriving from the database
 * is an unknown string until it is checked against this list. That is what
 * `parsePlan` is for: an unrecognised value must read as unrecognised rather
 * than quietly becoming "free", because "free" is also a real answer.
 *
 * Dependency-free, and deliberately holding no prices or plan names, for the
 * same reason `lib/roles.ts` is: it is imported by client components, and the
 * figures belong to `PRICING` in `components/marketing/content.ts` — the one
 * place they are written, so the app and the marketing site cannot drift.
 *
 * **Nothing in the app sets `plan`.** Every company reads `"free"`, and the
 * only way onto another rung today is a direct write to `companies.settings`.
 */

/**
 * `bureau` is a plan the company sells, so it is a value this vocabulary
 * recognises, but it has no card on the billing page: it is priced per client
 * company and quoted rather than listed, which is why the marketing page pulled
 * it out of the plan grid too.
 */
export const PLAN_IDS = ["free", "starter", "growth", "enterprise", "bureau"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/**
 * What a company with nothing recorded is on. The same default
 * `settings.getBillingInfo` applies, stated once.
 */
export const DEFAULT_PLAN: PlanId = "free";

/** A recognised plan id, or `null` for anything else — including `undefined`. */
export function parsePlan(value: unknown): PlanId | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return PLAN_IDS.includes(lowered as PlanId) ? (lowered as PlanId) : null;
}

/**
 * The plan a `companies.settings` value says the company is on.
 *
 * An **absent** key is `DEFAULT_PLAN`, the default `getBillingInfo` applies; a
 * key holding something the vocabulary does not recognise is `null`, so a gate
 * is never told a company is on a plan nobody put it on. Both are "not
 * Enterprise", so both close a capability either way.
 *
 * Lives here, with `parsePlan` and `DEFAULT_PLAN`, because two callers now ask
 * the same question of the same column — `server/current-account.ts` for the
 * sidebar and the page gates, and `routers/integrations.ts` for the router
 * gate. Two copies of "an absent key means free" is the kind of pair that
 * agrees until one of them is edited.
 */
export function planOfSettings(settings: unknown): PlanId | null {
  if (settings === null || typeof settings !== "object") return DEFAULT_PLAN;
  const value = (settings as Record<string, unknown>).plan;
  return value === undefined ? DEFAULT_PLAN : parsePlan(value);
}

/**
 * The plans that include the HR/payroll connectors.
 *
 * Kept as a list rather than an `=== "enterprise"` check so the nav gate, the
 * page gate and the test all read one authority, the way `PAY_DETAIL_ROLES`
 * does for the Employee File — and so adding Growth to it later is one edit
 * rather than three.
 *
 * Deliberately **not** reused for anything else: "may use the connectors" is
 * not "is a large customer", and sharing the constant would make a later
 * change to one silently change the other. That is the same reasoning
 * `lib/roles.ts` gives for keeping `EDITOR_ROLES` and `PAY_DETAIL_ROLES` apart
 * while both read `["admin", "manager"]`.
 */
export const INTEGRATION_PLANS = ["enterprise"] as const satisfies readonly PlanId[];

/**
 * Whether a plan includes the connectors.
 *
 * An unresolved plan — `null` from a failed lookup, or `undefined` — is
 * **false**, the least privileged answer: a lookup failure must close the
 * capability rather than open it.
 */
export function hasIntegrations(plan: PlanId | null | undefined): boolean {
  if (!plan) return false;
  return (INTEGRATION_PLANS as readonly PlanId[]).includes(plan);
}
