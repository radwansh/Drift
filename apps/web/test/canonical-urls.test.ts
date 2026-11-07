import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { HREFLANG } from "@/components/marketing/landing";
import { SITE } from "@/components/marketing/content";

/**
 * Every URL this site declares about itself must be the address the server
 * actually serves.
 *
 * `next.config.ts` leaves `trailingSlash` at its default of `false`, so the
 * server answers `/us/` with a 308 to `/us`. The sitemap, the canonical on
 * `/us`, its Open Graph url, its structured data and the `en-US` hreflang on
 * both landing pages all named `/us/` — so Search Console reported the page as
 * a **redirect error**: a canonical pointing at a redirect names a preferred
 * address that cannot be indexed, and an hreflang annotation naming a redirect
 * is not a valid annotation.
 *
 * The root is the one legitimate trailing slash: `https://…/` is the origin,
 * not a path with an empty segment, and it is served as-is.
 *
 * These assertions are cheap and the bug was invisible to every other check in
 * the repo — it passed typecheck, lint, 909 tests and a production build, and
 * was only found by fetching the live site.
 */
const isRoot = (url: string): boolean => url === `${SITE.url}/`;

describe("declared URLs match what the server serves", () => {
  it("lists no trailing-slash path in the sitemap", () => {
    const offenders = sitemap()
      .map((entry) => entry.url)
      .filter((url) => url.endsWith("/") && !isRoot(url));

    expect(offenders).toEqual([]);
  });

  it("points every hreflang at a final address", () => {
    const offenders = Object.entries(HREFLANG)
      .filter(([, url]) => url.endsWith("/") && !isRoot(url))
      .map(([lang, url]) => `${lang} -> ${url}`);

    expect(offenders).toEqual([]);
  });

  /**
   * The dollar page specifically, since it is the one that broke and the one
   * most likely to be copied when `/au` and `/nz` are added.
   */
  it("names the dollar page as /us in both the sitemap and the hreflang mesh", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE.url}/us`);
    expect(urls).not.toContain(`${SITE.url}/us/`);
    expect(HREFLANG["en-US"]).toBe(`${SITE.url}/us`);
  });

  /**
   * A page named in the hreflang mesh but absent from the sitemap is a weaker
   * signal than one in both, which is why `sitemap.ts` says both must be
   * listed. This pins that the two agree rather than drifting apart.
   */
  it("keeps the hreflang mesh and the sitemap in step", () => {
    const urls = new Set(sitemap().map((entry) => entry.url));
    for (const [lang, url] of Object.entries(HREFLANG)) {
      if (lang === "x-default") continue; // points at `en`, already covered
      expect(urls, `${lang} (${url}) is annotated but not in the sitemap`).toContain(url);
    }
  });

  it("builds every sitemap URL on the canonical host", () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith(`${SITE.url}/`)).toBe(true);
    }
  });
});
