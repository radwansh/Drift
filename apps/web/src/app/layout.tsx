import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { geistMono, instrumentSans } from "./fonts";
import { Providers } from "./providers";
import { clerkLocalization } from "@/lib/clerk-localization";

/**
 * Root layout.
 *
 * The Ink & Signal fonts (Instrument Sans + Geist Mono, see ./fonts.ts) are applied on
 * <html>, so the app, the auth screens and the marketing pages all read the same
 * --font-instrument-sans and --font-geist-mono. Inter is gone: the design system does not
 * use it, and src/app/fonts/ now holds those two faces and nothing else.
 */
export const metadata: Metadata = {
  title: "Clarivo - Payroll Variance Analysis",
  description:
    "Compare employee salaries between payroll periods. Spot variances, anomalies, and trends.",
  // The favicon had no reference at all: a bare public/favicon.svg was served
  // but never linked, and browsers only probe for /favicon.ico. Declaring the
  // icons here is what actually points the tab and home-screen icons at the
  // brand directory. Order matters — a browser takes the first format it
  // understands, so the SVG leads and favicon.ico is the fallback.
  icons: {
    icon: [
      { url: "/brand/clarivo-favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "any" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The canonical auth paths are /sign-in and /sign-up; /login and /signup
    // redirect to them in middleware. These props must name the new paths or
    // Clerk sends visitors to the redirect and they take an extra hop.
    //
    // waitlistUrl still names /waitlist, which is now a 308 to /sign-up
    // (app/waitlist/route.ts). It only renders a link at all when Clerk's
    // sign-up mode is Waitlist, which it no longer is, so it is one hop on a
    // path nobody is on rather than a stale destination.
    //
    // localization is where the sign-in screen's "there is no account for this
    // email" wording lives, and the "Get started" link in the card's footer.
    // SignInProps has appearance but no localization, so it has to be here —
    // see lib/clerk-localization.ts for which keys and why.
    //
    // Fallback, not force: the middleware sends a signed-out visitor to
    // /sign-in with a redirect_url so they land back on the page they asked
    // for. `signInForceRedirectUrl` would discard that and drop everyone on
    // /dashboard, undoing the deep link. Fallback only applies when no
    // redirect_url is present, which is the behaviour the old afterSignInUrl
    // had.
    <ClerkProvider
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      waitlistUrl="/waitlist"
      localization={clerkLocalization}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${instrumentSans.variable} ${geistMono.variable}`}
      >
        <body className="font-sans antialiased">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
