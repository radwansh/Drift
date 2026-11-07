import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

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
