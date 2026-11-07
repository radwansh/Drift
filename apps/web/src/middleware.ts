import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Public routes: the five marketing pages, the auth screens, the waiting-list
 * form, the tRPC endpoint (which does its own authorisation per procedure) and
 * the webhooks. Everything else is behind sign-in.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  "/",
  /**
   * The dollar landing page. It must be listed, unlike `/llms.txt`,
   * `/robots.txt` and `/sitemap.xml`: the matcher below excludes any path
   * containing a dot, so those three never reach this middleware at all, while
   * `/us` has no dot and does.
   *
   * Without this line every visitor to `/us` is redirected to sign-in — which
   * is what happened when the page was first added, and what the whole US
   * campaign would have landed on. Any future market page (`/au`, `/nz`) needs
   * an entry here too.
   */
  "/us",
  /**
   * The blog index and every post. Same reason as `/us`: no dot in the path,
   * so these do reach this middleware and would otherwise redirect a reader
   * who followed a link from search straight to a sign-in form.
   */
  "/blog",
  "/blog/(.*)",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/waitlist",
  "/login(.*)",
  "/signup(.*)",
  "/api/trpc(.*)",
  "/api/webhooks(.*)",
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

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);

/** The old paths, kept working. */
const REDIRECTS: Record<string, string> = {
  "/login": "/sign-in",
  "/signup": "/sign-up",
};

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // /login -> /sign-in, /signup -> /sign-up, preserving the query string so a
  // Clerk redirect_url survives the move.
  const target = REDIRECTS[pathname];
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }

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

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
