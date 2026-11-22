import { describe, it, expect } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, type NextFetchEvent } from "next/server";
import { MARKETING_ROUTE_PATTERNS, PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";
import sitemap from "@/app/sitemap";
import nextConfig, { assertCrawlableClerkInstance } from "../next.config";

/**
 * **Googlebot can crawl the marketing site, and a Clerk problem cannot stop
 * it.**
 *
 * The failure this covers took clarivo-app.com out of Google's index for
 * weeks. Production ran on a Clerk development instance, so every cookieless
 * HTML request was redirected to the handshake endpoint on `accounts.dev`,
 * which answered `X-Robots-Tag: noindex, nofollow` and redirected back with a
 * ~1,800-character token in the URL — a loop Googlebot was still inside after
 * 20 hops. A browser escapes after 3 and retries clean, which is why every
 * manual check said the site was fine.
 *
 * Listing the pages in `PUBLIC_ROUTE_PATTERNS` did not prevent it:
 * `clerkMiddleware` authenticates *before* it calls our handler and returns
 * the handshake redirect itself, so `isPublicRoute` never ran on the request
 * that mattered. The fix is the bypass in `middleware.ts`, and the point of
 * these tests is that **a development key in the environment cannot
 * reintroduce the loop** — so the key below is deliberately a `pk_test_` one.
 */

/**
 * A syntactically valid Clerk development key: `pk_test_` plus base64 of
 * `<frontend-api-host>$`. Set before the middleware module is loaded, which is
 * why that import is dynamic — a static `import` is hoisted above every
 * statement in the module body, so the env var would be set too late.
 *
 * The host is fictional. Nothing here reaches the network: if the bypass ever
 * stopped working, Clerk would try to authenticate against
 * `example.clerk.accounts.dev` and these tests would fail loudly rather than
 * pass quietly.
 */
const DEV_PUBLISHABLE_KEY = "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
const LIVE_PUBLISHABLE_KEY = "pk_live_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";

process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = DEV_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY ??= "sk_test_example";

const { default: middleware } = await import("@/middleware");

/**
 * Googlebot smartphone, which is the agent that crawls this site, asking for
 * HTML and carrying no cookies. The cookies are the part that matters: a
 * signed-in browser never saw the loop because it had Clerk's session cookie
 * and skipped the handshake.
 */
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.6778.264 Mobile Safari/537.36 " +
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const asGooglebot = (path: string): NextRequest =>
  new NextRequest(new URL(path, "https://www.clarivo-app.com"), {
    headers: { "user-agent": GOOGLEBOT, accept: "text/html" },
  });

/**
 * Marketing paths return before `withClerk` is reached, so the event is never
 * used. A real `NextFetchEvent` cannot be constructed from outside Next.
 */
const EVENT = { waitUntil: () => {} } as unknown as NextFetchEvent;

const isMarketingRoute = createRouteMatcher([...MARKETING_ROUTE_PATTERNS]);

/** Every path in `sitemap.xml`, which is the list that has to stay crawlable. */
const SITEMAP_PATHS = sitemap().map((entry) => new URL(entry.url).pathname);

describe("marketing paths never reach Clerk", () => {
  it("has a sitemap to check", () => {
    // A sitemap that silently became empty would make every assertion below
    // vacuous, and `it.each([])` passes.
    expect(SITEMAP_PATHS.length).toBeGreaterThanOrEqual(11);
    expect(SITEMAP_PATHS).toContain("/au");
  });

  it.each(SITEMAP_PATHS)(
    "serves %s to Googlebot with no redirect, even on a development key",
    async (path) => {
      const res = await middleware(asGooglebot(path), EVENT);

      expect(res).toBeDefined();
      expect(res!.status).toBe(200);
      expect(res!.headers.get("location")).toBeNull();

      /**
       * `x-middleware-next: 1` is what `NextResponse.next()` sets, so this is
       * the positive form of the assertion: the request was passed straight
       * through to the route rather than handled by Clerk. A Clerk-produced
       * response carries `x-clerk-auth-reason` instead and no `next` marker.
       */
      expect(res!.headers.get("x-middleware-next")).toBe("1");
      expect(res!.headers.get("x-clerk-auth-reason")).toBeNull();
      expect(res!.headers.get("x-clerk-auth-status")).toBeNull();
    },
  );

  /**
   * The two legacy paths still redirect, and they are checked here because the
   * bypass sits immediately after them in `middleware.ts`: putting it first
   * would swallow both.
   */
  it.each([
    ["/login", "/sign-in"],
    ["/signup", "/sign-up"],
  ])("still redirects %s to %s", async (from, to) => {
    const res = await middleware(asGooglebot(from), EVENT);
    expect(res!.status).toBe(308);
    expect(new URL(res!.headers.get("location")!).pathname).toBe(to);
  });
});

describe("protected paths still go to Clerk", () => {
  /**
   * These must not be marketing routes. `/sign-in` and `/sign-up` are public
   * but need Clerk's request state to render; `/onboarding`, `/dashboard` and
   * `/settings` are behind sign-in; the API paths authorise themselves and
   * must keep reaching the handler that does it.
   */
  it.each([
    "/dashboard",
    "/onboarding",
    "/settings",
    "/sign-in",
    "/sign-up",
    "/waitlist",
    "/api/trpc/annual.getSummary",
    "/api/cron/trial-ended",
    "/api/webhooks/polar",
    "/api/schema-status",
    "/api/upload",
  ])("%s is not a marketing route", (path) => {
    expect(isMarketingRoute(asGooglebot(path))).toBe(false);
  });
});

/**
 * `next.config.ts` states `X-Robots-Tag: index, follow` on the public pages in
 * Next's own `source` syntax, which is not Clerk's matcher syntax — so it is a
 * second list, and it drifted: `/au` was missing from it and was the one
 * sitemap page with no header. Walking the sitemap against both lists is what
 * closes that, and it covers a new post or market page without an edit.
 */
describe("the sitemap is covered", () => {
  const sourceToRegExp = (source: string): RegExp =>
    new RegExp(
      "^" +
        source
          // `/:slug*` is Next's wildcard: zero or more path segments.
          .replace(/\/:[A-Za-z0-9_]+\*/g, "(?:/[^/]+)*")
          // `:slug` is exactly one segment.
          .replace(/:[A-Za-z0-9_]+/g, "[^/]+") +
        "$",
    );

  it.each(SITEMAP_PATHS)("%s is a marketing route", (path) => {
    expect(isMarketingRoute(asGooglebot(path))).toBe(true);
  });

  it.each(SITEMAP_PATHS)("%s is declared index, follow", async (path) => {
    const declared = await nextConfig.headers!();
    const matching = declared.filter((rule) => sourceToRegExp(rule.source).test(path));

    expect(
      matching.length,
      "no X-Robots-Tag source in next.config.ts matches " + path,
    ).toBeGreaterThan(0);

    for (const rule of matching) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "index, follow" });
    }
  });
});

describe("the lists agree", () => {
  it("makes every marketing route public", () => {
    for (const pattern of MARKETING_ROUTE_PATTERNS) {
      expect(PUBLIC_ROUTE_PATTERNS).toContain(pattern);
    }
  });

  /**
   * The auth screens, the webhooks and the cron routes are public without
   * being marketing: they need Clerk, or they authorise themselves. If this
   * ever became empty, `MARKETING_ROUTE_PATTERNS` would have swallowed the
   * whole public list and `/api/trpc` would be answering without Clerk.
   */
  it("keeps public routes that are not marketing", () => {
    const marketing: readonly string[] = MARKETING_ROUTE_PATTERNS;
    const notMarketing = PUBLIC_ROUTE_PATTERNS.filter((pattern) => !marketing.includes(pattern));
    expect(notMarketing).toContain("/api/trpc(.*)");
    expect(notMarketing).toContain("/sign-in(.*)");
    expect(notMarketing.length).toBeGreaterThan(5);
  });
});

describe("the production key guard", () => {
  it("refuses a development instance on production", () => {
    expect(() =>
      assertCrawlableClerkInstance({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_PUBLISHABLE_KEY,
      }),
    ).toThrow(/Clerk development instance \(pk_test_\)/);
  });

  it("names what to set", () => {
    expect(() =>
      assertCrawlableClerkInstance({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_PUBLISHABLE_KEY,
      }),
    ).toThrow(/pk_live_ and sk_live_ keys for the Production environment/);
  });

  it("passes on production with a live instance", () => {
    expect(() =>
      assertCrawlableClerkInstance({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: LIVE_PUBLISHABLE_KEY,
      }),
    ).not.toThrow();
  });

  /**
   * Preview and Development keep `pk_test_`, and must not be affected: a
   * preview is `noindex` by Vercel anyway, and needing a live Clerk instance
   * to open a pull request would be a worse problem than the one this solves.
   */
  it.each(["preview", "development", undefined])("passes on %s with pk_test_", (env) => {
    expect(() =>
      assertCrawlableClerkInstance({
        VERCEL_ENV: env,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: DEV_PUBLISHABLE_KEY,
      }),
    ).not.toThrow();
  });

  /** No key at all is a different failure, and not this one's to report. */
  it("says nothing when no key is set", () => {
    expect(() => assertCrawlableClerkInstance({ VERCEL_ENV: "production" })).not.toThrow();
  });
});
