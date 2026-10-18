import type { Metadata } from "next";
import { LegalPagePlaceholder } from "@/components/marketing/legal-page";
import { SITE } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: `Terms | ${SITE.name}`,
  description: "The terms on which Clarivo is provided during the beta and afterwards.",
  alternates: { canonical: `${SITE.url}/terms` },
};

export default function TermsPage() {
  return (
    <LegalPagePlaceholder
      title="Terms"
      intro="The terms of service for Clarivo, including the beta period, the founder pricing commitment and the limits of the service."
    />
  );
}
