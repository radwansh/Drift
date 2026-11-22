"use client";
import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/shared/auth-frame";
import { useIsDark } from "@/components/shared/theme-toggle";
import { getClerkAppearance } from "@/lib/clerk-appearance";

/**
 * /sign-up — Clerk's prebuilt screen, framed and themed to Ink & Signal.
 *
 * **This is where every primary button on the public site now leads.** It used
 * to be reachable only by an approved invitation from the waiting list, because
 * `launch.waitlistMode` sent every "Get early access" button to a lead form
 * instead; the switch is off, the buttons are /sign-up links, and /waitlist is
 * a 308 to this page. Clerk's sign-up mode has to be Public rather than
 * Waitlist in the dashboard for this screen to accept anybody — that half is
 * not in the repository.
 *
 * `forceRedirectUrl="/onboarding"`, and force rather than fallback: a brand-new
 * account has no company, no payroll file and no trial yet, so onboarding is
 * the only screen that can do anything for it. A `redirect_url` left over from
 * whatever the visitor clicked would otherwise win and drop them on a page with
 * nothing in it. Onboarding is where the trial starts: completing it is what
 * writes `trialStartedAt`, which is what `lib/entitlement.ts` reads.
 *
 * Clerk's own screen still handles the bot check and the email code; the custom
 * Registration Form from the sign-up diagram (step 7 of the rename plan) would
 * replace it, and `launch.securityPoints.verifiedSignIn` stays off until it
 * ships. /signup redirects here in middleware.
 */
export default function SignUpPage() {
  const isDark = useIsDark();
  return (
    <AuthFrame
      title="Create your company account"
      lede="Upload two payroll periods and Clarivo shows every change between them: who, which component, and by how much."
    >
      <SignUp
        appearance={getClerkAppearance(isDark)}
        forceRedirectUrl="/onboarding"
        signInUrl="/sign-in"
      />
    </AuthFrame>
  );
}
