import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";

/**
 * `GET /api/cron/trial-ended`, the backup path for the trial-ended email.
 *
 * Three things are pinned, and the first two matter more than the third because
 * this is a route that mails customers and sits on a path Clerk's middleware
 * treats as public:
 *
 * 1. **Who may call it.** A wrong or missing bearer is 401. **No `CRON_SECRET`
 *    configured at all is 503 and the route does nothing** — the shape
 *    `api/webhooks/polar` uses for a missing signing secret. A cron route that
 *    cannot authenticate its caller must not act on the request, and answering
 *    401 for an unconfigured deployment would blame the caller for the
 *    deployment's state.
 * 2. **Running it twice sends nothing new.** The idempotency is in the candidate
 *    query — neither `trialEndedEmailId` nor `trialEndedEmailSentAt` may exist
 *    as a key — and the sender writes both, so the second run's list is empty.
 * 3. The counts in the body, so a run is readable from a log.
 *
 * `/api/cron/(.*)` being in `lib/public-routes.ts` is asserted elsewhere, in
 * `test/public-routes.test.ts`.
 */

const resend = vi.hoisted(() => ({
  sent: [] as { payload: Record<string, unknown> }[],
  sendResult: { data: { id: "email_cron_1" }, error: null } as unknown,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        resend.sent.push({ payload });
        return resend.sendResult;
      },
      cancel: async () => ({ data: null, error: null }),
    };
  },
}));

/**
 * `requireDb()` reads `DATABASE_URL`, so a route handler cannot be handed a test
 * database the way a tRPC procedure can through `ctx.db`. The real module is
 * imported and only that one export is swapped, so every schema table the route
 * reaches through `server/trial-email.ts` is still the real one.
 *
 * The holder is filled in `beforeAll`; `requireDb` is not called until a request
 * is served, which is well after that.
 */
const injected = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@saas/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@saas/db")>();
  return { ...actual, requireDb: () => injected.db };
});

const { GET } = await import("@/app/api/cron/trial-ended/route");
const { TRIAL_MS, TRIAL_SETTINGS_KEYS } = await import("@/lib/entitlement");

const SECRET = "a-long-random-cron-secret-value";

let ctx: TestDb;

function request(authorization?: string): Request {
  return new Request("https://app.test/api/cron/trial-ended", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

async function seedCompany(name: string, settings: Record<string, unknown>): Promise<string> {
  const res = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code, settings)
    VALUES (${name}, ${name.toLowerCase().replace(/\W+/g, "-")}, 'EUR', ${JSON.stringify(settings)}::jsonb)
    RETURNING id
  `);
  const companyId = (res.rows[0] as { id: string }).id;
  await ctx.db.execute(sql`
    INSERT INTO users (company_id, email, name, role, clerk_user_id)
    VALUES (${companyId}, ${`admin@${companyId}.test`}, 'admin', 'admin', ${`clerk_${companyId}`})
  `);
  return companyId;
}

async function settingsOf(companyId: string): Promise<Record<string, unknown>> {
  const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
  return (res.rows[0] as { settings: Record<string, unknown> }).settings;
}

/** A company whose 14 days ran out a day ago. */
function endedTrial(): Record<string, unknown> {
  const startedAt = new Date(Date.now() - TRIAL_MS - 24 * 60 * 60 * 1000);
  return {
    onboardingCompletedAt: startedAt.toISOString(),
    trialStartedAt: startedAt.toISOString(),
    trialEndsAt: new Date(startedAt.getTime() + TRIAL_MS).toISOString(),
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
  injected.db = ctx.db;
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

/**
 * One empty table per test. The route's answer is a count over **every**
 * company, so a company seeded by an earlier test is part of the next test's
 * candidate list — which is also exactly the behaviour being asserted, and so
 * cannot be worked around by scoping the assertion.
 */
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE companies CASCADE`);
  resend.sent.length = 0;
  resend.sendResult = { data: { id: "email_cron_1" }, error: null };
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Clarivo <hello@clarivo-app.com>");
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("who may call it", () => {
  /**
   * The difference that matters. With no secret the route cannot tell Vercel's
   * scheduler from anyone who found the path, so it refuses every request —
   * including, deliberately, one carrying a bearer. "Optional services degrade"
   * does not stretch to an unauthenticated endpoint that mails customers.
   */
  it("answers 503 and does nothing when no CRON_SECRET is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const companyId = await seedCompany("No Secret Co", endedTrial());

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(503);
    expect(resend.sent).toHaveLength(0);
    expect(await settingsOf(companyId)).not.toHaveProperty(
      TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt,
    );
  });

  it.each([
    ["a wrong secret", "Bearer not-the-secret"],
    ["a right-length wrong secret", `Bearer ${"x".repeat(SECRET.length)}`],
    ["no Bearer prefix", SECRET],
    ["an empty bearer", "Bearer "],
  ])("answers 401 for %s", async (_name, header) => {
    const response = await GET(request(header));
    expect(response.status).toBe(401);
    expect(resend.sent).toHaveLength(0);
  });

  it("answers 401 with no Authorization header at all", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(resend.sent).toHaveLength(0);
  });
});

describe("what it sends", () => {
  it("mails an ended trial with no email recorded, and records that it went", async () => {
    const companyId = await seedCompany("Cron Ended Co", endedTrial());

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = (await response.json()) as { sent: number; candidates: number };

    expect(response.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(resend.sent).toHaveLength(1);
    expect(resend.sent[0]!.payload.subject).toBe("Your Clarivo free trial has ended");
    // Sent now, not scheduled: the schedule is the path this one is backing up.
    expect(resend.sent[0]!.payload).not.toHaveProperty("scheduledAt");

    const after = await settingsOf(companyId);
    expect(typeof after[TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]).toBe("string");
  });

  /** The whole point of the two keys. */
  it("sends once when run twice", async () => {
    await seedCompany("Twice Cron Co", endedTrial());

    const first = await GET(request(`Bearer ${SECRET}`));
    expect(((await first.json()) as { sent: number }).sent).toBe(1);
    expect(resend.sent).toHaveLength(1);

    const second = await GET(request(`Bearer ${SECRET}`));
    const body = (await second.json()) as { sent: number; candidates: number };
    expect(body.candidates).toBe(0);
    expect(body.sent).toBe(0);
    expect(resend.sent).toHaveLength(1);
  });

  it("skips a company that has access", async () => {
    await seedCompany("Cron Paid Co", { ...endedTrial(), polarSubscriptionStatus: "active" });
    await seedCompany("Cron Granted Co", { ...endedTrial(), plan: "bureau" });

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(((await response.json()) as { candidates: number }).candidates).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it("skips a company whose trial is still running", async () => {
    const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await seedCompany("Cron Live Co", {
      onboardingCompletedAt: startedAt.toISOString(),
      trialStartedAt: startedAt.toISOString(),
      trialEndsAt: new Date(startedAt.getTime() + TRIAL_MS).toISOString(),
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(((await response.json()) as { candidates: number }).candidates).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  /**
   * Resend unconfigured is not an error for this route: it reports the company
   * as skipped, records nothing, and tomorrow's run tries again. Blocking or
   * 500ing would make an optional service a hard dependency of a cron.
   */
  it("reports a skip rather than failing when email is unconfigured", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const companyId = await seedCompany("Cron Unconfigured Co", endedTrial());

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = (await response.json()) as { sent: number; skipped: number };

    expect(response.status).toBe(200);
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(await settingsOf(companyId)).not.toHaveProperty(
      TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt,
    );
  });
});
