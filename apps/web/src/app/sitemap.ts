import type { MetadataRoute } from "next";
import { SITE } from "@/components/marketing/content";
import { POSTS } from "@/components/marketing/posts";

/**
 * The public pages. Everything else is behind sign-in.
 *
 * `/us` is the dollar landing page and `/au` the Australian one. `/us` is a
 * near-duplicate of `/` by design — the only difference is the currency symbol
 * — so the hreflang mesh in `components/marketing/landing.tsx` is what tells a
 * search engine which of those two to serve. `/au` carries its own prices,
 * figures, cadence vocabulary and a section on superannuation, so it is a page
 * in its own right rather than a translation of either. All three must be
 * listed: a page absent from the sitemap but named in a hreflang set is a
 * weaker signal than one present in both.
 *
 * `/nz/` is deliberately not here. New Zealand is a target market, but a page
 * that differs from `/us` in nothing would be a duplicate; add it with its
 * hreflang entry when New Zealand dollar prices and New Zealand copy exist.
 */
const PUBLIC_PAGES = [
  { path: "/", priority: 1, changes: "weekly" },
  // `/us` and `/au`, never `/us/` or `/au/`. The slashed form 308s to this
  // one, and a sitemap that lists a redirect asks Google to index an address
  // that does not serve.
  { path: "/us", priority: 1, changes: "weekly" },
  { path: "/au", priority: 1, changes: "weekly" },
  { path: "/security", priority: 0.6, changes: "yearly" },
  { path: "/privacy", priority: 0.3, changes: "yearly" },
  { path: "/terms", priority: 0.3, changes: "yearly" },
  { path: "/dpa", priority: 0.3, changes: "yearly" },
] as const;

/**
 * Per-page dates, not `new Date()`.
 *
 * Every entry used to carry the build time, so `/terms` reported a fresh
 * `lastmod` on every deploy whether a word had changed or not. Search engines
 * discount `lastmod` once they learn it is unreliable, and it is the one signal
 * telling a crawler which of six URLs is worth re-fetching — so an always-today
 * value spends the signal to say nothing.
 *
 * Update the date for a page when that page's content changes. The four legal
 * pages still render a placeholder, so theirs is the date they were last
 * touched, not today.
 *
 * `/` and `/us` move with `/au` on 2026-11-17 for a reason that is not
 * cosmetic: both gained an `en-AU` annotation, and a hreflang set is only
 * valid when every member names every other member. The return tags are the
 * change, so both pages want re-reading even though no visible word on either
 * of them moved.
 */
const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-11-17",
  "/us": "2026-11-17",
  "/au": "2026-11-17",
  "/security": "2026-10-14",
  "/privacy": "2026-10-14",
  "/terms": "2026-10-14",
  "/dpa": "2026-10-14",
};

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = PUBLIC_PAGES.map((page) => ({
    url: `${SITE.url}${page.path}`,
    lastModified: LAST_MODIFIED[page.path] ?? "2026-10-30",
    changeFrequency: page.changes,
    priority: page.priority,
  }));

  /**
   * The blog, from `POSTS`, so publishing a post needs no edit here.
   *
   * Each post carries its own publication date as `lastmod` — a real date that
   * means something, which is the whole reason the build-time `new Date()` was
   * removed above. The index is listed at a higher priority than the posts
   * only because it is the hub they all link back to.
   */
  const latest = POSTS.map((p) => p.published).sort().at(-1) ?? "2026-10-31";
  const blog: MetadataRoute.Sitemap = [
    {
      url: `${SITE.url}/blog`,
      lastModified: latest,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...POSTS.map((post) => ({
      url: `${SITE.url}/blog/${post.slug}`,
      lastModified: post.published,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];

  return [...pages, ...blog];
}
