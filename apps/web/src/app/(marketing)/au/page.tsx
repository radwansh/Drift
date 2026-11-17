import type { Metadata } from "next";
import { Landing, HREFLANG, structuredData } from "@/components/marketing/landing";
import { SITE, market } from "@/components/marketing/content";

/**
 * The Australian page: `/au`.
 *
 * Built on `/us`, and deliberately more than a copy of it with A$ in front of
 * the same numerals. `/us` could be exactly that, because a dollar price and a
 * euro price were the only thing that genuinely differed between those two
 * markets. Australia differs in five more places, each held in
 * `MARKETS.AUD` in `components/marketing/content.ts`:
 *
 * - the ladder is A$49 and A$79, which are different numerals and not a
 *   conversion of anything;
 * - the tax in the small print is GST, since Australia levies no VAT;
 * - the cadence is fortnightly, in the copy only — the app's own cadence names
 *   are one vocabulary for every customer and are untouched;
 * - the register is exported from Xero, MYOB or Employment Hero, named as
 *   sources of a file and nothing more: Clarivo connects to none of them,
 *   is a partner of none of them, and says so;
 * - the payroll-error statistics on `/` are EY's survey of US companies, so
 *   they are replaced with the Fair Work Ombudsman's Australian figures rather
 *   than reused under an Australian heading.
 *
 * It also carries a section the other two do not: superannuation under Payday
 * Super, in force since 1 July 2026, with what Clarivo does and does not do
 * about it stated in the same breath.
 *
 * **"Hosted in the EU" renders here too**, as it does on `/us`. Payroll data
 * is stored and processed in Frankfurt whoever the customer is, and hiding
 * where the data goes from the people whose data it is would be the one
 * pattern this repo's launch switches exist to prevent. An Australian reader
 * gets one extra sentence of context rather than one fewer fact.
 *
 * A subfolder, not a subdomain or a ccTLD: a subfolder inherits the main
 * site's internal links and authority, where `clarivo-app.com.au` would start
 * a second authority profile from zero for one brand.
 *
 * No locale prefix (`/en-au/`): there is only one language on the site, so a
 * language segment would be noise.
 *
 * It carries its own canonical and the same full `HREFLANG` mesh, self-
 * referencing included. There is no geo-redirect from `/` and there must not
 * be one — if a banner is ever added, it offers the other page and never
 * navigates for the visitor.
 */
const AU = market("AUD");

export const metadata: Metadata = {
  // Australia's own title and description. `/us` shares the home page's,
  // which was right while it shared every word of the page; this page does
  // not, and a result in an Australian SERP should say so before the click.
  title: AU.meta?.title ?? SITE.title,
  description: AU.meta?.description ?? SITE.description,
  alternates: {
    // `/au`, not `/au/`: the server 308s the slashed form to this one, and a
    // canonical that redirects tells Google the preferred address is somewhere
    // it cannot index. `/us` was reported as a redirect error for exactly that
    // reason, which is the whole reason this comment is here.
    canonical: `${SITE.url}/au`,
    languages: HREFLANG,
  },
  openGraph: {
    type: "website",
    url: `${SITE.url}/au`,
    siteName: SITE.name,
    title: SITE.socialTitle,
    description: SITE.socialDescription,
    images: [
      { url: `${SITE.url}/brand/clarivo-social.png`, width: 1200, height: 630, alt: SITE.socialImageAlt },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.socialTitle,
    description: SITE.socialDescription,
    images: [`${SITE.url}/brand/clarivo-social.png`],
  },
};

export default function AuLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // The payload is our own typed content, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData("AUD", "/au")) }}
      />
      <Landing currency="AUD" />
    </>
  );
}
