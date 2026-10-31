import type { Metadata } from "next";
import { Landing, HREFLANG, structuredData } from "@/components/marketing/landing";
import { SITE } from "@/components/marketing/content";

/**
 * The euro page, and the canonical home of the site.
 *
 * `/` keeps the euro prices, the accumulated authority, the Search Console
 * verification and `x-default`. `/us/` is the dollar page. The two are
 * separate URLs rather than one URL serving by visitor IP: Googlebot crawls
 * predominantly from US addresses, so IP-switching would mean only the dollar
 * version is ever indexed, and it breaks the hreflang mesh.
 *
 * Malta is the one euro-area market in the first campaign; the United States,
 * Australia and New Zealand are not. Australia and New Zealand currently fall
 * back here through `x-default` rather than to `/us/`, because dollars are not
 * their currency either and `x-default` is the honest answer until AUD and NZD
 * prices exist. See `HREFLANG` in `components/marketing/landing.tsx`.
 */
export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  alternates: {
    canonical: `${SITE.url}/`,
    languages: HREFLANG,
  },
  openGraph: {
    type: "website",
    url: `${SITE.url}/`,
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

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // The payload is our own typed content, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData("EUR", "/")) }}
      />
      <Landing currency="EUR" />
    </>
  );
}
