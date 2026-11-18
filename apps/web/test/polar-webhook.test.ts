import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import {
  TIMESTAMP_TOLERANCE_SECONDS,
  verifyPolarWebhook,
  type WebhookHeaders,
} from "@/server/polar-webhook";
import {
  applyPolarSettingsPatch,
  polarEventSchema,
  settingsPatchForEvent,
} from "@/server/polar-events";

/**
 * The Polar webhook: the only thing in this product that writes
 * `companies.settings.plan`.
 *
 * That is why it is tested rather than eyeballed. Every company reads `"free"`
 * because nothing has ever set `plan`, so Integrations — gated to Enterprise —
 * is hidden from everyone including the account owner. This route is what makes
 * that gate mean something, which also makes it the one unauthenticated public
 * path that can grant a paid capability. A hole here is not a bug on a billing
 * screen; it is a free upgrade for anyone who can POST.
 *
 * Three things are pinned:
 *
 * 1. **The signature**, against vectors computed here with `node:crypto` rather
 *    than copied from a fixture, so the test fails if the algorithm drifts
 *    rather than if a string was retyped.
 * 2. **The mapping** from an event to a settings patch — which company, which
 *    plan, and the cases where the answer is deliberately "do nothing".
 * 3. **The write**, against real Postgres, because a merge into a shared jsonb
 *    column is exactly the statement that looks right and is not.
 */

/** A `whsec_` secret of the current scheme: base64 after the prefix. */
const STANDARD_SECRET = `whsec_${Buffer.from("a-secret-of-at-least-24-bytes!!").toString("base64")}`;

/** A pre-September-2026 Polar secret, whose key is the whole string's bytes. */
const LEGACY_SECRET = "whsec_legacy_polar_scheme_secret";

function signWith(key: Buffer, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest("base64");
}

/** The key the *current* scheme derives: the base64 body, decoded. */
function standardKey(secret: string): Buffer {
  return Buffer.from(secret.slice("whsec_".length), "base64");
}

interface Signed {
  body: string;
  headers: WebhookHeaders;
  now: Date;
}

function sign(payload: unknown, secret = STANDARD_SECRET, key?: Buffer): Signed {
  const body = JSON.stringify(payload);
  const now = new Date();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const id = "msg_test_1";
  return {
    body,
    headers: {
      id,
      timestamp,
      signature: `v1,${signWith(key ?? standardKey(secret), id, timestamp, body)}`,
    },
    now,
  };
}

describe("the Standard Webhooks signature", () => {
  it("accepts a delivery signed with the current scheme", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, now)).toEqual({ ok: true });
  });

  /**
   * Polar changed scheme on 8 September 2026. A secret issued before then uses
   * the UTF-8 bytes of the entire `whsec_…` string as the key, prefix included.
   * Which one a deployment holds depends on when somebody clicked a button in a
   * dashboard, so both have to work.
   */
  it("accepts a delivery signed with the legacy Polar scheme", () => {
    const key = Buffer.from(LEGACY_SECRET, "utf8");
    const { body, headers, now } = sign({ type: "order.paid" }, LEGACY_SECRET, key);
    expect(verifyPolarWebhook(body, headers, LEGACY_SECRET, now)).toEqual({ ok: true });
  });

  it("refuses a body that was altered after signing", () => {
    const { headers, now } = sign({ type: "order.paid", data: { id: "ord_1" } });
    const tampered = JSON.stringify({ type: "order.paid", data: { id: "ord_EVIL" } });
    expect(verifyPolarWebhook(tampered, headers, STANDARD_SECRET, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses a signature made with a different secret", () => {
    const other = `whsec_${Buffer.from("a-completely-different-secret!!").toString("base64")}`;
    const { body, headers, now } = sign({ type: "order.paid" }, other);
    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  /**
   * The one case where "degrade, never break" must NOT mean "carry on". With no
   * secret the app cannot tell a real delivery from a forged one, so it refuses
   * every delivery rather than trusting it.
   */
  it("refuses everything when no secret is configured", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    for (const secret of [null, "", "   "]) {
      expect(verifyPolarWebhook(body, headers, secret, now)).toEqual({
        ok: false,
        reason: "not_configured",
      });
    }
  });

  it.each(["id", "timestamp", "signature"] as const)("refuses a delivery with no %s header", (key) => {
    const { body, headers, now } = sign({ type: "order.paid" });
    expect(verifyPolarWebhook(body, { ...headers, [key]: null }, STANDARD_SECRET, now)).toEqual({
      ok: false,
      reason: "missing_headers",
    });
  });

  /**
   * Replay protection. A capture of a real, correctly signed delivery must stop
   * working once it is old — the signature stays valid forever, so the
   * timestamp is the only thing that expires it.
   */
  it("refuses a correctly signed delivery that is too old", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    const later = new Date(now.getTime() + (TIMESTAMP_TOLERANCE_SECONDS + 60) * 1000);
    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, later)).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
  });

  it("refuses one timestamped too far in the future", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    const earlier = new Date(now.getTime() - (TIMESTAMP_TOLERANCE_SECONDS + 60) * 1000);
    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, earlier)).toEqual({
      ok: false,
      reason: "stale_timestamp",
    });
  });

  it("allows ordinary clock skew inside the tolerance", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    const skewed = new Date(now.getTime() + (TIMESTAMP_TOLERANCE_SECONDS - 30) * 1000);
    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, skewed)).toEqual({ ok: true });
  });

  it("refuses a timestamp that is not a number", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    expect(verifyPolarWebhook(body, { ...headers, timestamp: "not-a-time" }, STANDARD_SECRET, now))
      .toEqual({ ok: false, reason: "bad_timestamp" });
  });

  /**
   * Multiple signatures are how a secret is rotated without dropping
   * deliveries: both the old and the new are sent, and either matching is a
   * pass. A `v1a` entry is ed25519 and must never be compared as an HMAC.
   */
  it("accepts a header carrying several signatures, one of which is ours", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    const mixed = `v1,bm90LXRoZS1yaWdodC1vbmU= ${headers.signature} v1a,aXJyZWxldmFudA==`;
    expect(verifyPolarWebhook(body, { ...headers, signature: mixed }, STANDARD_SECRET, now))
      .toEqual({ ok: true });
  });

  it("refuses a header of only non-v1 entries", () => {
    const { body, headers, now } = sign({ type: "order.paid" });
    const asymmetric = `v1a,${headers.signature?.slice(3)}`;
    expect(verifyPolarWebhook(body, { ...headers, signature: asymmetric }, STANDARD_SECRET, now))
      .toEqual({ ok: false, reason: "bad_signature" });
  });

  /**
   * The signature covers the exact bytes sent. Parsing and re-serialising —
   * which is what `req.json()` then `JSON.stringify` would do — reorders keys
   * and drops whitespace, and the signature stops matching. This is the test
   * that fails if the route ever stops reading `req.text()`.
   */
  it("is tied to the raw bytes, not to the parsed object", () => {
    const body = '{"type":"order.paid",  "data":{"id":"ord_1"}}';
    const now = new Date();
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const id = "msg_raw";
    const headers: WebhookHeaders = {
      id,
      timestamp,
      signature: `v1,${signWith(standardKey(STANDARD_SECRET), id, timestamp, body)}`,
    };

    expect(verifyPolarWebhook(body, headers, STANDARD_SECRET, now)).toEqual({ ok: true });
    const reserialised = JSON.stringify(JSON.parse(body));
    expect(verifyPolarWebhook(reserialised, headers, STANDARD_SECRET, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
});

/**
 * Which company, which plan, and when to do nothing.
 *
 * `planForPolarProduct` reads `POLAR_PRODUCT_ID_<PLAN>` from the environment,
 * so these set and restore it rather than mocking the module: the mapping being
 * environment-driven is the behaviour under test.
 */
describe("turning an event into a settings patch", () => {
  const COMPANY = "11111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    vi.stubEnv("POLAR_PRODUCT_ID_STARTER", "prod_starter");
    vi.stubEnv("POLAR_PRODUCT_ID_GROWTH", "prod_growth");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const orderPaid = (overrides: Record<string, unknown> = {}) =>
    polarEventSchema.parse({
      type: "order.paid",
      data: {
        id: "ord_1",
        customer_id: "cus_1",
        product_id: "prod_starter",
        metadata: { reference_id: COMPANY },
        subscription: {
          id: "sub_1",
          status: "active",
          current_period_end: "2027-01-31T00:00:00Z",
          customer_id: "cus_1",
          product_id: "prod_starter",
        },
        ...overrides,
      },
    });

  it("records the plan, the customer and the subscription on a paid order", () => {
    const outcome = settingsPatchForEvent(orderPaid());
    expect(outcome).toEqual({
      kind: "apply",
      companyId: COMPANY,
      plan: "starter",
      patch: {
        plan: "starter",
        polarCustomerId: "cus_1",
        polarProductId: "prod_starter",
        polarSubscriptionId: "sub_1",
        polarSubscriptionStatus: "active",
        polarCurrentPeriodEnd: "2027-01-31T00:00:00Z",
      },
    });
  });

  it("maps each configured product to its own plan", () => {
    const growth = settingsPatchForEvent(
      orderPaid({
        product_id: "prod_growth",
        subscription: { id: "sub_2", status: "active", product_id: "prod_growth" },
      }),
    );
    expect(growth).toMatchObject({ kind: "apply", plan: "growth" });
  });

  /**
   * The refusal to guess. An order for a product this deployment has not been
   * told about records the subscription — which is true — and leaves `plan`
   * alone, because inventing one hands a company a capability it did not buy.
   */
  it("records the subscription but not a plan for an unknown product", () => {
    const outcome = settingsPatchForEvent(
      orderPaid({
        product_id: "prod_never_heard_of",
        subscription: { id: "sub_3", status: "active", product_id: "prod_never_heard_of" },
      }),
    );
    expect(outcome).toMatchObject({ kind: "apply", plan: null });
    if (outcome.kind !== "apply") throw new Error("expected apply");
    expect(outcome.patch).not.toHaveProperty("plan");
    expect(outcome.patch.polarSubscriptionId).toBe("sub_3");
  });

  it("reads the company from metadata.company_id, and from the customer's external id", () => {
    const byCompanyId = settingsPatchForEvent(orderPaid({ metadata: { company_id: COMPANY } }));
    expect(byCompanyId).toMatchObject({ kind: "apply", companyId: COMPANY });

    const byExternal = settingsPatchForEvent(
      orderPaid({ metadata: {}, customer: { external_id: COMPANY } }),
    );
    expect(byExternal).toMatchObject({ kind: "apply", companyId: COMPANY });
  });

  it("ignores an event carrying no company reference at all", () => {
    const outcome = settingsPatchForEvent(orderPaid({ metadata: {} }));
    expect(outcome.kind).toBe("ignored");
  });

  /**
   * `reference_id` rides on a public checkout link, so anyone can put anything
   * in it. A value that is not a uuid is not one of ours and is dropped before
   * it reaches a query.
   */
  it("ignores a reference_id that is not a uuid", () => {
    for (const value of ["'; DROP TABLE companies;--", "12345", ""]) {
      expect(settingsPatchForEvent(orderPaid({ metadata: { reference_id: value } })).kind)
        .toBe("ignored");
    }
  });

  it("ignores event types it does not act on", () => {
    for (const type of ["checkout.created", "order.created", "order.refunded", "benefit.granted"]) {
      const event = polarEventSchema.parse({
        type,
        data: { metadata: { reference_id: COMPANY } },
      });
      expect(settingsPatchForEvent(event).kind, type).toBe("ignored");
    }
  });

  const subscriptionEvent = (type: string, extra: Record<string, unknown> = {}) =>
    polarEventSchema.parse({
      type,
      data: {
        id: "sub_1",
        status: "active",
        product_id: "prod_starter",
        customer_id: "cus_1",
        current_period_end: "2027-02-28T00:00:00Z",
        metadata: { reference_id: COMPANY },
        ...extra,
      },
    });

  it("keeps the stored state in step on a subscription update", () => {
    const outcome = settingsPatchForEvent(subscriptionEvent("subscription.updated"));
    expect(outcome).toMatchObject({
      kind: "apply",
      patch: {
        plan: "starter",
        polarSubscriptionId: "sub_1",
        polarSubscriptionStatus: "active",
        polarCurrentPeriodEnd: "2027-02-28T00:00:00Z",
      },
    });
  });

  /**
   * The distinction that costs a customer their features if it is got wrong.
   * `subscription.canceled` means a cancellation was *requested*; the
   * subscription stays active until the period ends. Only `revoked` and
   * `paused` mean access has actually stopped.
   */
  it("does not downgrade on a cancellation request", () => {
    const outcome = settingsPatchForEvent(
      subscriptionEvent("subscription.canceled", { status: "active" }),
    );
    expect(outcome).toMatchObject({ kind: "apply", plan: "starter" });
  });

  it.each(["subscription.revoked", "subscription.paused"])(
    "drops the company back to free on %s",
    (type) => {
      const outcome = settingsPatchForEvent(subscriptionEvent(type, { status: "canceled" }));
      expect(outcome).toMatchObject({
        kind: "apply",
        plan: "free",
        patch: { plan: "free", polarSubscriptionStatus: "canceled" },
      });
    },
  );

  /** Polar adds fields over time; a delivery carrying something new must still parse. */
  it("parses an event carrying fields it has never seen", () => {
    const parsed = polarEventSchema.parse({
      type: "order.paid",
      data: { id: "ord_1", metadata: { reference_id: COMPANY }, something_new: { nested: true } },
    });
    expect(parsed.type).toBe("order.paid");
  });
});

/**
 * The write, against real Postgres.
 *
 * `companies.settings` is one jsonb column shared by five features. The webhook
 * is the sixth writer of it, and it has to behave like the other five: merge in
 * one statement, leave every neighbouring key alone.
 */
describe("applying the patch to companies.settings", () => {
  let ctx: TestDb;
  let companyId: string;

  beforeAll(async () => {
    ctx = await createTestDb();
    const res = await ctx.db.execute(sql`
      INSERT INTO companies (name, slug, currency_code, settings)
      VALUES ('Polar Co', 'polar-co', 'EUR', ${JSON.stringify({
        fiscalStartMonth: 4,
        aiEnabled: true,
        integrations: [{ provider: "bamboo" }],
      })}::jsonb)
      RETURNING id
    `);
    companyId = (res.rows[0] as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function settingsOf(): Promise<Record<string, unknown>> {
    const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
    return (res.rows[0] as { settings: Record<string, unknown> }).settings;
  }

  it("sets the plan, which nothing else in the app can do", async () => {
    expect(await settingsOf()).not.toHaveProperty("plan");

    const applied = await applyPolarSettingsPatch(ctx.db, companyId, {
      plan: "enterprise",
      polarCustomerId: "cus_1",
      polarSubscriptionId: "sub_1",
      polarSubscriptionStatus: "active",
      polarCurrentPeriodEnd: "2027-01-31T00:00:00Z",
    });

    expect(applied).toBe(true);
    const after = await settingsOf();
    expect(after.plan).toBe("enterprise");
    expect(after.polarSubscriptionId).toBe("sub_1");
  });

  /** The whole reason the merge is in SQL rather than in JS. */
  it("leaves every key belonging to another feature untouched", async () => {
    const after = await settingsOf();
    expect(after.fiscalStartMonth).toBe(4);
    expect(after.aiEnabled).toBe(true);
    expect(after.integrations).toEqual([{ provider: "bamboo" }]);
  });

  it("updates only the keys it is given on a later event", async () => {
    await applyPolarSettingsPatch(ctx.db, companyId, { polarSubscriptionStatus: "past_due" });
    const after = await settingsOf();
    expect(after.polarSubscriptionStatus).toBe("past_due");
    // Not blanked by an event that said nothing about them.
    expect(after.polarCustomerId).toBe("cus_1");
    expect(after.plan).toBe("enterprise");
  });

  it("is idempotent, so a Polar redelivery lands on the same state", async () => {
    const patch = { plan: "growth", polarSubscriptionStatus: "active" };
    await applyPolarSettingsPatch(ctx.db, companyId, patch);
    const once = await settingsOf();
    await applyPolarSettingsPatch(ctx.db, companyId, patch);
    expect(await settingsOf()).toEqual(once);
  });

  /**
   * A column holding a scalar would make `jsonb || jsonb` append and turn the
   * settings into an array, after which every `settings.plan` read goes quietly
   * undefined. `companySettingsObject`'s guard is what stops it, and the
   * webhook inherits it by using the shared helper.
   */
  it("merges into a column holding a non-object without corrupting it", async () => {
    await ctx.db.execute(sql`UPDATE companies SET settings = 'null'::jsonb WHERE id = ${companyId}`);
    await applyPolarSettingsPatch(ctx.db, companyId, { plan: "starter" });
    const after = await settingsOf();
    expect(Array.isArray(after)).toBe(false);
    expect(after).toEqual({ plan: "starter" });
  });

  it("writes nothing for a company id that does not exist", async () => {
    const applied = await applyPolarSettingsPatch(
      ctx.db,
      "99999999-9999-4999-8999-999999999999",
      { plan: "enterprise" },
    );
    expect(applied).toBe(false);
  });
});
