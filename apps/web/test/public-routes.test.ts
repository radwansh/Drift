import { describe, it, expect } from "vitest";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

/**
 * What reaches `clerkMiddleware` without a session.
 *
 * `/api/schema-status` shipped without being listed here and nothing caught it:
 * the matcher in `middleware.ts` covers any path with no dot in it, so the
 * route fell through to `auth.protect({ unauthenticatedUrl: "/sign-in" })` and
 * answered a 307 to the sign-in page. Clerk checks `unauthenticatedUrl` before
 * `isPageRequest`, so an API path is redirected exactly like a page.
 *
 * That defeated the only reason the route exists. It reports whether this
 * deployment's migrations have been applied, and the case it is built for is a
 * database so far behind that every query against it fails — including the ones
 * the sign-in path makes. A page that cannot be reached when the database is
 * broken cannot report that the database is broken.
 *
 * The same trap caught `/us` when it was added, which is why that line carries
 * its own comment. These tests are here so the next route to need public access
 * fails loudly rather than silently redirecting readers to a sign-in form.
 *
 * `/au` is the next one, and is pinned below for the same reason: a market
 * page nobody can reach from a search result is an unindexable page with a
 * campaign pointed at it.
 */
const matches = (path: string): boolean =>
  createRouteMatcher([...PUBLIC_ROUTE_PATTERNS])(
    new NextRequest(new URL(path, "https://www.clarivo-app.com")),
  );

describe("public routes", () => {
  it("lets the schema-status route answer without a session", () => {
    expect(matches("/api/schema-status")).toBe(true);
  });

  it.each([
    "/",
    "/us",
    "/au",
    "/blog",
    "/blog/payroll-variance-report-what-to-check",
    "/security",
    "/privacy",
    "/terms",
    "/dpa",
    "/waitlist",
    "/sign-in",
    "/sign-up",
  ])("keeps %s reachable from search or a link", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/employees",
    "/employees/E1",
    "/annual-salaries",
    "/detailed",
    "/payroll-periods",
    "/integrations",
    "/settings",
  ])("still protects %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  /**
   * The signed-in app reaches tRPC, which authorises per procedure; the
   * webhooks verify their own signatures. Both are deliberately public here and
   * neither should quietly stop being so.
   */
  it("leaves tRPC and webhooks to their own authorisation", () => {
    expect(matches("/api/trpc/annual.getSummary")).toBe(true);
    expect(matches("/api/webhooks/zoho")).toBe(true);
  });

  /**
   * The Polar webhook, which needed no new entry: `/api/webhooks(.*)` already
   * covers it. Pinned anyway, because the cost of it silently ceasing to be
   * public is specific and delayed — Clerk answers a 307 to `/sign-in`, Polar
   * counts a 3xx as a failed delivery and does not follow it, and after ten
   * consecutive failures it disables the endpoint and stops sending. Payments
   * would then stop setting `plan` with nothing in this app reporting it.
   *
   * It verifies its own signature, so being public is the point rather than an
   * oversight.
   */
  it("lets the Polar webhook reach its own signature check", () => {
    expect(matches("/api/webhooks/polar")).toBe(true);
  });

  /**
   * The upload route is not public, and this pins it: it writes payroll rows
   * and must stay behind sign-in.
   */
  it("does not expose the upload route", () => {
    expect(matches("/api/upload")).toBe(false);
  });
});
