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
