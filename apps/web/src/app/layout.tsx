import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clarivo - Payroll Variance Analysis",
  description: "Compare employee salaries between payroll periods. Spot variances, anomalies, and trends.",
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
    // waitlistUrl is what makes Clerk's own screens link to our page: with
    // sign-up mode set to Waitlist, <SignIn /> grows a "Join the waitlist"
    // link, and without this prop it points at Clerk's hosted page instead.
    <ClerkProvider
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      waitlistUrl="/waitlist"
    >
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
