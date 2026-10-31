import type { MetadataRoute } from "next";
import { SITE } from "@/components/marketing/content";

/**
 * The public pages. Everything else is behind sign-in.
 *
 * `/us/` is the dollar landing page. It is a near-duplicate of `/` by design —
 * the only difference is the currency symbol — so the hreflang mesh in
 * `components/marketing/landing.tsx` is what tells a search engine which to
 * serve. Both must be listed: a page absent from the sitemap but named in a
 * hreflang set is a weaker signal than one present in both.
 *
 * `/au/` and `/nz/` are deliberately not here. They are target markets, but a
 * page that differs from `/us/` in nothing would be a duplicate; add them with
 * their hreflang entries when Australian and New Zealand dollar prices exist.
 */
const PUBLIC_PAGES = [
  { path: "/", priority: 1, changes: "weekly" },
  { path: "/us/", priority: 1, changes: "weekly" },
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
 */
const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-10-30",
  "/us/": "2026-10-30",
  "/security": "2026-10-14",
  "/privacy": "2026-10-14",
  "/terms": "2026-10-14",
  "/dpa": "2026-10-14",
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: `${SITE.url}${page.path}`,
    lastModified: LAST_MODIFIED[page.path] ?? "2026-10-30",
    changeFrequency: page.changes,
    priority: page.priority,
  }));
}
