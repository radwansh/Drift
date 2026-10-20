import type { Metadata } from "next";
import { EarlyAccessForm } from "@/components/marketing/early-access-form";

/**
 * /waitlist — the early-access form as a page, for anyone who arrives at the
 * URL directly rather than through a button. It is also what `waitlistUrl` on
 * ClerkProvider points at, so Clerk's "Join the waitlist" link lands here
 * instead of on Clerk's hosted page.
 *
 * It renders the same `EarlyAccessForm` as the dialog, so a lead from either
 * surface produces the same trial_requests row, Zoho lead and Clerk waitlist
 * entry. It used to be Clerk's own `<Waitlist />`, which takes an email and
 * nothing else — those leads never reached the CRM.
 *
 * In (marketing) rather than (auth) because that layout supplies the fonts,
 * the header and footer, and the `data-theme="light"` pin the cv- tokens are
 * designed against.
 */
export const metadata: Metadata = {
  title: "Get early access | Clarivo",
  description: "Join the waiting list for the Clarivo closed beta.",
  // Matches robots.ts, which disallows this path: it is a form, not content,
  // and indexing it would compete with the landing page for the same intent.
  robots: { index: false, follow: true },
};

export default function WaitlistPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col px-4 py-16 sm:px-6 lg:py-24">
      <div className="rounded-cv-xl border border-cv-line bg-cv-surface p-8 shadow-cv-md">
        <EarlyAccessForm headingLevel={1} />
      </div>
    </div>
  );
}
