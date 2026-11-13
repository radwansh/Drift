import { PRICING, type Currency } from "@/components/marketing/content";
import { parsePlan, type PlanId } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";

/**
 * The published plan ladder, as the in-app billing page needs it.
 *
 * Every figure and every sentence comes from `PRICING` in
 * `components/marketing/content.ts`. Nothing here is retyped: that file's own
 * header comment warns that holding two copies of the same numbers is how a
 * price drifts, and this repo has already done it twice. The billing page used
 * to carry a $99 / $299 / Custom ladder, which is the third time.
 *
 * It lives beside the page rather than in it so it can be tested without
 * rendering a client component — `test/billing-ui.test.ts` asserts that every
 * figure the page shows parses out of `PRICING` and formats with a currency
 * code, and that each rung's id still matches the plan vocabulary.
 */

/**
 * The currency the published ladder is quoted in.
 *
 * `PRICING` stores the numerals once with `¤` and the marketing site
 * substitutes the symbol per market: `/` is EUR, `/us` is USD. The app has no
 * market — one signed-in company, any payroll currency — so it shows the
 * default market's, which is the ladder as it is quoted: 29 and 49.
 *
 * **It is not the company's payroll currency, and nothing is converted.** The
 * ladder is a list price per market rather than an FX conversion, so reading
 * `companies.currencyCode` here would invent a price in a currency Clarivo
 * does not sell in.
 */
export const LIST_CURRENCY: Currency = "EUR";

/**
 * A stored figure as a number: `"¤1,490"` -> `1490`.
 *
 * The strings in `PRICING` carry the placeholder and a thousands separator,
 * because the marketing page renders them with a bare symbol. Every figure in
 * the app goes through `formatCurrency` instead — always `EUR 29.00`, never
 * `€29`, which is CLAUDE.md's rule — so the two screens show the same number
 * in two formats rather than two numbers.
 */
function planAmount(stored: string): number | null {
  const digits = stored.replace(/[^\d.]/g, "");
  if (digits.length === 0) return null;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

/** A `PRICING` figure, formatted the way the app formats money. */
export function planPrice(stored: string, currency: Currency = LIST_CURRENCY): string | null {
  const amount = planAmount(stored);
  return amount === null ? null : formatCurrency(amount, currency);
}

export interface PlanRung {
  /**
   * The plan vocabulary's id for this rung, or `null` when `PRICING` has been
   * renamed to something `lib/plans.ts` does not know. `null` rather than a
   * fallback on purpose: a rung that cannot be identified must fail to match
   * the stored plan instead of marking the wrong card as the current one.
   */
  id: PlanId | null;
  name: string;
  /** `plan.for`: the employee band the plan is sold by. */
  audience: string;
  listPrice: string | null;
  founderPrice: string | null;
  interval: string | null;
  /** Shown in place of a figure, for a plan priced on request. */
  onRequest: string | null;
  footnote: string | null;
  highlighted: boolean;
  tag?: string;
}

/**
 * Starter, Growth and Enterprise.
 *
 * Monthly only. The yearly figures exist in `PRICING` and the marketing page
 * has a toggle for them; a second toggle here would be another place for the
 * billing cycle to be stated while no company has one.
 *
 * Bureau is in `PRICING` and in the plan vocabulary but not on this ladder: it
 * is priced per client company and quoted rather than listed, which is why the
 * marketing page pulled it out of its plan grid as well.
 */
export function pricingLadder(currency: Currency = LIST_CURRENCY): PlanRung[] {
  const plans: PlanRung[] = PRICING.plans.map((plan) => ({
    id: parsePlan(plan.name),
    name: plan.name,
    audience: plan.for,
    listPrice: planPrice(plan.listMonthly, currency),
    founderPrice: planPrice(plan.founderMonthly, currency),
    interval: "per month",
    onRequest: null,
    footnote: PRICING.founderBadge,
    highlighted: plan.highlighted,
    tag: "tag" in plan ? plan.tag : undefined,
  }));

  return [
    ...plans,
    {
      id: parsePlan(PRICING.enterprise.name),
      name: PRICING.enterprise.name,
      audience: PRICING.enterprise.for,
      listPrice: null,
      founderPrice: null,
      interval: null,
      onRequest: PRICING.enterprise.price,
      footnote: PRICING.enterprise.note,
      highlighted: false,
    },
  ];
}

/**
 * What to call the plan a company is recorded on.
 *
 * A recognised id is named from `PRICING`, so the name follows the marketing
 * site. An unrecognised value is printed exactly as it is stored rather than
 * replaced by a guess: if a company's row says something this page has never
 * heard of, that is the fact worth showing.
 */
export function planDisplayName(plan: PlanId | null, stored: string): string {
  if (plan === null) return stored;
  if (plan === "free") return "Free, during the beta";
  const named = [...PRICING.plans, PRICING.enterprise, PRICING.bureau].find(
    (candidate) => candidate.name.toLowerCase() === plan,
  );
  return named?.name ?? stored;
}
