import { Hero } from "@/components/marketing/sections/hero";
import { Problem } from "@/components/marketing/sections/problem";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { Features } from "@/components/marketing/sections/features";
import { Alerts } from "@/components/marketing/sections/alerts";
import { MarketNote } from "@/components/marketing/sections/market-note";
import { Roles } from "@/components/marketing/sections/roles";
import { Security } from "@/components/marketing/sections/security";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Faq } from "@/components/marketing/sections/faq";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import {
  PRICING,
  SITE,
  highestMonthlyListPrice,
  marketFaq,
  money,
  type Currency,
} from "@/components/marketing/content";

/**
 * The landing page body, shared by `/` (euro), `/us` (dollars) and `/au`
 * (Australian dollars).
 *
 * One component rather than three pages so the markets cannot drift in
 * anything nobody decided to change. Everything market-specific is derived
 * from `currency`, and every section now takes it: the money-bearing four, the
 * two that name a pay cadence or a payroll system, the problem figures, the
 * security note, and the one optional section a market may add. What a market
 * does not override it inherits, which is the only reason three pages can
 * carry one argument.
 *
 * **The "Hosted in the EU" security point renders on all three**, because it
 * states where a customer's payroll data physically goes, which is a material
 * fact for an Australian or American buyer evaluating their own cross-border
 * obligations rather than a selling point to be shown or hidden by audience.
 * `/au` adds a sentence of context under it instead of removing it.
 *
 * `Alerts` needs the currency too, and did not look like it did: its sample
 * card renders money through the `Variance` component, which takes a number
 * and an ISO currency code rather than one of the `¤` strings — so a search
 * for the placeholder found nothing there. It was hardcoded `currency="EUR"`
 * and printed `+€1,240` on the dollar page until the rendered output was read.
 * `Intl` renders AUD as `A$1,240` in this locale and USD as `US$1,240`, so the
 * two dollar pages stay distinguishable there as well as in the price table.
 */
export function Landing({ currency }: { currency: Currency }) {
  return (
    <>
      <Hero currency={currency} />
      <Problem currency={currency} />
      <HowItWorks currency={currency} />
      <Features currency={currency} />
      <Alerts currency={currency} />
      <MarketNote currency={currency} />
      <Roles />
      <Security currency={currency} />
      <Pricing currency={currency} />
      <Faq currency={currency} />
      <FinalCta />
    </>
  );
}

/**
 * The hreflang mesh, identical on every page in it.
 *
 * Every member names every other member **and itself**. Google drops a set
 * with missing return tags entirely, so a one-way addition is worse than no
 * hreflang at all — which is why this is one exported constant rather than a
 * literal written out per route.
 *
 * `en` is the generic English page and `x-default` the fallback for regions
 * with no version of their own; both point at `/`, the euro page, which holds
 * the accumulated authority and the Search Console verification. `en-US` is
 * the dollar page and `en-AU` the Australian one.
 *
 * `en-AU` was deliberately absent until there was something behind it. The
 * rule it waited on still stands for New Zealand: a page annotated `en-NZ`
 * that differs from `/us` in nothing at all is a near-duplicate competing with
 * its own siblings, so add `en-NZ` here, and to the sitemap, when a New
 * Zealand page exists with NZD list prices and copy that is actually about New
 * Zealand — not before.
 */
/**
 * No trailing slash on `/us` or `/au`. `next.config.ts` leaves `trailingSlash`
 * at its default of `false`, so the server answers `/us/` with a 308 to `/us` —
 * and an hreflang annotation naming a URL that redirects is not a valid
 * annotation. Google needs the final address here, as do the canonicals in
 * `us/page.tsx` and `au/page.tsx`. The home page's `/` is the site root and is
 * served as-is, which is why it keeps its slash.
 */
export const HREFLANG: Record<string, string> = {
  en: `${SITE.url}/`,
  "en-US": `${SITE.url}/us`,
  "en-AU": `${SITE.url}/au`,
  "x-default": `${SITE.url}/`,
};

/**
 * Structured data for one market.
 *
 * From the JSON-LD in docs/landing/content.md with the one correction the
 * hand-off README calls for: content.md's logo URL points at
 * /brand/clarivo-logo.svg, which does not exist — the real lockup is
 * clarivo-lockup.svg — so the logo is the 512px app icon instead.
 *
 * The FAQPage block is generated from the same `marketFaq()` list the visible
 * section renders, through the same `money()` call, so the markup and the page
 * cannot disagree about a price or about which questions a market asks. Google
 * stopped showing FAQ rich results in May 2026 but still reads the markup to
 * understand the page.
 */
export function structuredData(currency: Currency, path: string) {
  const url = `${SITE.url}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: `${SITE.url}/`,
        logo: `${SITE.url}/brand/clarivo-app-icon-512.png`,
        email: SITE.email,
        // Entity disambiguation. In four markets with no brand awareness there
        // is otherwise no way for an engine to reconcile "Clarivo" with any
        // other mention of it. Deliberately no `areaServed`: naming the four
        // countries would imply a statutory fit the classifier cannot yet back.
        sameAs: ["https://www.linkedin.com/company/clarivo-app"],
      },
      {
        "@type": "SoftwareApplication",
        name: SITE.name,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Payroll dashboard",
        operatingSystem: "Web",
        // SoftwareApplication and FAQPage are both CreativeWork subtypes, so
        // `inLanguage` is valid on them; Organization is not a CreativeWork,
        // which is why it carries none.
        inLanguage: "en",
        url,
        description:
          "Payroll dashboard that shows every salary KPI in one click and flags payroll anomalies before payday.",
        publisher: { "@id": `${SITE.url}/#org` },
        /**
         * Monthly list prices, in this market's currency.
         *
         * `highPrice` used to be a hardcoded `299`, which was the monthly list
         * price of a Business plan that stopped existing when the ladder was
         * rewritten to two plans — so every page has been declaring a price no
         * plan has, and `/au` would have declared an Australian one that never
         * existed at all. `offerCount` was stale for the same reason: it is
         * the two carded plans plus Enterprise and Bureau, both quoted rather
         * than listed, and counting them here is how it stays right the next
         * time a plan is added or dropped.
         */
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: currency,
          lowPrice: "0",
          highPrice: highestMonthlyListPrice(currency),
          offerCount: String(PRICING.plans.length + 2),
        },
      },
      {
        "@type": "FAQPage",
        inLanguage: "en",
        mainEntity: marketFaq(currency).map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: money(item.a, currency) },
        })),
      },
    ],
  };
}
