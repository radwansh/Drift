import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";

/**
 * `POST /api/webhooks/polar`, end to end against real Postgres: a signed,
 * sandbox-shaped delivery moving a company from `trial_ended` to access, and
 * cancelling the scheduled trial-ended email on the way.
 *
 * `test/polar-webhook.test.ts` covers the signature algorithm and the
 * event-to-patch mapping as pure functions. This covers the **route**, which is
 * where the three things that only exist at the transport level live:
 *
 * 1. The write and the entitlement it produces. A company whose trial has ended
 *    must come out of this with `entitlementOf()` saying access — that is the
 *    only event that takes the paywall down, and the paywall is deliberately
 *    unable to decide it for itself.
 * 2. **The email cancel, and that a failing cancel cannot fail the response.**
 *    Polar retries a non-2xx, and ten failures disable the endpoint — for work
 *    that is already committed.
 * 3. Replays and unknown references changing nothing.
 */

const resend = vi.hoisted(() => ({
  cancelled: [] as string[],
  cancelResult: { data: { object: "email" }, error: null } as unknown,
  throwOnCancel: false,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async () => ({ data: { id: "email_x" }, error: null }),
      cancel: async (id: string) => {
        resend.cancelled.push(id);
        if (resend.throwOnCancel) throw new Error("Resend is down");
        return resend.cancelResult;
      },
    };
  },
}));

const injected = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@saas/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@saas/db")>();
  return { ...actual, requireDb: () => injected.db };
});

const { POST } = await import("@/app/api/webhooks/polar/route");
const { entitlementOf, TRIAL_MS, TRIAL_SETTINGS_KEYS } = await import("@/lib/entitlement");

/** A `whsec_` secret of Polar's current scheme: base64 after the prefix. */
const SECRET = `whsec_${Buffer.from("a-secret-of-at-least-24-bytes!!").toString("base64")}`;

let ctx: TestDb;

/**
 * A delivery signed the way Polar signs one: HMAC-SHA256 over
 * `{id}.{timestamp}.{body}`, base64, with the key being the decoded base64 body
 * of the secret.
 */
function signed(payload: unknown, id = `msg_${Math.random().toString(36).slice(2)}`): Request {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");

  return new Request("https://app.test/api/webhooks/polar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}

async function seedEndedTrial(
  name: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const startedAt = new Date(Date.now() - TRIAL_MS - 24 * 60 * 60 * 1000);
  const res = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code, settings)
    VALUES (${name}, ${name.toLowerCase().replace(/\W+/g, "-")}, 'EUR', ${JSON.stringify({
      onboardingCompletedAt: startedAt.toISOString(),
      trialStartedAt: startedAt.toISOString(),
      trialEndsAt: new Date(startedAt.getTime() + TRIAL_MS).toISOString(),
      fiscalStartMonth: 7,
      ...extra,
    })}::jsonb)
    RETURNING id
  `);
  return (res.rows[0] as { id: string }).id;
}

async function settingsOf(companyId: string): Promise<Record<string, unknown>> {
  const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
  return (res.rows[0] as { settings: Record<string, unknown> }).settings;
}

/**
 * Polar's sandbox `order.paid`, trimmed to the fields the app reads. Polar sends
 * far more and adds more over time, which is why the schema is loose.
 */
function orderPaid(companyId: string) {
  return {
    type: "order.paid",
    data: {
      id: "ord_sandbox_1",
      customer_id: "cus_sandbox_1",
      product_id: "prod_starter_sandbox",
      metadata: { reference_id: companyId },
      customer: { external_id: null },
      subscription: {
        id: "sub_sandbox_1",
        status: "active",
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        customer_id: "cus_sandbox_1",
        product_id: "prod_starter_sandbox",
        metadata: { reference_id: companyId },
      },
    },
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
  injected.db = ctx.db;
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(() => {
  resend.cancelled.length = 0;
  resend.cancelResult = { data: { object: "email" }, error: null };
  resend.throwOnCancel = false;
  vi.stubEnv("POLAR_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("POLAR_PRODUCT_ID_STARTER", "prod_starter_sandbox");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Clarivo <hello@clarivo-app.com>");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a signed delivery moves a company out of the paywall", () => {
  it("turns trial_ended into access, and records the plan", async () => {
    const companyId = await seedEndedTrial("Sandbox Buyer");
    expect(entitlementOf(await settingsOf(companyId), new Date())).toMatchObject({
      access: false,
      reason: "trial_ended",
    });

    const response = await POST(signed(orderPaid(companyId)) as never);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true, applied: true });

    const after = await settingsOf(companyId);
    expect(entitlementOf(after, new Date())).toMatchObject({
      access: true,
      reason: "subscription_active",
    });
    expect(after.plan).toBe("starter");
    expect(after.polarCustomerId).toBe("cus_sandbox_1");
    expect(after.polarSubscriptionId).toBe("sub_sandbox_1");
    // The neighbouring key of the same jsonb column survives: the write is one
    // `jsonb ||` merge, not a read-modify-write.
    expect(after.fiscalStartMonth).toBe(7);
  });

  /** The brief's "cancelled if they pay first". */
  it("cancels the scheduled trial-ended email and records that it was cancelled", async () => {
    const companyId = await seedEndedTrial("Cancelling Buyer", {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_queued_1",
    });

    const response = await POST(signed(orderPaid(companyId)) as never);

    expect(response.status).toBe(202);
    expect(resend.cancelled).toEqual(["email_queued_1"]);
    const after = await settingsOf(companyId);
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBeNull();
    expect(after[TRIAL_SETTINGS_KEYS.trialEndedEmailSentAt]).toBe("cancelled");
  });

  /**
   * The failure that must not reach Polar. The write has already committed, so
   * a 500 here would have Polar retry a delivery whose work is done — and ten
   * of those disable the endpoint.
   */
  it.each([
    ["Resend refuses the cancel", "refuse"],
    ["Resend throws", "throw"],
  ])("still answers 202 when %s", async (_name, mode) => {
    if (mode === "refuse") {
      resend.cancelResult = { data: null, error: { message: "already sent", name: "not_found" } };
    } else {
      resend.throwOnCancel = true;
    }
    const companyId = await seedEndedTrial(`Cancel ${mode} Buyer`, {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_queued_2",
    });

    const response = await POST(signed(orderPaid(companyId)) as never);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true, applied: true });
    // The payment is still recorded; only the email cancel failed.
    expect((await settingsOf(companyId)).plan).toBe("starter");
    // And the id is kept, so nothing sends a second copy and a later attempt
    // still has something to cancel.
    expect((await settingsOf(companyId))[TRIAL_SETTINGS_KEYS.trialEndedEmailId]).toBe(
      "email_queued_2",
    );
  });

  it("cancels nothing when no email was ever scheduled", async () => {
    const companyId = await seedEndedTrial("No Email Buyer");
    await POST(signed(orderPaid(companyId)) as never);
    expect(resend.cancelled).toHaveLength(0);
  });

  /**
   * An access-ending event must never cancel: the email is the thing that tells
   * the customer what happened.
   */
  it("does not cancel on an access-ending event", async () => {
    const companyId = await seedEndedTrial("Revoked Co", {
      [TRIAL_SETTINGS_KEYS.trialEndedEmailId]: "email_queued_3",
      polarSubscriptionStatus: "active",
    });

    const response = await POST(
      signed({
        type: "subscription.revoked",
        data: {
          id: "sub_sandbox_1",
          status: "canceled",
          product_id: "prod_starter_sandbox",
          metadata: { reference_id: companyId },
        },
      }) as never,
    );

    expect(response.status).toBe(202);
    expect(resend.cancelled).toHaveLength(0);
    expect((await settingsOf(companyId)).plan).toBe("free");
  });
});

describe("what it refuses and what it ignores", () => {
  it("answers 503 and writes nothing with no signing secret", async () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "");
    const companyId = await seedEndedTrial("No Secret Buyer");

    const response = await POST(signed(orderPaid(companyId)) as never);

    expect(response.status).toBe(503);
    expect(await settingsOf(companyId)).not.toHaveProperty("plan");
  });

  it("answers 403 and writes nothing for a bad signature", async () => {
    const companyId = await seedEndedTrial("Forged Buyer");
    const request = signed(orderPaid(companyId));
    const forged = new Request(request, { headers: { ...Object.fromEntries(request.headers), "webhook-signature": "v1,bm90LWl0" } });

    const response = await POST(forged as never);

    expect(response.status).toBe(403);
    expect(await settingsOf(companyId)).not.toHaveProperty("plan");
  });

  /**
   * `reference_id` rides on a public checkout link, so anyone can append one.
   * A uuid naming no company updates nothing and **creates nothing** — this
   * route writes to rows that already exist.
   */
  it("ignores an unknown reference_id without creating anything", async () => {
    const before = await ctx.db.execute(sql`SELECT count(*)::int AS n FROM companies`);

    const response = await POST(
      signed(orderPaid("99999999-9999-4999-8999-999999999999")) as never,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true, applied: false });
    const after = await ctx.db.execute(sql`SELECT count(*)::int AS n FROM companies`);
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it("ignores a reference_id that is not a uuid", async () => {
    const response = await POST(signed(orderPaid("'; DROP TABLE companies;--")) as never);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true, applied: false });
    // Still there.
    await ctx.db.execute(sql`SELECT count(*) FROM companies`);
  });

  /**
   * A redelivery is normal: Polar retries, and every write here is an idempotent
   * merge of the same keys to the same values.
   */
  it("changes nothing on a replay", async () => {
    const companyId = await seedEndedTrial("Replayed Buyer");
    const payload = orderPaid(companyId);

    await POST(signed(payload, "msg_replay") as never);
    const once = await settingsOf(companyId);

    const second = await POST(signed(payload, "msg_replay") as never);
    expect(second.status).toBe(202);
    expect(await settingsOf(companyId)).toEqual(once);
  });
});
