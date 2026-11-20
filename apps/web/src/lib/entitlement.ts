import { parsePlan, type PlanId } from "./plans";

/**
 * Whether a company may use Clarivo, and why.
 *
 * **One function, pure, no imports from `server/`.** The banner is a client
 * component, the paywall is rendered from the server layout, `memberProcedure`
 * refuses data with it and the cron route picks companies with it. Four callers
 * answering the same question four ways is how a paywall comes to disagree with
 * the server that enforces it, so they all call this.
 *
 * It takes the settings object and `now` and returns nothing else — no database,
 * no clock of its own. That is what makes the table in
 * `test/entitlement.test.ts` able to state every status against both sides of
 * every date.
 */

/**
 * **The trial is 14 days and the number lives here.**
 *
 * Read by the stored end date, the entitlement check, the in-app banner, the
 * trial-ended email and the marketing copy. A second copy of "14" anywhere is a
 * second thing to forget: the headline that says 14 while the cap says 30 is
 * the failure this constant exists to prevent.
 */
export const TRIAL_DAYS = 14;

/** 14 × 24 hours, in milliseconds. Exact hours, not calendar days. */
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The settings keys that describe the trial, and **no form may write any of
 * them**. Named here so `routers/settings.ts` can refuse them by name and this
 * module can read them, without either side keeping its own list.
 *
 * Only three writers are allowed: completing onboarding, the email code, and
 * the Polar webhook.
 */
export const TRIAL_SETTINGS_KEYS = {
  onboardingCompletedAt: "onboardingCompletedAt",
  trialStartedAt: "trialStartedAt",
  trialEndsAt: "trialEndsAt",
  trialEndedEmailId: "trialEndedEmailId",
  trialEndedEmailSentAt: "trialEndedEmailSentAt",
} as const;

/** The same five, as a list, for the places that name them all. */
export const TRIAL_SETTINGS_KEY_NAMES = Object.values(TRIAL_SETTINGS_KEYS);

/**
 * Why a company does or does not have access.
 *
 * `trial_ended` and `subscription_ended` are the two the paywall renders
 * differently; the rest are reported for the sake of a readable test table and
 * a log line that says which branch fired.
 */
export type EntitlementReason =
  /** `plan` is enterprise or bureau — set by hand, never by a form. */
  | "plan_granted"
  /** A Polar subscription in `active` or `trialing`. */
  | "subscription_active"
  /** `past_due`: access continues, and the app asks for a new card. */
  | "subscription_past_due"
  /** Cancelled or revoked, but the period already paid for has not run out. */
  | "subscription_grace"
  /** Inside the 14 days. */
  | "trialing"
  /** The 14 days have run out and nothing was ever paid. */
  | "trial_ended"
  /** There was a subscription and it has ended. */
  | "subscription_ended"
  /** Onboarding was never completed, so no trial has started. */
  | "onboarding_incomplete";

export interface Entitlement {
  access: boolean;
  reason: EntitlementReason;
  /** When the trial ends, capped. Null once there is a subscription to read. */
  trialEndsAt: Date | null;
  /** True for `past_due` only: has access, and should be asked for a card. */
  paymentFailed: boolean;
}

/** A settings object as it comes out of the jsonb column: anything at all. */
export type CompanySettings = Record<string, unknown> | null | undefined;

function read(settings: CompanySettings, key: string): unknown {
  if (settings === null || typeof settings !== "object") return undefined;
  return (settings as Record<string, unknown>)[key];
}

/**
 * A stored timestamp, or null when it is absent or unparseable.
 *
 * These come from free-form jsonb, so a value can be anything a writer put
 * there — and `new Date(undefined)` is an Invalid Date, which compares false
 * against everything and would silently read as "trial not over". Null is the
 * honest answer and the callers treat it as "no date".
 */
function readDate(settings: CompanySettings, key: string): Date | null {
  const raw = read(settings, key);
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * When the trial ends: **the earlier of the stored date and 14 days from the
 * start.** Null when onboarding never completed.
 *
 * This is the cap, and it is the whole reason the stored date is not simply
 * read back. `trialEndsAt` is written by the app, but it is written into a
 * free-form jsonb column that a direct `UPDATE` can reach, and a trial that can
 * be extended by editing a row is not a 14-day trial. Taking the minimum means
 * no stored value can stretch it; a *shorter* stored date still wins, which is
 * the safe direction.
 */
export function trialEndOf(settings: CompanySettings): Date | null {
  const startedAt = readDate(settings, TRIAL_SETTINGS_KEYS.trialStartedAt);
  if (startedAt === null) return null;

  const cap = new Date(startedAt.getTime() + TRIAL_MS);
  const stored = readDate(settings, TRIAL_SETTINGS_KEYS.trialEndsAt);
  if (stored === null) return cap;
  return stored.getTime() < cap.getTime() ? stored : cap;
}

/**
 * Whether the company has finished onboarding.
 *
 * The app layout redirects on this, so it is deliberately the narrowest
 * possible question: is `onboardingCompletedAt` a date that parses? A company
 * that existed before this release has no such key, which is exactly right —
 * its admin goes through onboarding once, pre-filled, and nobody is locked out
 * on release day.
 */
export function onboardingCompleted(settings: CompanySettings): boolean {
  return readDate(settings, TRIAL_SETTINGS_KEYS.onboardingCompletedAt) !== null;
}

/** Days left in the trial, rounded up, or null when there is no trial. */
export function trialDaysLeft(settings: CompanySettings, now: Date): number | null {
  const endsAt = trialEndOf(settings);
  if (endsAt === null) return null;
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * The plans granted by hand rather than bought.
 *
 * Enterprise and Bureau are quoted and invoiced outside the app — there is no
 * checkout link for either — so a company on one of them has access without a
 * Polar subscription. `free` is **not** here: it is the default every company
 * reads before anything is set, so treating it as a grant would give everyone
 * access forever and the trial would never end.
 */
const PLANS_WITH_ACCESS: readonly PlanId[] = ["enterprise", "bureau"];

/**
 * Whether the company may use the app right now.
 *
 * The order of the branches is the order of precedence, and it matters: a
 * company that bought a plan during its trial is `subscription_active`, not
 * `trialing`, so its access does not stop when the 14 days run out.
 */
export function entitlementOf(settings: CompanySettings, now: Date): Entitlement {
  const trialEndsAt = trialEndOf(settings);
  const base = { trialEndsAt, paymentFailed: false };

  const plan = parsePlan(read(settings, "plan"));
  if (plan !== null && PLANS_WITH_ACCESS.includes(plan)) {
    return { ...base, access: true, reason: "plan_granted" };
  }

  const status = read(settings, "polarSubscriptionStatus");
  const subscriptionStatus = typeof status === "string" ? status.trim().toLowerCase() : null;

  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return { ...base, access: true, reason: "subscription_active" };
  }

  // Access continues: the card failed, the customer has not left. Taking the
  // app away on the first failed charge loses a customer who meant to pay.
  if (subscriptionStatus === "past_due") {
    return { ...base, access: true, reason: "subscription_past_due", paymentFailed: true };
  }

  // Cancelled or revoked, but the period already paid for has not run out yet.
  if (subscriptionStatus === "canceled" || subscriptionStatus === "revoked") {
    const periodEnd = readDate(settings, "polarCurrentPeriodEnd");
    if (periodEnd !== null && now.getTime() < periodEnd.getTime()) {
      return { ...base, access: true, reason: "subscription_grace" };
    }
    return { ...base, access: false, reason: "subscription_ended" };
  }

  // No subscription of any kind. The trial is all there is.
  if (trialEndsAt === null) {
    // Onboarding never finished, so no trial ever started. The layout sends
    // this user to `/onboarding`; the reason is separate from `trial_ended` so
    // the paywall never tells somebody their trial expired before it began.
    return { ...base, access: false, reason: "onboarding_incomplete" };
  }

  if (now.getTime() < trialEndsAt.getTime()) {
    return { ...base, access: true, reason: "trialing" };
  }

  // A subscription that existed and left a status we do not recognise as live
  // reads as an ended subscription rather than an ended trial, so the paywall
  // offers the portal instead of a first purchase.
  if (subscriptionStatus !== null) {
    return { ...base, access: false, reason: "subscription_ended" };
  }

  return { ...base, access: false, reason: "trial_ended" };
}
