import type { Metadata } from "next";
import { LegalPagePlaceholder } from "@/components/marketing/legal-page";
import { SITE } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: `Privacy policy | ${SITE.name}`,
  description: "How Clarivo handles the payroll data you upload.",
  alternates: { canonical: `${SITE.url}/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalPagePlaceholder
      title="Privacy policy"
      intro="What payroll data Clarivo stores, where it is processed, how long it is kept and how to have it deleted."
    />
  );
}
