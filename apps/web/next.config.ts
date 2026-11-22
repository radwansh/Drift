import type { NextConfig } from "next";

/**
 * The public pages, stated positively as indexable.
 *
 * **Where the `noindex` came from.** Search Console reported `/` as "Excluded
 * by 'noindex' tag — detected in 'X-Robots-Tag' http header", and later
 * "Redirect error". Nothing in this repository emitted that header and Vercel's
 * Deployment Protection was not the source either — the earlier version of this
 * comment blamed it, which sent the investigation down a dead end. The real
 * source was **Clerk**: production ran on a development instance (`pk_test_`,
 * `ethical-whippet-12.clerk.accounts.dev`), so every cookieless HTML request
 * was redirected to the handshake endpoint on `accounts.dev`, and *that hop*
 * answered `X-Robots-Tag: noindex, nofollow` before redirecting back. Googlebot
 * keeps no cookies, so it never escaped the loop; a browser gives up after 3
 * redirects and retries clean, which is why every manual check looked fine.
 *
 * **What fixed it**: production moved to a `pk_live_` instance, so the
 * handshake hop is gone. Two things here keep it fixed — the marketing pages
 * now bypass Clerk entirely (`src/middleware.ts`), and a production build
 * refuses a `pk_test_` key outright (`assertCrawlableClerkInstance` below).
 *
 * The header itself stays, for two reasons:
 *
 *  1. It makes the intent explicit rather than inferred from an absence, so a
 *     crawl is decisive. Declaring it does not override a `noindex` added above
 *     the application — where directives conflict Google takes the most
 *     restrictive — but if a crawl ever reports `noindex` while this is live and
 *     visible on the response, the application is definitively not the source.
 *  2. Robots directives are the kind of thing that should be stated. A
 *     deployment that silently stops being indexable is how a marketing site
 *     disappears from search without anyone noticing for weeks. It did.
 *
 * Scoped to the public pages. Everything under `(main)` is behind sign-in and
 * already `Disallow`ed in `robots.txt`; it has no business claiming to be
 * indexable.
 *
 * **This list must cover every URL in `sitemap.xml`.** It is Next's own
 * `source` syntax, not Clerk's matcher syntax, so it cannot simply be
 * `MARKETING_ROUTE_PATTERNS` from `src/lib/public-routes.ts`. It drifted from
 * it instead: `/au` shipped as a sitemap page, a public route and an hreflang
 * target while missing from here, so it was the one page in the sitemap with no
 * `index, follow` header. `test/marketing-crawlable.test.ts` now walks the
 * sitemap against both lists, which is what makes the next omission fail a
 * build rather than sit unnoticed.
 */
const PUBLIC_PATHS = [
  "/",
  "/us",
  "/au",
  "/blog",
  "/blog/:slug*",
  "/security",
  "/privacy",
  "/terms",
  "/dpa",
];

/**
 * **A production build refuses a Clerk development instance.**
 *
 * `pk_test_` keys serve their handshake from `*.clerk.accounts.dev`, which
 * answers `noindex, nofollow` and bounces a cookieless client back and forth
 * until it gives up. That is what took clarivo-app.com out of Google's index,
 * and nothing in this stack noticed: the build was green, the pages were 200
 * in a browser, and the only symptom arrived weeks later as a Search Console
 * report. So it is checked at build time, where it is cheap and loud.
 *
 * Only Production. Preview and Development keep `pk_test_` — previews are
 * `noindex` by Vercel anyway and nobody should need a live instance to open a
 * pull request.
 *
 * A failed build cannot take the site down: Vercel leaves the previous
 * production deployment serving. The worst case is a deploy that does not ship,
 * with a message naming exactly what to set.
 *
 * Takes the environment as an argument rather than reading `process.env`, so
 * `test/marketing-crawlable.test.ts` can state both outcomes without mutating
 * the process. It reads `VERCEL_ENV` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
 * and nothing else; the parameter is a plain dictionary rather than
 * `NodeJS.ProcessEnv`, which Next augments with a required `NODE_ENV` that
 * every test caller would then have to supply, or an all-optional literal,
 * which `process.env` cannot be assigned to (TS2559, weak type).
 */
export function assertCrawlableClerkInstance(env: Record<string, string | undefined>): void {
  if (env.VERCEL_ENV !== "production") return;
  if (!(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_test_")) return;

  throw new Error(
    "Production is configured with a Clerk development instance (pk_test_). " +
      "Search engines cannot crawl it. " +
      "Set the pk_live_ and sk_live_ keys for the Production environment.",
  );
}

assertCrawlableClerkInstance(process.env);

const nextConfig: NextConfig = {
  transpilePackages: ["@saas/types", "@saas/db", "@saas/payroll-core", "@saas/ai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return PUBLIC_PATHS.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
    }));
  },
};
export default nextConfig;
