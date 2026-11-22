/**
 * The paths that may be reached without a Clerk session.
 *
 * Kept in its own module rather than exported from `middleware.ts`: Next
 * expects a middleware file to export a default and `config`, and a test that
 * wants these lists should not have to import the middleware entry point and
 * everything Clerk pulls in behind it. `test/public-routes.test.ts` and
 * `test/marketing-crawlable.test.ts` read them from here.
 */

/**
 * **The marketing site: the pages a search engine has to be able to crawl.**
 *
 * One list, and it is the only one. It is spread into
 * `PUBLIC_ROUTE_PATTERNS` below, so a page cannot be crawlable-but-protected
 * or protected-but-crawlable; `middleware.ts` matches it to skip Clerk
 * altogether, and `test/marketing-crawlable.test.ts` checks every URL in
 * `sitemap.xml` against it, so a new post or market page is covered without an
 * edit here.
 *
 * **Being listed as public was not enough, and that is the whole point of this
 * list existing separately.** `clerkMiddleware` authenticates before it calls
 * our handler, so `isPublicRoute` never ran on the request that mattered — see
 * the comment above the bypass in `middleware.ts` for the redirect loop that
 * produced, and what it cost.
 *
 * What is **not** marketing: `/sign-in`, `/sign-up`, `/waitlist`, `/login`,
 * `/signup`, `/onboarding` and every `/api/*` path. They are public (or
 * protected) for reasons of their own, they are `Disallow`ed in `robots.txt`,
 * and several of them need Clerk to run. They keep the behaviour they have.
 */
export const MARKETING_ROUTE_PATTERNS = [
  "/",
  /**
   * The dollar landing page. It must be listed, unlike `/llms.txt`,
   * `/robots.txt` and `/sitemap.xml`: the matcher in `middleware.ts` excludes
   * any path containing a dot, so those three never reach the middleware at
   * all, while `/us` has no dot and does.
   *
   * Without this line every visitor to `/us` is redirected to sign-in — which
   * is what happened when the page was first added, and what the whole US
   * campaign would have landed on. Any future market page (`/nz`) needs an
   * entry here too, and `sitemap.ts` plus `next.config.ts`'s `PUBLIC_PATHS`
   * want it as well; the sitemap test is what reports the one you forget.
   */
  "/us",
  /**
   * The Australian landing page, listed for exactly the reason above: no dot
   * in the path, so it reaches the middleware, and an unlisted route answers a
   * 307 to `/sign-in` — unreachable from a search result and unindexable.
   */
  "/au",
  /**
   * The blog index and every post. Same reason as `/us`: no dot in the path,
   * so these do reach the middleware and would otherwise redirect a reader who
   * followed a link from search straight to a sign-in form.
   */
  "/blog",
  "/blog/(.*)",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
] as const;

/**
 * Public routes: the marketing pages above, the auth screens, the old
 * waiting-list path, the tRPC endpoint (which does its own authorisation per
 * procedure) and the webhooks. Everything else is behind sign-in.
 *
 * Everything in this list that is **not** in `MARKETING_ROUTE_PATTERNS` still
 * goes through `clerkMiddleware`, which is deliberate: these paths either need
 * Clerk's request state (the auth screens) or authorise themselves (tRPC, the
 * webhooks, the cron routes).
 */
export const PUBLIC_ROUTE_PATTERNS = [
  ...MARKETING_ROUTE_PATTERNS,
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/waitlist",
  "/login(.*)",
  "/signup(.*)",
  "/api/trpc(.*)",
  "/api/webhooks(.*)",
  /**
   * The cron routes, listed for the same reason as everything else here: no dot
   * in the path, so an unlisted one answers a 307 to `/sign-in` — and Vercel's
   * scheduler follows no redirect and holds no session, so the job would simply
   * never run while looking configured.
   *
   * Public to the matcher is **not** public to a caller. `/api/cron/trial-ended`
   * authorises itself on `CRON_SECRET` — Vercel sends it as
   * `Authorization: Bearer <secret>` — answering 401 to a wrong or missing
   * bearer and 503 when no secret is configured at all, the way the Polar
   * webhook refuses every delivery without its signing secret. A cron route
   * that cannot authenticate its caller must do nothing rather than trust them.
   */
  "/api/cron/(.*)",
  /**
   * The schema-drift status route, and it has to be listed for the same reason
   * `/us` does: no dot in the path, so it reaches this middleware.
   *
   * Without this line the route redirects to `/sign-in`, which defeats the only
   * reason it exists. It reports whether this deployment's migrations have been
   * applied, and the case it is for is a database so far behind that *every*
   * query against it fails — including the ones the sign-in path makes. An
   * endpoint that needs a session cannot answer a question about a database
   * that is too broken to establish a session.
   *
   * It is safe to expose: the body is migration counts, migration tags and a
   * reason enum. No tenant data, nothing enumerable, and the tags are already
   * public in this repository.
   */
  "/api/schema-status",
] as const;
