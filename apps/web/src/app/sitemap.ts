import type { MetadataRoute } from "next";
import { SITE } from "@/components/marketing/content";

/** The five public pages. Everything else is behind sign-in. */
const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/security", priority: 0.6 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
  { path: "/dpa", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map((page) => ({
    url: `${SITE.url}${page.path}`,
    lastModified,
    changeFrequency: page.path === "/" ? "weekly" : "yearly",
    priority: page.priority,
  }));
}
