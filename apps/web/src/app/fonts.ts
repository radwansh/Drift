import localFont from "next/font/local";

/**
 * The design system's two faces, self-hosted, loaded once for the whole app.
 *
 * - Instrument Sans for everything set in words (display at 600, UI at 400 to 600).
 * - Geist Mono for figures in tables, IDs, pay codes and code.
 *
 * Self-hosted with next/font/local rather than next/font/google, for the reason given
 * in (marketing)/layout.tsx before this module existed: next/font/google fetches at
 * compile time, so every `next build` depended on reaching fonts.googleapis.com, and it
 * twice failed a build on changes that had nothing to do with fonts. The files in
 * ./fonts are the latin subsets; both are variable fonts, so one file spans the whole
 * weight range.
 *
 * The variable names are the ones clarivo-tokens.css reads through --cv-font-sans and
 * --cv-font-mono. Both are applied on <html> in app/layout.tsx, so every route group
 * (marketing, auth, the app) gets them from one place.
 */
export const instrumentSans = localFont({
  src: "./fonts/instrument-sans-latin.woff2",
  // The variable font's own range; declaring it lets one file serve 400 to 700.
  weight: "400 700",
  style: "normal",
  variable: "--font-instrument-sans",
  display: "swap",
});

export const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-geist-mono",
  display: "swap",
});
