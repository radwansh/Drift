import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@saas/db";
import { polarWebhookSecret } from "@/server/polar";
import { readWebhookHeaders, verifyPolarWebhook } from "@/server/polar-webhook";
import {
  applyPolarSettingsPatch,
  polarEventSchema,
  settingsPatchForEvent,
} from "@/server/polar-events";
import { entitlementOf } from "@/lib/entitlement";
import { cancelScheduledTrialEmailFor } from "@/server/trial-email";

/**
 * Polar's webhook, and the only thing in this product that writes
 * `companies.settings.plan`.
 *
 * That is the point of it rather than a side effect. Every company reads
 * `"free"` today because nothing has ever set `plan`, which is why Integrations
 * — gated to Enterprise — is hidden from everyone, the account owner included.
 * A payment landing here is what finally makes that gate mean something.
 *
 * Three things hold it together:
 *
 * 1. **It verifies before it reads.** The body is taken as raw text, checked
 *    against the Standard Webhooks signature, and only then parsed. Reading
 *    first and verifying later would mean parsing attacker-supplied JSON on an
 *    unauthenticated public route, and re-serialising it breaks the signature
 *    anyway.
 * 2. **Without `POLAR_WEBHOOK_SECRET` it processes nothing.** Everything
 *    optional in this repo degrades — `db`, the AI client, the rate limiter —
 *    and for a webhook "degraded" means refusing deliveries it cannot
 *    authenticate, not trusting them. It answers 503 and says which variable is
 *    missing, which is the same shape `migrate-preview.yml`'s guard uses:
 *    unconfigured and loud beats unconfigured and silent.
 * 3. **It writes in one statement**, through `server/company-settings.ts`, like
 *    every other writer of that column. A read-modify-write here would drop a
 *    concurrent write to a *different* key of the same column — the fiscal
 *    start month, the connectors — and `test/company-settings-atomic.test.ts`
 *    exists because that is not hypothetical.
 *
 * **Reachability.** `middleware.ts`'s matcher includes `/(api|trpc)(.*)`, so
 * this route does pass through Clerk; `PUBLIC_ROUTE_PATTERNS` already carries
 * `/api/webhooks(.*)`, which covers it without a new entry.
 * `test/public-routes.test.ts` pins that — an unlisted webhook answers a 307 to
 * `/sign-in`, which Polar counts as a failed delivery and which disables the
 * endpoint after ten of them.
 *
 * **Replays are harmless rather than detected.** The specification suggests
 * keeping `webhook-id` for a few minutes to deduplicate; there is no store here
 * to keep it in, and every write is an idempotent merge of the same keys to the
 * same values, so a redelivery lands on the state it already produced. The
 * timestamp tolerance is what stops an old capture being replayed at all.
 */

/** `node:crypto` for the HMAC, so this cannot be moved to the edge runtime. */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = polarWebhookSecret();

  // Answered before the body is touched: there is no point reading a delivery
  // that cannot be authenticated.
  if (secret === null) {
    console.warn("[polar-webhook] POLAR_WEBHOOK_SECRET is not set; refusing the delivery.");
    return NextResponse.json(
      { error: "Polar billing is not configured on this deployment (POLAR_WEBHOOK_SECRET)." },
      { status: 503 },
    );
  }

  // Raw text, never `req.json()`: the signature covers the exact bytes sent,
  // and a parse-then-stringify round trip reorders keys and drops whitespace.
  const body = await req.text();
  const verification = verifyPolarWebhook(body, readWebhookHeaders(req), secret);

  if (!verification.ok) {
    console.warn(`[polar-webhook] rejected a delivery: ${verification.reason}`);
    // 403 is what Polar's own SDK raises for a signature failure. The reason is
    // logged rather than returned: telling a caller whether it got the
    // timestamp or the signature wrong is a hint it does not need.
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let event;
  try {
    event = polarEventSchema.parse(JSON.parse(body));
  } catch (err) {
    console.error("[polar-webhook] a verified delivery did not parse:", err);
    // Verified but unreadable is a bug at one end or the other, and retrying it
    // ten times will not fix it. Acknowledged so the endpoint is not disabled.
    return NextResponse.json({ received: true, applied: false }, { status: 202 });
  }

  const outcome = settingsPatchForEvent(event);
  if (outcome.kind === "ignored") {
    // Everything Polar sends that this app does not act on lands here, which is
    // most of it. 202 rather than an error: an unhandled type is not a failure,
    // and ten "failures" disable the endpoint.
    console.log(`[polar-webhook] ignored ${event.type}: ${outcome.reason}`);
    return NextResponse.json({ received: true, applied: false }, { status: 202 });
  }

  try {
    const db = requireDb();
    const applied = await applyPolarSettingsPatch(db, outcome.companyId, outcome.patch);

    if (!applied) {
      // A `reference_id` naming no company: a stale checkout link, or somebody
      // appending their own. Nothing is created in response — this route writes
      // to rows that already exist and never makes one.
      console.warn(`[polar-webhook] ${event.type} referenced an unknown company.`);
      return NextResponse.json({ received: true, applied: false }, { status: 202 });
    }

    console.log(
      `[polar-webhook] applied ${event.type}` +
        (outcome.plan ? ` (plan: ${outcome.plan})` : " (plan unchanged: unknown product)"),
    );

    /**
     * They paid, so the trial-ended email must not arrive.
     *
     * **The question asked is of the patch, not of the merged row**, and that is
     * the right one: "does this event, on its own, say the company has access?"
     * `entitlementOf` is the single authority on that — the same function the
     * paywall, `memberProcedure` and `/api/upload` call — so a paid order
     * (`polarSubscriptionStatus: "active"`) reads as access while a
     * `subscription.revoked` (status `canceled`, `plan: "free"`) does not, and
     * neither needs a second read of the column. Evaluating the patch also means
     * a redelivery of an access-ending event can never cancel anything.
     *
     * **Awaited, and it cannot fail this response.** `cancelScheduledTrialEmailFor`
     * swallows and logs every failure, including Resend being unconfigured and a
     * message Resend has already sent. The write above has happened; answering
     * non-2xx now would have Polar retry a delivery whose work is done, and ten
     * failures disable the endpoint.
     */
    if (entitlementOf(outcome.patch, new Date()).access) {
      await cancelScheduledTrialEmailFor(db, outcome.companyId);
    }

    return NextResponse.json({ received: true, applied: true }, { status: 202 });
  } catch (err) {
    console.error("[polar-webhook] could not record the event:", err);
    // A real failure, and the one case worth a retry: Polar backs off and tries
    // again, by which time the database may be reachable.
    return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
  }
}
