import type { Metadata } from "next";
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
import { FAQ, SITE } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  alternates: { canonical: `${SITE.url}/` },
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

/**
 * Structured data, from the JSON-LD in docs/landing/content.md with the one
 * correction the hand-off README calls for: content.md's logo URL points at
 * /brand/clarivo-logo.svg, which does not exist — the real lockup is
 * clarivo-lockup.svg — so the logo is the 512px app icon instead, as the
 * README specifies.
 *
 * The FAQPage block is generated from the same FAQ array the visible section
 * renders, so the two cannot drift apart. Google stopped showing FAQ rich
 * results in May 2026 but still reads the markup to understand the page.
 */
function structuredData() {
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
      },
      {
        "@type": "SoftwareApplication",
        name: SITE.name,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Payroll dashboard",
        operatingSystem: "Web",
        url: `${SITE.url}/`,
        description:
          "Payroll dashboard that shows every salary KPI in one click and flags payroll anomalies before payday.",
        publisher: { "@id": `${SITE.url}/#org` },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "EUR",
          lowPrice: "0",
          highPrice: "299",
          offerCount: "5",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // The payload is our own typed content, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Alerts />
      <Roles />
      <Security />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
