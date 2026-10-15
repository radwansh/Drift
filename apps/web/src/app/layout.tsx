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
    <ClerkProvider
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      signInUrl="/login"
      signUpUrl="/signup"
    >
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
