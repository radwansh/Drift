import type { NextConfig } from "next";

/**
 * The public pages, stated positively as indexable.
 *
 * Search Console reported `/` as "Excluded by 'noindex' tag — detected in
 * 'X-Robots-Tag' http header" on crawls dated 4 and 12 November, while its own
 * **live test** on the 12th answered "Page can be indexed" and every request
 * made from here — plain, as Googlebot desktop, as Googlebot smartphone,
 * against all four of Vercel's edge IPs — returned 200 with no such header at
 * all. Nothing in this repository emits one: the only `noindex` is the page
 * metadata on `/waitlist`, which is a form and is disallowed in `robots.txt`
 * besides.
 *
 * So the header is added above the application. The one mechanism in this
 * stack that does that is Vercel's Deployment Protection, which marks
 * protected deployments `noindex`; the project has it set to
 * `all_except_custom_domains`, which is the setting that should exempt this
 * domain, and does for every request anyone here can make.
 *
 * Declaring the header does **not** override one added at the edge — where
 * directives conflict Google takes the most restrictive, so a `noindex` from
 * above still wins. It is here for two other reasons:
 *
 *  1. It makes the intent explicit rather than inferred from an absence, so
 *     the next crawl is decisive. If a crawl still reports `noindex` while
 *     this is live and visible on the response, the application is definitively
 *     not the source and it belongs with Vercel support, with the request id.
 *  2. Robots directives are the kind of thing that should be stated. A
 *     deployment that silently stops being indexable is how a marketing site
 *     disappears from search without anyone noticing for weeks.
 *
 * Scoped to the public pages. Everything under `(main)` is behind sign-in and
 * already `Disallow`ed in `robots.txt`; it has no business claiming to be
 * indexable, and this list matches the one in `middleware.ts`.
 */
const PUBLIC_PATHS = [
  "/",
  "/us",
  "/blog",
  "/blog/:slug*",
  "/security",
  "/privacy",
  "/terms",
  "/dpa",
];

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
