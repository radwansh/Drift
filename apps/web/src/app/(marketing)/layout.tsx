import { Instrument_Sans, Geist_Mono } from "next/font/google";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

/**
 * Layout for the public pages: /, /privacy, /terms, /security, /dpa.
 *
 * These render statically. Note the absence of `export const dynamic =
 * "force-dynamic"` — the opposite of every page under (main). The header's
 * signed-in check is client-side precisely so this stays true; a server-side
 * Clerk call anywhere in here would turn all five pages dynamic.
 *
 * Fonts come through next/font/google as the hand-off README specifies, with
 * the variable names tokens.css already reads via --cv-font-sans and
 * --cv-font-mono. The weights are the ones the design uses, not the full
 * families.
 *
 * Light only: the app follows the system theme, but the landing page is
 * designed light with two dark bands, so the wrapper pins `data-theme="light"`
 * rather than inheriting a dark shadcn palette underneath the cv- tokens.
 */

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="light"
      className={`${instrumentSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-cv-bg font-cv-sans text-cv-ink antialiased`}
    >
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
