import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clarivo - Payroll Variance Analysis",
  description: "Compare employee salaries between payroll periods. Spot variances, anomalies, and trends.",
  // The favicon had no reference at all: a bare public/favicon.svg is served
  // but never linked, and browsers only probe for /favicon.ico. Declaring it
  // here is what actually points the tab icon at the brand directory.
  icons: { icon: "/brand/favicon.svg" },
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
