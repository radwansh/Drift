"use client";
import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/shared/auth-frame";
import { useIsDark } from "@/components/shared/theme-toggle";
import { getClerkAppearance } from "@/lib/clerk-appearance";

/**
 * /sign-in — Clerk's prebuilt screen, framed and themed to Ink & Signal.
 *
 * The canonical sign-in path from here on. /login redirects to it in
 * middleware, so existing links and bookmarks keep working.
 *
 * ## Signing in must never create an account
 *
 * Two props do that, and both have to be here rather than on ClerkProvider,
 * because they are decisions about *this screen*: the same instance's /sign-up
 * is supposed to create accounts.
 *
 * **`transferable={false}`.** This is the one that matters, and the behaviour it
 * turns off is not obvious from the outside. When somebody picks "Continue with
 * Google" on a sign-in screen and that Google identity matches no user, Clerk's
 * API does not fail the attempt — it answers with
 * `firstFactorVerification.status === "transferable"`, meaning "this sign-in
 * could be turned into a sign-up". Clerk's prebuilt UI then does exactly that
 * by default: it calls `signUp.create({ transfer: true })` and the person is
 * signed up, from the sign-in page, without ever seeing a sign-up form. Clerk's
 * own type for this option calls the result an "opaque sign up" and says
 * setting it to false "prevents opaque sign ups when a user attempts to sign in
 * via OAuth with an email that doesn't exist" (`TransferableOption`,
 * @clerk/types). The prop reaches the OAuth callback too: this route is a
 * catch-all, so Clerk's sso-callback step renders inside this same component
 * and `handleRedirectCallback` is given the same `transferable` value.
 *
 * **`withSignUp={false}`.** The other way a sign-in screen signs people up, and
 * a deliberate one: Clerk's combined "sign-in-or-up" flow, where an unknown
 * identifier typed into /sign-in continues into the sign-up steps in place.
 * Whether it is on by default depends on the instance's settings rather than on
 * this code, so it is stated here instead of being left to a dashboard.
 *
 * `signUpUrl` makes the card's footer link — "New to Clarivo? Get started",
 * from `lib/clerk-localization.ts` — point at our own /sign-up. The same file
 * carries the sentence shown when an email or an external account matches no
 * user: "There's no Clarivo account for this email."
 *
 * ## Where a known user lands
 *
 * Nowhere named here, on purpose. The middleware sends a signed-out visitor to
 * /sign-in with a `redirect_url`, so Clerk returns them to the page they asked
 * for; ClerkProvider's `signInFallbackRedirectUrl` catches everyone else and
 * lands them on /dashboard. A `forceRedirectUrl` on this screen would throw the
 * deep link away. /dashboard is under the (main) layout, which redirects an
 * admin whose company has not finished onboarding to /onboarding — so "known
 * user, unfinished onboarding" is answered there, once, for every entry point
 * rather than only for this one.
 */
export default function SignInPage() {
  const isDark = useIsDark();
  return (
    <AuthFrame
      title="See what changed in your payroll, by how much, and where."
      lede="Compare two payroll periods and every change in net pay and salary components is in one place, with the employee and the amount."
    >
      <SignIn
        appearance={getClerkAppearance(isDark)}
        transferable={false}
        withSignUp={false}
        signUpUrl="/sign-up"
      />
    </AuthFrame>
  );
}
