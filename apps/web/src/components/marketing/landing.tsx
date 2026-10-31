import { Hero } from "@/components/marketing/sections/hero";
import { Problem } from "@/components/marketing/sections/problem";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { Features } from "@/components/marketing/sections/features";
import { Alerts } from "@/components/marketing/sections/alerts";
import { Roles } from "@/components/marketing/sections/roles";
import { Security } from "@/components/marketing/sections/security";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Faq } from "@/components/marketing/sections/faq";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { FAQ, SITE, money, type Currency } from "@/components/marketing/content";

/**
 * The landing page body, shared by `/` (euro) and `/us/` (dollars).
 *
 * One component rather than two pages so the two markets cannot drift in
 * anything except the currency. Everything that differs between them is
 * derived from `currency`: the four money-bearing sections and the
 * `priceCurrency` in the structured data. Nothing else is market-specific —
 * notably **the "Hosted in the EU" security point renders on both**, because
 * it states where a customer's payroll data physically goes, which is a
 * material fact for an Australian or American buyer evaluating their own
 * cross-border obligations rather than a selling point to be shown or hidden
 * by audience.
 *
 * `Alerts` needs it too, and did not look like it did: its sample card renders
 * money through the `Variance` component, which takes a number and an ISO
 * currency code rather than one of the `¤` strings — so a search for the
 * placeholder found nothing there. It was hardcoded `currency="EUR"` and
 * printed `+€1,240` on the dollar page until the rendered output was read.
 */
export function Landing({ currency }: { currency: Currency }) {
  return (
    <>
      <Hero currency={currency} />
      <Problem />
      <HowItWorks />
      <Features currency={currency} />
      <Alerts currency={currency} />
      <Roles />
      <Security />
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
 * the dollar page.
 *
 * Australia and New Zealand are deliberately absent. They are target markets,
 * but a page annotated `en-AU` that differs from `/us/` in nothing at all is a
 * near-duplicate, and the honest answer for an Australian buyer is a page in
 * Australian dollars. Add `en-AU` and `en-NZ` here, and to the sitemap, when
 * AUD and NZD list prices exist — not before.
 */
export const HREFLANG: Record<string, string> = {
  en: `${SITE.url}/`,
  "en-US": `${SITE.url}/us/`,
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
 * The FAQPage block is generated from the same FAQ array the visible section
 * renders, through the same `money()` call, so the markup and the page cannot
 * disagree about a price. Google stopped showing FAQ rich results in May 2026
 * but still reads the markup to understand the page.
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
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: currency,
          lowPrice: "0",
          highPrice: "299",
          offerCount: "5",
        },
      },
      {
        "@type": "FAQPage",
        inLanguage: "en",
        mainEntity: FAQ.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: money(item.a, currency) },
        })),
      },
    ],
  };
}
