import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";

/**
 * The trial-ended email: scheduling it, not scheduling it twice, cancelling it
 * when a payment lands, and whom it goes to.
 *
 * **Resend is mocked, and the mock records the whole call** rather than just
 * that one happened. The three things most worth asserting are all arguments
 * rather than outcomes: `scheduledAt` has to be the trial end (a wrong value
 * sends the email on the wrong day, and nothing would notice for two weeks),
 * `idempotencyKey` has to be per company, and the recipients have to be the
 * admins and only the admins.
 *
 * **It also pins the sender bug.** `lib/resend.ts` hard-coded
 * `from: "onboarding@resend.dev"`, which Resend delivers **only to the Resend
 * account owner's own inbox** — so every customer email the app sent returned a
 * 200 and an id and reached nobody. The address now comes from `EMAIL_FROM`, and
 * the test below is that nothing sends without it.
 */

/**
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every `const` in
 * this file: a plain top-level array referenced inside the factory is still in
 * its temporal dead zone when `@/lib/resend` imports "resend".
 */
const resend = vi.hoisted(() => ({
  sent: [] as { payload: Record<string, unknown>; options: Record<string, unknown> }[],
  cancelled: [] as string[],
  sendResult: { data: { id: "email_scheduled_1" }, error: null } as unknown,
  cancelResult: { data: { object: "email", id: "email_scheduled_1" }, error: null } as unknown,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, options: Record<string, unknown> = {}) => {
        resend.sent.push({ payload, options });
        return resend.sendResult;
      },
      cancel: async (id: string) => {
        resend.cancelled.push(id);
        return resend.cancelResult;
      },
    };
  },
}));

const { emailFrom, isEmailConfigured } = await import("@/lib/resend");
const {
  cancelScheduledTrialEmailFor,
  cancelTrialEndedEmail,
  scheduleTrialEndedEmail,
  sendTrialEndedEmailNow,
  trialEndedCandidates,
} = await import("@/server/trial-email");
const { TRIAL_DAYS, TRIAL_MS, TRIAL_SETTINGS_KEYS } = await import("@/lib/entitlement");
const template = await import("@/server/trial-ended-template");

const FROM = "Clarivo <hello@clarivo-app.com>";

let ctx: TestDb;

/** A company with two admins, one manager and one viewer. */
async function seedCompany(name: string, settings: Record<string, unknown>): Promise<string> {
  const res = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code, settings)
    VALUES (${name}, ${name.toLowerCase().replace(/\W+/g, "-")}, 'EUR', ${JSON.stringify(settings)}::jsonb)
    RETURNING id
  `);
  const companyId = (res.rows[0] as { id: string }).id;

  const people: [string, string][] = [
    ["admin", "ada"],
    ["admin", "abe"],
    ["manager", "mo"],
    ["viewer", "vic"],
  ];
  for (const [role, who] of people) {
    await ctx.db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${who}@${companyId}.test`}, ${who}, ${role}, ${`clerk_${who}_${companyId}`})
    `);
  }
  return companyId;
}

async function settingsOf(companyId: string): Promise<Record<string, unknown>> {
  const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
  return (res.rows[0] as { settings: Record<string, unknown> }).settings;
}

/** Settings for a company whose 14 days ran out `daysAgo` days ago. */
function endedTrial(daysAgo: number): Record<string, unknown> {
  const startedAt = new Date(Date.now() - TRIAL_MS - daysAgo * 24 * 60 * 60 * 1000);
  return {
    onboardingCompletedAt: startedAt.toISOString(),
    trialStartedAt: startedAt.toISOString(),
    trialEndsAt: new Date(startedAt.getTime() + TRIAL_MS).toISOString(),
  };
}

/** Settings for a company whose trial is still running. */
function liveTrial(): Record<string, unknown> {
  const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return {
    onboardingCompletedAt: startedAt.toISOString(),
    trialStartedAt: startedAt.toISOString(),
    trialEndsAt: new Date(startedAt.getTime() + TRIAL_MS).toISOString(),
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(() => {
  resend.sent.length = 0;
  resend.cancelled.length = 0;
  resend.sendResult = { data: { id: "email_scheduled_1" }, error: null };
  resend.cancelResult = { data: { object: "email", id: "email_scheduled_1" }, error: null };
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", FROM);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the sender, which used to go nowhere", () => {
  /**
   * The bug this replaced, stated as a test. `onboarding@resend.dev` is Resend's
   * shared test sender: deliveries to anyone but the Resend account owner are
   * dropped, and the API still answers 200 with an id. A grep is the right
   * assertion because the failure mode is a literal, not a behaviour.
   */
  it("no longer hard-codes onboarding@resend.dev anywhere in src/", () => {
    const src = path.resolve(import.meta.dirname, "../src");
    const offenders: string[] = [];

    /**
     * Comments are prose *about* the address — `lib/resend.ts` explains the bug
     * at length — not uses of it. Stripped the same way
     * `design-system.test.ts` strips them before looking for a colour.
     */
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        // `api/test-resend` is a hand-run probe that posts to Resend's own test
        // inbox, not customer email. What must not happen is a *sender* fixed in
        // the code that mails customers.
        if (full.includes("test-resend")) continue;
        if (stripComments(fs.readFileSync(full, "utf8")).includes("onboarding@resend.dev")) {
          offenders.push(path.relative(src, full).split(path.sep).join("/"));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });

  it("reads the address from EMAIL_FROM, with no fallback", () => {
    expect(emailFrom()).toBe(FROM);
    vi.stubEnv("EMAIL_FROM", "");
    expect(emailFrom()).toBeNull();
    expect(isEmailConfigured()).toBe(false);
  });
});

describe("scheduling at onboarding completion", () => {
  it("schedules one email at the trial end and stores its id", async () => {
    const trialEndsAt = new Date(Date.now() + TRIAL_MS);
    const companyId = await seedCompany("Scheduler Co", {
      onboardingCompletedAt: new Date().toISOString(),
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
    });

    const id = await scheduleTrialEndedEmail({ db: ctx.db, companyId, trialEndsAt });

    expect(id).toBe("email_scheduled_1");
    expect(resend.sent).toHaveLength(1);

    const { payload, options } = resend.sent[0]!;
    // The value that would otherwise be wrong for a fortnight before anyone saw it.
    expect(payload.scheduledAt).toBe(trialEndsAt.toISOString());
    expect(options.idempotencyKey).toBe(`trial-ended/${companyId}`);
    expect(payload.from).toBe(FROM);
    expect(payload.subject).toBe("Your Clarivo free trial has ended");
    // Both parts, always: a message with no text part reads as nothing in a
    // plain-text client and scores badly with spam filters.
    expect(typeof payload.html).toBe("string");
    expect(typeof payload.text).toBe("string");
    expect(payload.html).toContain("Scheduler Co");

    expect((await settingsOf(companyId))[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBe(
      "email_scheduled_1",
    );
  });

  /** Admins only. Mailing a viewer about a payment they cannot make is noise. */
  it("sends to every admin and to nobody else", async () => {
    const trialEndsAt = new Date(Date.now() + TRIAL_MS);
    const companyId = await seedCompany("Recipients Co", {});
    await scheduleTrialEndedEmail({ db: ctx.db, companyId, trialEndsAt });

    const to = resend.sent[0]!.payload.to as string[];
    expect(to).toHaveLength(2);
    expect(to.every((address) => address.startsWith("ada@") || address.startsWith("abe@"))).toBe(
      true,
    );
  });

  /**
   * Finishing onboarding twice must not queue a second email. Two independent
   * guards do it — the stored id short-circuits before Resend is called, and
   * `idempotencyKey` would collapse the request if the check were somehow missed
   * — and this asserts the first, which is the one that holds past Resend's
   * 24-hour idempotency window.
   */
  it("schedules nothing new the second time, and returns the same id", async () => {
    const trialEndsAt = new Date(Date.now() + TRIAL_MS);
    const companyId = await seedCompany("Twice Co", {});

    const first = await scheduleTrialEndedEmail({ db: ctx.db, companyId, trialEndsAt });
    const second = await scheduleTrialEndedEmail({ db: ctx.db, companyId, trialEndsAt });

    expect(resend.sent).toHaveLength(1);
    expect(second).toBe(first);
  });

  /**
   * "Optional services degrade, never break." Onboarding awaits this, and a
   * customer who cannot finish signing up because Resend is unconfigured is a
   * far worse failure than a missing email.
   */
  it.each(["RESEND_API_KEY", "EMAIL_FROM"] as const)(
    "returns null and sends nothing with %s unset, without throwing",
    async (missing) => {
      vi.stubEnv(missing, "");
      const companyId = await seedCompany(`No ${missing}`, {});

      const id = await scheduleTrialEndedEmail({
        db: ctx.db,
        companyId,
        trialEndsAt: new Date(Date.now() + TRIAL_MS),
      });

      expect(id).toBeNull();
      expect(resend.sent).toHaveLength(0);
      // Nothing recorded, so the cron will pick this company up — which is the
      // whole reason the cron exists.
      expect(await settingsOf(companyId)).not.toHaveProperty(
        TRIAL_SETTINGS_KEYS.trialEndedEmailId,
      );
    },
  );

  it("records nothing when Resend refuses the schedule", async () => {
    resend.sendResult = { data: null, error: { message: "rate limited", name: "rate_limit" } };
    const companyId = await seedCompany("Refused Co", {});

    const id = await scheduleTrialEndedEmail({
      db: ctx.db,
      companyId,
      trialEndsAt: new Date(Date.now() + TRIAL_MS),
    });

    expect(id).toBeNull();
    expect(await settingsOf(companyId)).not.toHaveProperty(TRIAL_SETTINGS_KEYS.trialEndedEmailId);
  });

  it("does not schedule for a company with no admin", async () => {
    const res = await ctx.db.execute(sql`
      INSERT INTO companies (name, slug, currency_code) VALUES ('Lonely', 'lonely', 'EUR')
      RETURNING id
    `);
    const companyId = (res.rows[0] as { id: string }).id;

    const id = await scheduleTrialEndedEmail({
      db: ctx.db,
      companyId,
      trialEndsAt: new Date(Date.now() + TRIAL_MS),
    });

    expect(id).toBeNull();
    expect(resend.sent).toHaveLength(0);
  });
});

describe("cancelling when they pay first", () => {
  it("cancels the stored email and records that it was cancelled", async () => {
    const companyId = await seedCompany("Payer Co", {
      ...liveTrial(),
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_scheduled_1",
    });

    await cancelScheduledTrialEmailFor(ctx.db, companyId);

    expect(resend.cancelled).toEqual(["email_scheduled_1"]);
    const after = await settingsOf(companyId);
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBeNull();
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]).toBe("cancelled");
    // The neighbouring keys of the same jsonb column are untouched: the write is
    // a `jsonb ||` merge, not a read-modify-write.
    expect(after.trialStartedAt).toBeTruthy();
  });

  it("does nothing when there is no email to cancel", async () => {
    const companyId = await seedCompany("Nothing Queued Co", liveTrial());
    await cancelScheduledTrialEmailFor(ctx.db, companyId);
    expect(resend.cancelled).toHaveLength(0);
  });

  /**
   * The case that must not fail the webhook's response: Resend refuses a cancel
   * for a message it has already sent. The id is deliberately **left in place**
   * — losing it would leave a message in flight that nothing can stop, and
   * would also let the cron send a second one.
   */
  it("keeps the id and never throws when Resend refuses the cancel", async () => {
    resend.cancelResult = { data: null, error: { message: "already sent", name: "not_found" } };
    const companyId = await seedCompany("Too Late Co", {
      ...endedTrial(1),
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_scheduled_1",
    });

    await expect(
      cancelTrialEndedEmail({ db: ctx.db, companyId, emailId: "email_scheduled_1" }),
    ).resolves.toBeUndefined();

    const after = await settingsOf(companyId);
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBe("email_scheduled_1");
    expect(after).not.toHaveProperty(TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt);
  });

  it("never throws when email is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      cancelTrialEndedEmail({ db: ctx.db, companyId: "x", emailId: "email_1" }),
    ).resolves.toBeUndefined();
  });
});

describe("the candidates the cron picks", () => {
  it("takes an ended trial with no email recorded, and nothing else", async () => {
    const ended = await seedCompany("Ended Co", endedTrial(1));
    const live = await seedCompany("Live Co", liveTrial());
    const paid = await seedCompany("Paid Co", {
      ...endedTrial(1),
      polarSubscriptionStatus: "active",
    });
    const granted = await seedCompany("Granted Co", { ...endedTrial(1), plan: "enterprise" });
    const scheduled = await seedCompany("Scheduled Co", {
      ...endedTrial(1),
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_x",
    });
    const alreadySent = await seedCompany("Sent Co", {
      ...endedTrial(1),
      [TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]: new Date().toISOString(),
    });
    const neverOnboarded = await seedCompany("Never Co", {});

    const ids = (await trialEndedCandidates(ctx.db, new Date())).map((c) => c.id);

    expect(ids).toContain(ended);
    for (const other of [live, paid, granted, scheduled, alreadySent, neverOnboarded]) {
      expect(ids).not.toContain(other);
    }
  });

  /**
   * The reason the date test is in TypeScript rather than SQL: `trialEndOf()`
   * takes the **earlier** of the stored date and `trialStartedAt + 14 days`, so
   * a company can be past its trial while its start date is well inside the
   * window. A `trial_started_at < now - 14d` WHERE clause would skip this one.
   */
  it("takes a company whose stored end date is shorter than the 14-day cap", async () => {
    const startedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const shortened = await seedCompany("Shortened Co", {
      onboardingCompletedAt: startedAt.toISOString(),
      trialStartedAt: startedAt.toISOString(),
      trialEndsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const ids = (await trialEndedCandidates(ctx.db, new Date())).map((c) => c.id);
    expect(ids).toContain(shortened);
  });

  /**
   * A company whose *subscription* ended gets nothing from here: the body says
   * "your 14-day free trial ended", which would be false, and the paywall
   * already offers that company the Polar portal instead.
   */
  it("leaves an ended subscription alone", async () => {
    const subscriptionEnded = await seedCompany("Lapsed Co", {
      ...endedTrial(1),
      polarSubscriptionStatus: "revoked",
      polarCurrentPeriodEnd: new Date(Date.now() - 1000).toISOString(),
    });
    const ids = (await trialEndedCandidates(ctx.db, new Date())).map((c) => c.id);
    expect(ids).not.toContain(subscriptionEnded);
  });
});

describe("sending it late, which is what the cron does", () => {
  it("sends with no scheduledAt and records when it went", async () => {
    const companyId = await seedCompany("Late Co", endedTrial(2));
    const trialEndsAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const result = await sendTrialEndedEmailNow({
      db: ctx.db,
      companyId,
      companyName: "Late Co",
      trialEndsAt,
    });

    expect(result).toEqual({ ok: true, emailId: "email_scheduled_1" });
    expect(resend.sent).toHaveLength(1);
    expect(resend.sent[0]!.payload).not.toHaveProperty("scheduledAt");

    const after = await settingsOf(companyId);
    expect(typeof after[TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]).toBe("string");
    // Both keys, so neither the cron nor a later schedule sends a second copy.
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBe("email_scheduled_1");
  });

  it("records nothing when the send fails, so tomorrow tries again", async () => {
    resend.sendResult = { data: null, error: { message: "nope", name: "application_error" } };
    const companyId = await seedCompany("Fails Co", endedTrial(2));

    const result = await sendTrialEndedEmailNow({
      db: ctx.db,
      companyId,
      companyName: "Fails Co",
      trialEndsAt: new Date(),
    });

    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(await settingsOf(companyId)).not.toHaveProperty(
      TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt,
    );
  });
});

describe("the template", () => {
  const input = {
    companyName: "Acme & Co <Ltd>",
    trialEndsAt: new Date("2026-10-14T09:00:00Z"),
    trialDays: TRIAL_DAYS,
  };

  it("states the trial length from TRIAL_DAYS, never a retyped 14", () => {
    const html = template.trialEndedEmailHtml(input);
    expect(html).toContain(`${TRIAL_DAYS}-day free trial`);
    expect(template.trialEndedEmailText(input)).toContain(`${TRIAL_DAYS}-day free trial`);
  });

  it("writes the date as 14 Oct 2026, in UTC", () => {
    expect(template.trialEndedEmailHtml(input)).toContain("14 Oct 2026");
  });

  /** The company name is text a customer typed, so it reaches the HTML escaped. */
  it("escapes the company name", () => {
    const html = template.trialEndedEmailHtml(input);
    expect(html).toContain("Acme &amp; Co &lt;Ltd&gt;");
    expect(html).not.toContain("<Ltd>");
  });

  it("says the data is safe and offers one action", () => {
    for (const body of [
      template.trialEndedEmailHtml(input),
      template.trialEndedEmailText(input),
    ]) {
      expect(body).toContain("Your data is safe.");
      expect(body).toContain("Choose a plan to keep using Clarivo.");
      expect(body).toContain("https://www.clarivo-app.com/settings/billing");
    }
  });

  /**
   * An email client is not a browser: Gmail's web client strips `<style>` and
   * every custom property with it, so a `var(--cv-…)` colour renders as nothing.
   * This is the assertion behind the `design-system.test.ts` exemption.
   */
  it("uses no CSS custom properties, because email clients drop them", () => {
    expect(template.trialEndedEmailHtml(input)).not.toContain("var(--");
  });
});
