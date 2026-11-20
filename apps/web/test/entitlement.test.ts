import { describe, it, expect } from "vitest";
import {
  TRIAL_DAYS,
  TRIAL_MS,
  TRIAL_SETTINGS_KEY_NAMES,
  entitlementOf,
  trialDaysLeft,
  trialEndOf,
  type CompanySettings,
} from "@/lib/entitlement";

/**
 * The entitlement function, stated as a table.
 *
 * It is the one answer to "may this company use Clarivo", and four places read
 * it: the layout that renders the paywall, `memberProcedure` that refuses data,
 * the in-app banner and the cron route that picks who to email. A paywall that
 * disagrees with the server enforcing it is the failure this covers, so the
 * table states every status against both sides of every date rather than
 * sampling the cases someone thought of.
 */

const COMPLETED = "2026-11-01T09:00:00.000Z";
const started = (iso: string): CompanySettings => ({
  onboardingCompletedAt: iso,
  trialStartedAt: iso,
  trialEndsAt: new Date(new Date(iso).getTime() + TRIAL_MS).toISOString(),
});
const at = (iso: string) => new Date(iso);
const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms);

describe("the 14-day cap", () => {
  it("is 14 days, and nothing else says otherwise", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  /**
   * The two cases the brief names, to the minute. 336 hours is the boundary and
   * it is exclusive: at exactly 336 hours the trial is over, because the end is
   * `started + TRIAL_MS` and access is `now < end`.
   */
  it("grants access at 335h59m and refuses it at 336h", () => {
    const settings = started(COMPLETED);
    const justInside = plus(COMPLETED, 335 * 60 * 60 * 1000 + 59 * 60 * 1000);
    const exactly = plus(COMPLETED, TRIAL_MS);

    expect(entitlementOf(settings, justInside).access).toBe(true);
    expect(entitlementOf(settings, justInside).reason).toBe("trialing");
    expect(entitlementOf(settings, exactly).access).toBe(false);
    expect(entitlementOf(settings, exactly).reason).toBe("trial_ended");
  });

  /**
   * **The cap is the point.** `trialEndsAt` lives in a free-form jsonb column a
   * direct `UPDATE` can reach, so a trial that a stored date could extend would
   * not be a 14-day trial at all. The minimum of the two is what makes it one.
   */
  it("ends the trial at 14 days even when the stored date says 30", () => {
    const settings: CompanySettings = {
      onboardingCompletedAt: COMPLETED,
      trialStartedAt: COMPLETED,
      trialEndsAt: plus(COMPLETED, 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    expect(trialEndOf(settings)?.toISOString()).toBe(plus(COMPLETED, TRIAL_MS).toISOString());
    expect(entitlementOf(settings, plus(COMPLETED, 15 * 24 * 60 * 60 * 1000)).access).toBe(false);
    expect(entitlementOf(settings, plus(COMPLETED, 20 * 24 * 60 * 60 * 1000)).reason).toBe(
      "trial_ended",
    );
  });

  /** A *shorter* stored date still wins. Cutting a trial short is the safe way to be wrong. */
  it("honours a stored date earlier than the cap", () => {
    const settings: CompanySettings = {
      trialStartedAt: COMPLETED,
      trialEndsAt: plus(COMPLETED, 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(entitlementOf(settings, plus(COMPLETED, 4 * 24 * 60 * 60 * 1000)).access).toBe(false);
  });

  /**
   * Junk in the column must not read as "trial still running". `new Date()` of
   * a bad value is an Invalid Date, which compares false against everything, so
   * an unguarded `now < trialEndsAt` would quietly grant access forever.
   */
  it.each([
    ["absent", {} as CompanySettings],
    ["null settings", null as CompanySettings],
    ["a non-object", "nonsense" as unknown as CompanySettings],
    ["an unparseable date", { trialStartedAt: "not a date" } as CompanySettings],
    ["a number for a date", { trialStartedAt: {} } as unknown as CompanySettings],
  ])("treats %s as no trial rather than an endless one", (_label, settings) => {
    expect(trialEndOf(settings)).toBeNull();
    const result = entitlementOf(settings, at("2030-01-01T00:00:00.000Z"));
    expect(result.access).toBe(false);
    expect(result.reason).toBe("onboarding_incomplete");
  });

  it("falls back to the cap when only the start is stored", () => {
    const settings: CompanySettings = { trialStartedAt: COMPLETED };
    expect(trialEndOf(settings)?.toISOString()).toBe(plus(COMPLETED, TRIAL_MS).toISOString());
  });
});

describe("every status, on both sides of its date", () => {
  const inTrial = plus(COMPLETED, 2 * 24 * 60 * 60 * 1000);
  const afterTrial = plus(COMPLETED, 20 * 24 * 60 * 60 * 1000);
  const periodEnd = plus(COMPLETED, 40 * 24 * 60 * 60 * 1000).toISOString();

  const withSubscription = (status: string, extra: Record<string, unknown> = {}) => ({
    ...started(COMPLETED),
    polarSubscriptionStatus: status,
    ...extra,
  });

  it.each([
    // status,       now,         access, reason
    ["active", afterTrial, true, "subscription_active"],
    ["trialing", afterTrial, true, "subscription_active"],
    ["past_due", afterTrial, true, "subscription_past_due"],
    ["ACTIVE", afterTrial, true, "subscription_active"],
    [" active ", afterTrial, true, "subscription_active"],
  ] as const)("%s keeps access after the trial (%s)", (status, now, access, reason) => {
    const result = entitlementOf(withSubscription(status), now);
    expect(result.access).toBe(access);
    expect(result.reason).toBe(reason);
  });

  it("flags past_due so the app can ask for a new card, without locking anyone out", () => {
    const result = entitlementOf(withSubscription("past_due"), afterTrial);
    expect(result.access).toBe(true);
    expect(result.paymentFailed).toBe(true);
    // Every other branch leaves it false, so a banner cannot appear by accident.
    expect(entitlementOf(withSubscription("active"), afterTrial).paymentFailed).toBe(false);
    expect(entitlementOf(started(COMPLETED), inTrial).paymentFailed).toBe(false);
  });

  it.each(["canceled", "revoked"] as const)(
    "%s keeps access until the paid period runs out, then ends",
    (status) => {
      const settings = withSubscription(status, { polarCurrentPeriodEnd: periodEnd });
      expect(entitlementOf(settings, afterTrial).access).toBe(true);
      expect(entitlementOf(settings, afterTrial).reason).toBe("subscription_grace");

      const after = plus(periodEnd, 1000);
      expect(entitlementOf(settings, after).access).toBe(false);
      expect(entitlementOf(settings, after).reason).toBe("subscription_ended");
    },
  );

  it.each(["canceled", "revoked"] as const)(
    "%s with no period end on record ends access at once",
    (status) => {
      const result = entitlementOf(withSubscription(status), afterTrial);
      expect(result.access).toBe(false);
      expect(result.reason).toBe("subscription_ended");
    },
  );

  /**
   * A subscription that left an unrecognised status reads as an **ended
   * subscription**, not an ended trial, so the paywall offers the billing
   * portal rather than a first purchase.
   */
  it("reports an unknown status after the trial as a subscription that ended", () => {
    const result = entitlementOf(withSubscription("incomplete_expired"), afterTrial);
    expect(result.access).toBe(false);
    expect(result.reason).toBe("subscription_ended");
  });

  /** During the trial the trial is what grants access, whatever the status says. */
  it("still grants access during the trial when a subscription has not started", () => {
    expect(entitlementOf(withSubscription("incomplete"), inTrial).access).toBe(true);
    expect(entitlementOf(started(COMPLETED), inTrial).reason).toBe("trialing");
  });
});

describe("plans granted by hand", () => {
  it.each(["enterprise", "bureau"] as const)("%s has access with no subscription", (plan) => {
    const settings: CompanySettings = { plan };
    const result = entitlementOf(settings, at("2030-01-01T00:00:00.000Z"));
    expect(result.access).toBe(true);
    expect(result.reason).toBe("plan_granted");
  });

  /**
   * **`free` is not a grant.** It is the value every company reads before
   * anything is set, so treating it as one would give the whole customer base
   * permanent access and the trial would never end for anybody.
   */
  it.each(["free", "starter", "growth"] as const)("%s is not a grant", (plan) => {
    const result = entitlementOf({ ...started(COMPLETED), plan }, plus(COMPLETED, TRIAL_MS));
    expect(result.access).toBe(false);
    expect(result.reason).toBe("trial_ended");
  });

  it("ignores a plan value the vocabulary does not know", () => {
    const result = entitlementOf({ plan: "platinum" }, at("2030-01-01T00:00:00.000Z"));
    expect(result.access).toBe(false);
  });
});

describe("days left, for the banner", () => {
  it("counts down, rounds up, and floors at zero", () => {
    const settings = started(COMPLETED);
    expect(trialDaysLeft(settings, at(COMPLETED))).toBe(14);
    expect(trialDaysLeft(settings, plus(COMPLETED, 7 * 24 * 60 * 60 * 1000))).toBe(7);
    // Part of a day still reads as a day: "1 day left" on the final afternoon.
    expect(trialDaysLeft(settings, plus(COMPLETED, TRIAL_MS - 60 * 1000))).toBe(1);
    expect(trialDaysLeft(settings, plus(COMPLETED, TRIAL_MS))).toBe(0);
    expect(trialDaysLeft(settings, plus(COMPLETED, 99 * 24 * 60 * 60 * 1000))).toBe(0);
  });

  it("has nothing to count without a trial", () => {
    expect(trialDaysLeft({}, at(COMPLETED))).toBeNull();
  });
});

describe("the server-only keys", () => {
  /**
   * Named in one place so `routers/settings.ts` can refuse them by name and
   * this module can read them without either side keeping its own list. A key
   * that drifted out of the refusal list would be writable from the company
   * settings form, and `trialEndsAt` is the one that matters.
   */
  it("are the five the trial depends on", () => {
    expect(TRIAL_SETTINGS_KEY_NAMES).toEqual([
      "onboardingCompletedAt",
      "trialStartedAt",
      "trialEndsAt",
      "trialEndedEmailId",
      "trialEndedEmailSentAt",
    ]);
  });
});
