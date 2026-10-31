import type { Metadata } from "next";
import { Landing, HREFLANG, structuredData } from "@/components/marketing/landing";
import { SITE } from "@/components/marketing/content";

/**
 * The dollar page: `/us/`.
 *
 * Identical to `/` in every word except the currency symbol, because the only
 * thing that genuinely differs between the two markets today is the price
 * ladder — $59/$99/$299 against €59/€99/€299, list prices per market rather
 * than conversions of one another.
 *
 * **The "Hosted in the EU" security point renders here too.** It is not a
 * benefit statement withheld from buyers it does not flatter: a customer's
 * payroll data is stored and processed in Frankfurt whoever they are, and an
 * American or Australian company needs that fact to meet its own cross-border
 * obligations. Hiding where the data goes from the people whose data it is
 * would also be the one pattern this repo's launch switches exist to prevent —
 * a claim that appears or disappears by audience.
 *
 * A subfolder, not a subdomain or a ccTLD: a subfolder inherits the main
 * site's internal links and authority, where `clarivo-app.us` would start a
 * second authority profile from zero for one brand.
 *
 * No locale prefix (`/en-us/`): there is only one language on the site, so a
 * language segment would be noise.
 *
 * It carries its own canonical and the same full `HREFLANG` mesh, self-
 * referencing included. There is no geo-redirect from `/` and there must not
 * be one — if a banner is ever added, it offers the other page and never
 * navigates for the visitor.
 */
export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  alternates: {
    canonical: `${SITE.url}/us/`,
    languages: HREFLANG,
  },
  openGraph: {
    type: "website",
    url: `${SITE.url}/us/`,
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

export default function UsLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData("USD", "/us/")) }}
      />
      <Landing currency="USD" />
    </>
  );
}
