import { NextResponse, type NextRequest } from "next/server";

/**
 * `/waitlist` — a 308 to `/sign-up`.
 *
 * The waiting list is over. Sign-up is open, so the page that used to render
 * the early-access lead form now sends the visitor to the form that actually
 * creates an account. It is kept as a redirect rather than deleted because the
 * URL is in the wild: it was `waitlistUrl` on `ClerkProvider`, it is linked
 * from the early-access emails that went out during the beta, and a 404 for
 * somebody who was waiting to be let in is the worst answer available.
 *
 * **308, not 307.** Permanent: the move is not coming back, and a permanent
 * redirect is the one a search engine and a browser will both cache. Both
 * statuses preserve the method, which is the property that matters if anything
 * ever POSTed here.
 *
 * A Route Handler rather than a page calling `permanentRedirect()`, for two
 * reasons. It states the status code in the file instead of relying on which
 * of Next's two redirect helpers was imported, and it sits outside the
 * `(marketing)` group, so a redirect does not render a layout, a header, a
 * footer and a `ClerkProvider` subtree to throw all of it away.
 *
 * `/waitlist` must stay in `PUBLIC_ROUTE_PATTERNS` (`lib/public-routes.ts`).
 * The middleware matcher catches every path without a dot in it, so an unlisted
 * `/waitlist` would answer a 307 to `/sign-in` and this redirect would never
 * run — the visitor would land on the wrong form, signed out, with no account.
 * `test/public-routes.test.ts` pins it.
 *
 * The lead-capture machinery behind the old page is deliberately left in place
 * and unused: the `trial_requests` table, the Zoho integration,
 * `EarlyAccessForm` and `launch.waitlistMode` itself. Turning the waiting list
 * back on is a switch, not a rebuild.
 */
export function GET(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/sign-up", request.url), 308);
}
