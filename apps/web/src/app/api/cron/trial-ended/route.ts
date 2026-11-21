import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireDb } from "@saas/db";
import { sendTrialEndedEmailNow, trialEndedCandidates } from "@/server/trial-email";

/**
 * `GET /api/cron/trial-ended` — the **backup** path for the trial-ended email.
 *
 * The main path is Resend's own scheduler: `scheduleTrialEndedEmail` queues the
 * message at onboarding completion with `scheduledAt` set to the minute the
 * trial ends. This route exists for the companies that path missed — Resend
 * unconfigured when they onboarded, or the schedule call failed — and it finds
 * them precisely because no `trialEndedEmailId` was ever stored.
 *
 * **It is a backup and cannot be the mechanism.** Vercel's Hobby plan runs a
 * cron at most once a day and only somewhere inside the scheduled hour, so a
 * company whose trial ends at 09:00 may wait until the next day's 07:00 window.
 * An email that says "your trial has ended" arriving a day late is acceptable;
 * it is not acceptable as the design, which is why the schedule-at-completion
 * path is the one that matters and this one is the net underneath it.
 *
 * **Running it twice sends nothing new**, and that is a property of the query
 * rather than of a guard in the loop: `trialEndedCandidates` selects only
 * companies where **neither** `trialEndedEmailId` nor `trialEndedEmailSentAt`
 * exists as a key, and `sendTrialEndedEmailNow` writes both on a confirmed send.
 * So the second run's candidate list is empty. A failed send writes neither,
 * which is also right: tomorrow tries again.
 *
 * **`CRON_SECRET`, and the two different refusals.** Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` on every scheduled invocation.
 *
 * - **No secret configured at all → 503, and nothing runs.** This is the shape
 *   `api/webhooks/polar` uses for a missing `POLAR_WEBHOOK_SECRET`, for the same
 *   reason: a route that cannot authenticate its caller must do nothing rather
 *   than trust them. "Optional services degrade" does not mean an unauthenticated
 *   endpoint that mails customers. Answering 401 here instead would be a lie —
 *   the caller's credential is not the thing that is wrong.
 * - **A wrong or missing bearer → 401.** Compared in constant time, and nothing
 *   about the expected value is in the response.
 *
 * `/api/cron/(.*)` is in `lib/public-routes.ts` because Clerk's middleware
 * matcher catches every path without a dot in it, and an unlisted route answers
 * a 307 to `/sign-in`: Vercel's scheduler follows no redirect and holds no
 * session, so the job would never run while looking configured. Public to the
 * matcher is not public to a caller — the bearer check above is the gate.
 */

/** `node:crypto` for the constant-time compare, so this cannot move to the edge. */
export const runtime = "nodejs";

/**
 * Never cached. A cron response that Next decided to cache would report
 * yesterday's counts and send nothing, which is the one failure mode a backup
 * must not have.
 */
export const dynamic = "force-dynamic";

/** A trimmed environment variable, or null for unset-or-blank. */
function env(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on a length mismatch, which would leak the length.
  // A credential of the wrong length cannot be the right one.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Whether the caller presented the configured secret.
 *
 * `null` means no secret is configured, which is a different answer from "the
 * wrong one" and gets a different status.
 */
function authorise(req: Request, secret: string): boolean {
  const header = req.headers.get("authorization");
  if (header === null) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return constantTimeEquals(header.slice(prefix.length).trim(), secret);
}

export async function GET(req: Request) {
  const secret = env("CRON_SECRET");

  if (secret === null) {
    console.warn("[cron/trial-ended] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json(
      { error: "This deployment has no CRON_SECRET configured, so cron routes do nothing." },
      { status: 503 },
    );
  }

  if (!authorise(req, secret)) {
    // No reason in the body: whether the header was absent or merely wrong is a
    // hint the caller does not need.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const db = requireDb();
    const candidates = await trialEndedCandidates(db, now);

    let sent = 0;
    const skipped: string[] = [];

    // Sequential rather than `Promise.all`: this is a once-a-day job over a
    // handful of companies, and a burst of parallel sends is the shape that
    // trips Resend's rate limit and loses the ones at the end of the list.
    for (const company of candidates) {
      const result = await sendTrialEndedEmailNow({
        db,
        companyId: company.id,
        companyName: company.name,
        trialEndsAt: company.trialEndsAt,
      });
      if (result.ok) sent += 1;
      else skipped.push(`${company.id}: ${result.reason}`);
    }

    if (skipped.length > 0) {
      console.warn(`[cron/trial-ended] did not send for ${skipped.length}: ${skipped.join("; ")}`);
    }
    console.log(`[cron/trial-ended] ${candidates.length} candidates, ${sent} sent.`);

    // The counts are in the body so a run is readable from Vercel's log without
    // correlating it against the database.
    return NextResponse.json({
      ok: true,
      ranAt: now.toISOString(),
      candidates: candidates.length,
      sent,
      skipped: skipped.length,
    });
  } catch (err) {
    console.error("[cron/trial-ended] the run failed:", err);
    return NextResponse.json({ error: "The trial-ended run failed." }, { status: 500 });
  }
}
