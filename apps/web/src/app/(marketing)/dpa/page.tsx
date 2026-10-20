import type { Metadata } from "next";
import { LegalPagePlaceholder } from "@/components/marketing/legal-page";
import { SITE } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: `Data processing agreement | ${SITE.name}`,
  description: "The data processing agreement between Clarivo and your company.",
  alternates: { canonical: `${SITE.url}/dpa` },
};

export default function DpaPage() {
  return (
    <LegalPagePlaceholder
      title="Data processing agreement"
      intro="The agreement covering Clarivo's processing of payroll data on your behalf: the scope, the sub-processors, the security measures and the deletion terms."
    />
  );
}
