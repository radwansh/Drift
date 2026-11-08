import localFont from "next/font/local";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { EarlyAccessProvider } from "@/components/marketing/early-access-provider";
import { authEntryPointsVisible } from "@/config/environment";

/**
 * Layout for the public pages: /, /privacy, /terms, /security, /dpa.
 *
 * These render statically. Note the absence of `export const dynamic =
 * "force-dynamic"` — the opposite of every page under (main). The header's
 * signed-in check is client-side precisely so this stays true; a server-side
 * Clerk call anywhere in here would turn all five pages dynamic.
 *
 * Fonts are **self-hosted**, with the variable names tokens.css already reads
 * via --cv-font-sans and --cv-font-mono.
 *
 * They came through `next/font/google` until that became the single most
 * common reason a build failed. `next/font/google` fetches from Google at
 * **compile time**, so every `next build` depended on reaching
 * fonts.googleapis.com, and when it could not the build died with
 *
 *     An error occurred in `next/font`.
 *     TypeError: Cannot read properties of null (reading '1')
 *
 * — a webpack error naming neither the font nor the network. It hit twice on
 * two unrelated pull requests, and only looked like luck because `ci.yml`
 * builds each commit twice (on `push` and on `pull_request`) and one run kept
 * surviving. A check that fails half the time for reasons unconnected to the
 * change is how people learn to merge past red.
 *
 * `next/font/local` keeps everything that mattered — the CSS variable, the
 * preload, `display: swap`, and self-hosting so no request reaches Google at
 * runtime either — and removes the network from the build. The files in
 * `./fonts` are the `latin` subsets, which is what `subsets: ["latin"]` asked
 * for before; both are variable fonts, so one file spans the whole weight
 * range the design uses rather than one file per weight.
 *
 * Light only: the app follows the system theme, but the landing page is
 * designed light with two dark bands, so the wrapper pins `data-theme="light"`
 * rather than inheriting a dark shadcn palette underneath the cv- tokens.
 */

const instrumentSans = localFont({
  src: "../fonts/instrument-sans-latin.woff2",
  // The variable font's own range. Declaring it is what lets the browser
  // synthesise 500 and 600 from one file instead of refusing them, which is
  // the whole reason one file replaces the four weights listed before.
  weight: "400 700",
  style: "normal",
  variable: "--font-instrument-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-geist-mono",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="light"
      className={`${instrumentSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-cv-bg font-cv-sans text-cv-ink antialiased`}
    >
      {/* One dialog for the page, inside the themed wrapper so it inherits the
          cv- tokens and the font variables. */}
      <EarlyAccessProvider>
        {/* Read here, in a server component, and passed down: VERCEL_ENV is not
            available to client code, and the header is a client component. */}
        <MarketingHeader showAuth={authEntryPointsVisible} />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </EarlyAccessProvider>
    </div>
  );
}
