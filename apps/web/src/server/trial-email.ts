import { and, eq, sql } from "drizzle-orm";
import { companies, users, type DbClient } from "@saas/db";
import { TRIAL_DAYS, TRIAL_SETTINGS_KEYS, entitlementOf, trialEndOf } from "@/lib/entitlement";
import { emailSender } from "@/lib/resend";
import { mergeCompanySettings } from "./company-settings";
import {
  TRIAL_ENDED_SUBJECT,
  trialEndedEmailHtml,
  trialEndedEmailText,
} from "./trial-ended-template";

/**
 * The trial-ended email: scheduling it, cancelling it, and sending it late.
 *
 * **One email, three ways in.** All three go through the two senders at the
 * bottom of this file, so the subject, the recipients and the body are written
 * once:
 *
 * 1. **Scheduled at onboarding completion** (`scheduleTrialEndedEmail`), with
 *    Resend's `scheduledAt` set to the trial end. This is the main path: Resend
 *    holds the message for the 14 days and sends it at the minute, which is
 *    something a daily cron cannot do.
 * 2. **Cancelled if they pay first** (`cancelTrialEndedEmail`), from the Polar
 *    webhook.
 * 3. **Sent by the cron** (`sendTrialEndedEmailNow`, driven by
 *    `app/api/cron/trial-ended/route.ts`) for a company whose schedule never
 *    happened — Resend unconfigured at completion, or the API call failed. That
 *    is a **backup, not the mechanism**: on Vercel's Hobby plan a cron runs once
 *    a day and only somewhere inside its scheduled hour, so a company can wait
 *    most of a day for it.
 *
 * **Nothing here may throw at its caller.** `scheduleTrialEndedEmail` is awaited
 * by onboarding and `cancelTrialEndedEmail` by the webhook, and neither of those
 * may fail for an email: a customer who cannot finish signing up because Resend
 * was down is a far worse failure than a missing email, and a webhook that
 * answers non-2xx is retried by Polar — ten times, after which Polar disables
 * the endpoint — for work that is already done. Every call is wrapped and every
 * failure is logged and swallowed. That is CLAUDE.md's "optional services
 * degrade, never break", applied to the two callers that cannot afford a
 * dependency.
 *
 * **The two settings keys, and which one means what.** Both are written here,
 * each **in one statement** through `server/company-settings.ts`, because
 * `companies.settings` is one jsonb column shared by seven features and a
 * read-modify-write of it loses a concurrent write to a *different* key —
 * billing state included. `routers/settings.ts` refuses both by name, so this
 * module and onboarding are the only writers.
 *
 * - `trialEndedEmailId` — Resend has the message queued. Set by the scheduler,
 *   and the thing `cancelTrialEndedEmail` needs. Its presence is also what stops
 *   the cron sending a second copy.
 * - `trialEndedEmailSentAt` — a message has actually gone out. Set by the cron,
 *   and by the cancel path (to `"cancelled"`-shaped state, see below).
 *
 * **Recipients are every `admin` of the company.** Not the manager who happened
 * to onboard, and not every member: choosing a plan is an admin's act, and
 * mailing a viewer about a payment they cannot make is noise. A company with no
 * admin row gets no email, which is logged rather than guessed around.
 */

/** Resend's `Idempotency-Key`, one per company. Two schedules for one company collapse. */
function idempotencyKeyFor(companyId: string): string {
  return `trial-ended/${companyId}`;
}

interface CompanyRow {
  id: string;
  name: string;
  settings: Record<string, unknown> | null;
}

/** The company and its settings, or null when the row has gone. */
async function companyOf(db: DbClient, companyId: string): Promise<CompanyRow | null> {
  const [row] = await db
    .select({ id: companies.id, name: companies.name, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row === undefined
    ? null
    : { id: row.id, name: row.name, settings: row.settings as Record<string, unknown> | null };
}

/**
 * Every admin's address in one company.
 *
 * Blank and whitespace-only addresses are dropped: `users.email` is populated by
 * `ensureUser` from Clerk and by `auth.inviteUser` from a form, and an empty
 * string sent to Resend fails the whole message rather than one recipient.
 */
async function adminEmailsOf(db: DbClient, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "admin")));
  return rows
    .map((row) => (typeof row.email === "string" ? row.email.trim() : ""))
    .filter((email) => email.length > 0);
}

/** Merges one or more trial keys into `companies.settings`, in one statement. */
async function writeTrialSettings(
  db: DbClient,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(companies)
    .set({ settings: mergeCompanySettings(patch), updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

/**
 * Schedules the trial-ended email and returns Resend's email id, or null when
 * email is not configured, nothing needed scheduling, or scheduling failed.
 *
 * It also **stores the id itself**, in one merge, so the guarantee holds whether
 * or not the caller does anything with the return value. A caller that folds the
 * returned id into its own write as well is writing the same key the same value,
 * which is harmless.
 *
 * **Finishing onboarding twice schedules nothing new**, for two independent
 * reasons, and it needs both: the `trialEndedEmailId` check below short-circuits
 * before Resend is called at all, and `idempotencyKey` makes Resend collapse the
 * request if the check somehow missed (two completions racing each other). The
 * key alone would not be enough — Resend's idempotency window is 24 hours, which
 * is shorter than a trial.
 *
 * `scheduledAt` is the trial end in ISO 8601, which is what Resend's API takes.
 * Resend accepts a schedule up to 30 days out, so 14 is comfortably inside it.
 */
export async function scheduleTrialEndedEmail(args: {
  db: DbClient;
  companyId: string;
  trialEndsAt: Date;
}): Promise<string | null> {
  const { db, companyId, trialEndsAt } = args;

  if (Number.isNaN(trialEndsAt.getTime())) {
    console.warn("[trial-email] not scheduling: trialEndsAt is not a date.");
    return null;
  }

  try {
    const company = await companyOf(db, companyId);
    if (company === null) {
      console.warn("[trial-email] not scheduling: no such company.");
      return null;
    }

    const existing = company.settings?.[TRIAL_SETTINGS_KEYS.trialEndedEmailId];
    if (typeof existing === "string" && existing.length > 0) {
      // Already queued at Resend. Returning the id rather than null so a caller
      // cannot tell "already done" from "failed" and retry it.
      return existing;
    }

    const sender = emailSender("the trial-ended email");
    if (sender === null) return null;

    const to = await adminEmailsOf(db, companyId);
    if (to.length === 0) {
      console.warn("[trial-email] not scheduling: the company has no admin to send to.");
      return null;
    }

    const input = { companyName: company.name, trialEndsAt, trialDays: TRIAL_DAYS };
    const result = await sender.resend.emails.send(
      {
        from: sender.from,
        to,
        subject: TRIAL_ENDED_SUBJECT,
        html: trialEndedEmailHtml(input),
        text: trialEndedEmailText(input),
        scheduledAt: trialEndsAt.toISOString(),
      },
      { idempotencyKey: idempotencyKeyFor(companyId) },
    );

    if (result.error || !result.data?.id) {
      // Reported, not swallowed into a success: the cron is the backup for
      // exactly this, and it finds the company precisely because no id was
      // stored.
      console.error("[trial-email] Resend refused the schedule:", result.error);
      return null;
    }

    await writeTrialSettings(db, companyId, {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: result.data.id,
    });
    return result.data.id;
  } catch (err) {
    // Onboarding completes regardless. The cron picks the company up.
    console.error("[trial-email] could not schedule the trial-ended email:", err);
    return null;
  }
}

/**
 * Cancels a scheduled trial-ended email, and records that it was cancelled.
 *
 * Never throws. The Polar webhook calls this after a payment has already been
 * recorded, so a failure here must not turn a successful delivery into a 500:
 * Polar would retry a delivery whose work is done, and ten failures disable the
 * endpoint.
 *
 * `trialEndedEmailId` is cleared and `trialEndedEmailSentAt` is set to
 * `"cancelled"` **only when Resend confirms the cancel**. If the cancel failed,
 * the id stays — so a later attempt still has something to cancel, and the cron
 * still sees a company it must not mail. Marking it cancelled on a failed cancel
 * would lose the id and leave a message in flight that nothing can stop.
 *
 * A message Resend has already sent cannot be cancelled and answers an error;
 * that is the normal outcome for a company that pays after its trial ended, and
 * it is logged at warning rather than error.
 */
export async function cancelTrialEndedEmail(args: {
  db: DbClient;
  companyId: string;
  emailId: string;
}): Promise<void> {
  const { db, companyId, emailId } = args;
  if (emailId.trim().length === 0) return;

  try {
    const sender = emailSender("cancelling the trial-ended email");
    if (sender === null) return;

    const result = await sender.resend.emails.cancel(emailId);
    if (result.error) {
      console.warn(
        `[trial-email] could not cancel ${emailId} (it may already have been sent):`,
        result.error,
      );
      return;
    }

    await writeTrialSettings(db, companyId, {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: null,
      [TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]: "cancelled",
    });
  } catch (err) {
    console.error("[trial-email] cancelling the trial-ended email failed:", err);
  }
}

/**
 * Cancels whatever is queued for this company, if anything is, by looking the id
 * up itself.
 *
 * This is the shape the Polar webhook needs: it knows a payment landed and which
 * company, not whether an email is queued. Keeping the lookup here means the
 * route does not read `companies.settings` a second time to find out.
 */
export async function cancelScheduledTrialEmailFor(db: DbClient, companyId: string): Promise<void> {
  try {
    const company = await companyOf(db, companyId);
    const emailId = company?.settings?.[TRIAL_SETTINGS_KEYS.trialEndedEmailId];
    if (typeof emailId !== "string" || emailId.length === 0) return;
    await cancelTrialEndedEmail({ db, companyId, emailId });
  } catch (err) {
    console.error("[trial-email] could not look up a scheduled email to cancel:", err);
  }
}

/**
 * Sends the trial-ended email **now** and records `trialEndedEmailSentAt`.
 *
 * The cron's sender. Returns what happened, so the route can report counts
 * rather than a bare 200: a cron whose body says `{ sent: 0 }` for a week is
 * readable, and one that says nothing is not.
 *
 * The write happens only on a confirmed send. A failure leaves the company
 * unmarked, so tomorrow's run tries again — which is the right default for a
 * once-a-day backup, and is why this does not record an attempt.
 */
export type TrialEndedSendResult =
  | { ok: true; emailId: string }
  | { ok: false; reason: "not_configured" | "no_admins" | "failed" };

export async function sendTrialEndedEmailNow(args: {
  db: DbClient;
  companyId: string;
  companyName: string;
  trialEndsAt: Date;
}): Promise<TrialEndedSendResult> {
  const { db, companyId, companyName, trialEndsAt } = args;

  const sender = emailSender("the trial-ended email");
  if (sender === null) return { ok: false, reason: "not_configured" };

  try {
    const to = await adminEmailsOf(db, companyId);
    if (to.length === 0) {
      console.warn(`[trial-email] ${companyId} has no admin to send to.`);
      return { ok: false, reason: "no_admins" };
    }

    const input = { companyName, trialEndsAt, trialDays: TRIAL_DAYS };
    const result = await sender.resend.emails.send(
      {
        from: sender.from,
        to,
        subject: TRIAL_ENDED_SUBJECT,
        html: trialEndedEmailHtml(input),
        text: trialEndedEmailText(input),
      },
      { idempotencyKey: idempotencyKeyFor(companyId) },
    );

    if (result.error || !result.data?.id) {
      console.error(`[trial-email] Resend refused the send for ${companyId}:`, result.error);
      return { ok: false, reason: "failed" };
    }

    await writeTrialSettings(db, companyId, {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]: new Date().toISOString(),
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: result.data.id,
    });
    return { ok: true, emailId: result.data.id };
  } catch (err) {
    console.error(`[trial-email] sending the trial-ended email for ${companyId} failed:`, err);
    return { ok: false, reason: "failed" };
  }
}

export interface TrialEndedCandidate {
  id: string;
  name: string;
  trialEndsAt: Date;
}

/**
 * The companies the cron should mail: trial over, no access, and no email
 * recorded either way.
 *
 * **The date test is in TypeScript, not in SQL, and that is deliberate.**
 * `trialEndOf()` takes the *earlier* of the stored `trialEndsAt` and
 * `trialStartedAt + TRIAL_DAYS`, so a company can be past its trial while its
 * start date is well inside the window — a SQL `trial_started_at < now - 14d`
 * filter would silently skip it. And `entitlementOf()` is the one authority on
 * access, shared with the paywall and with `memberProcedure`; re-expressing its
 * precedence (plan grant, then subscription status, then grace period, then the
 * trial) as a jsonb WHERE clause would be a second implementation of the thing
 * CLAUDE.md says must have exactly one.
 *
 * So SQL narrows on the two facts it can state exactly — a trial was started,
 * and neither email key is set — and the rest is `entitlementOf`. The narrowing
 * is what keeps this from reading every company in the table; the key tests are
 * `?` (jsonb key exists), which is also what makes "running it twice sends
 * nothing new" a property of the query rather than of the loop.
 *
 * `reason === "trial_ended"` only. A company whose *subscription* ended gets
 * nothing from here: the body says "your 14-day free trial ended", which would
 * be wrong, and the paywall already offers that company the portal.
 */
export async function trialEndedCandidates(
  db: DbClient,
  now: Date,
): Promise<TrialEndedCandidate[]> {
  const rows = await db
    .select({ id: companies.id, name: companies.name, settings: companies.settings })
    .from(companies)
    .where(
      sql`jsonb_typeof(${companies.settings}) = 'object'
        AND ${companies.settings} ? ${TRIAL_SETTINGS_KEYS.trialStartedAt}
        AND NOT (${companies.settings} ? ${TRIAL_SETTINGS_KEYS.trialEndedEmailId})
        AND NOT (${companies.settings} ? ${TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt})`,
    );

  const out: TrialEndedCandidate[] = [];
  for (const row of rows) {
    const settings = row.settings as Record<string, unknown> | null;
    const { access, reason } = entitlementOf(settings, now);
    if (access || reason !== "trial_ended") continue;
    const endsAt = trialEndOf(settings);
    if (endsAt === null) continue;
    out.push({ id: row.id, name: row.name, trialEndsAt: endsAt });
  }
  return out;
}
