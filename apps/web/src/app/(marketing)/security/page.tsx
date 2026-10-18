import type { Metadata } from "next";
import { LegalPagePlaceholder } from "@/components/marketing/legal-page";
import { SITE } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: `Security | ${SITE.name}`,
  description: "How Clarivo protects the payroll data you upload.",
  alternates: { canonical: `${SITE.url}/security` },
};

export default function SecurityPage() {
  return (
    <LegalPagePlaceholder
      title="Security"
      intro="Where your payroll data is hosted, how it is encrypted and separated between companies, who can reach it, and how deletion works."
    />
  );
}
