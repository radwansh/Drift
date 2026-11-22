import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { MARKETING_ROUTE_PATTERNS, PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);
const isMarketingRoute = createRouteMatcher([...MARKETING_ROUTE_PATTERNS]);

/** The old paths, kept working. */
const REDIRECTS: Record<string, string> = {
  "/login": "/sign-in",
  "/signup": "/sign-up",
};

/**
 * Everything that needs Clerk. Not the default export any more — see below.
 */
const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Protected. `auth.protect()` alone answered 404 for a signed-out visitor
  // rather than redirecting — measured against /annual-salaries, /dashboard,
  // /payroll-periods and /detailed, and called out in the hand-off as "never a
  // 404". Naming the destination explicitly is what fixes it: without
  // unauthenticatedUrl, Clerk cannot build its handshake redirect and falls
  // back to notFound().
  await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
  });
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // /login -> /sign-in, /signup -> /sign-up, preserving the query string so a
  // Clerk redirect_url survives the move. First, before the bypass: neither
  // path is a marketing route, and both have to keep redirecting.
  const target = REDIRECTS[pathname];
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }

  /**
   * **The marketing pages do not go through Clerk at all.**
   *
   * Listing them in `PUBLIC_ROUTE_PATTERNS` was not enough, and the reason is
   * the order of operations inside `clerkMiddleware`: it calls
   * `authenticateRequest` *before* it invokes the handler above, and when that
   * returns a Handshake state it returns the redirect itself — our
   * `isPublicRoute` check never runs on the request that matters.
   *
   * What that cost: production ran on a Clerk **development** instance
   * (`pk_test_`, `ethical-whippet-12.clerk.accounts.dev`). Every HTML request
   * carrying no Clerk cookies was sent round a loop — a 307 to the handshake on
   * `accounts.dev`, which answered `X-Robots-Tag: noindex, nofollow` and
   * redirected back with a ~1,800-character token in the URL, then a 307 to the
   * clean URL, and round again. Googlebot keeps no cookies, so it was still
   * being redirected after 20 hops; browsers give up after 3 and retry clean,
   * which is why the site looked fine to everyone who checked it by hand.
   * Search Console reported "Excluded by 'noindex' tag", then "Redirect error",
   * and clarivo-app.com fell out of the index.
   *
   * Moving production to a `pk_live_` instance stopped the loop. This bypass is
   * what stops it coming back: a Clerk misconfiguration of any kind — test keys
   * restored, a broken DNS record for `clerk.clarivo-app.com`, a handshake edge
   * case — can no longer reach a page Google crawls. Preview deployments still
   * use the development instance, so without this they still loop for any
   * client without cookies.
   *
   * Nothing under here needs Clerk on the server. The marketing layout renders
   * statically and the header's signed-in check is the client-side
   * `<SignedIn>`/`<SignedOut>` pair, which runs in the browser against
   * `ClerkProvider` and is unaffected. **Do not "simplify" this back to a
   * single `clerkMiddleware` export** — the public-route check inside it does
   * not run early enough to protect these pages.
   */
  if (isMarketingRoute(req)) return NextResponse.next();

  return withClerk(req, event);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
