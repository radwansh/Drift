import type { DbClient } from "@saas/db";

/**
 * The trial-ended email: scheduling it, cancelling it, and sending it late.
 *
 * **This file is a placeholder with the seam fixed, not the implementation.**
 * It exists so onboarding can call `scheduleTrialEndedEmail` on finish, and the
 * Polar webhook can call `cancelTrialEndedEmail` on a payment, without either
 * of them waiting for the email work or editing it. Whoever builds the email
 * changes this file and nothing that calls it.
 *
 * What it has to become, from the brief:
 *
 * - **Scheduled at onboarding completion**, through Resend's `scheduledAt` set
 *   to `trialEndOf(settings)` as ISO 8601, with
 *   `idempotencyKey: "trial-ended/<companyId>"`. Resend accepts schedules up to
 *   30 days out, so 14 is fine. The returned email id is saved to
 *   `settings.trialEndedEmailId` in one statement through
 *   `server/company-settings.ts`.
 * - **Cancelled if they pay first** — `resend.emails.cancel(id)` when the
 *   webhook grants access before the trial ends. A failed cancel is logged and
 *   **must not fail the webhook's response**: Polar would retry a delivery that
 *   already did its job.
 * - **A daily backup**, `GET /api/cron/trial-ended`, for when scheduling failed
 *   or Resend was unconfigured at completion. It picks companies whose trial has
 *   ended, that have no access, and that have neither `trialEndedEmailId` nor
 *   `trialEndedEmailSentAt`; sends; records `trialEndedEmailSentAt`. Running it
 *   twice sends nothing new. 401 on a wrong or missing `CRON_SECRET`, 503 when
 *   no secret is configured — the way the Polar webhook refuses deliveries
 *   without its signing secret.
 *
 * Two things in `lib/resend.ts` have to change for any of this to reach a
 * customer, and both are worth knowing before trusting a green test:
 *
 * 1. It hard-codes `from: "onboarding@resend.dev"`, and Resend delivers from
 *    that address **only to the Resend account owner's own inbox**. Every
 *    customer email sent today goes nowhere. The sender must come from a new
 *    `EMAIL_FROM` env var, documented in `.env.example`, and
 *    `clarivo-app.com` has to be verified as a sending domain in Resend.
 * 2. Missing `RESEND_API_KEY` or `EMAIL_FROM` logs a warning and skips the
 *    email. It must **never** block onboarding, the paywall or the webhook:
 *    "optional services degrade" and a customer who cannot finish signing up
 *    because an email could not be scheduled is a worse failure than a missing
 *    email.
 *
 * Until it is built both functions are no-ops that return null and log nothing,
 * so onboarding completes and the webhook answers 2xx exactly as they will
 * once it is real.
 */

/**
 * Schedules the trial-ended email and returns Resend's email id, or null when
 * email is not configured or scheduling failed.
 *
 * Callers store the id themselves, in the same statement that writes the trial
 * dates, so completing onboarding stays one write.
 */
export async function scheduleTrialEndedEmail(_args: {
  db: DbClient;
  companyId: string;
  trialEndsAt: Date;
}): Promise<string | null> {
  return null;
}

/**
 * Cancels a scheduled trial-ended email. Never throws: a failed cancel is a
 * logged annoyance, and throwing here would fail a webhook whose work is done.
 */
export async function cancelTrialEndedEmail(_args: {
  db: DbClient;
  companyId: string;
  emailId: string;
}): Promise<void> {
  return;
}
