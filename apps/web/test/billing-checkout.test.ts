import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { settingsRouter } from "@/server/routers/settings";
import { checkoutLinkForCompany } from "@/server/polar";

/**
 * `settings.getCheckout`, and the one thing about it that is a security
 * boundary: **a viewer receives no checkout URL.**
 *
 * It is a `billingProcedure` — a member procedure with the entitlement gate
 * removed, because the paywall's own "Continue to payment" button calls it and
 * an expired company is precisely who needs it to work — with the role checked
 * in its body rather than by `editorProcedure`. The reason given in the router
 * is that a viewer opening the billing page should see the plans and a line
 * saying who can buy, not a FORBIDDEN where the page should be.
 *
 * That reasoning only holds if the **URLs** are withheld server-side rather than
 * merely hidden by the page, so that is what these assert — and they assert it
 * with the links configured, which is the only state in which a null means
 * anything. With no `POLAR_CHECKOUT_LINK_*` set, every plan is null for
 * everybody and the test would pass while proving nothing.
 *
 * `getBillingInfo`'s entitlement is checked here too: it is the one ungated
 * endpoint the paywall and the trial banner both read, so a missing field there
 * breaks both.
 */

const STARTER_LINK = "https://buy.polar.sh/polar_cl_starter_test";
const GROWTH_LINK = "https://buy.polar.sh/polar_cl_growth_test";

type Role = "admin" | "manager" | "viewer";

let ctx: TestDb;
let companyId: string;
const clerkIds = {} as Record<Role, string>;

function caller(role: Role) {
  return settingsRouter.createCaller({ userId: clerkIds[role], db: ctx.db } as never);
}

beforeAll(async () => {
  ctx = await createTestDb();
  const res = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code) VALUES ('Checkout Co', 'checkout-co', 'EUR')
    RETURNING id
  `);
  companyId = (res.rows[0] as { id: string }).id;

  for (const role of ["admin", "manager", "viewer"] as Role[]) {
    const clerkUserId = `clerk_checkout_${role}`;
    await ctx.db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@checkout.test`}, ${role}, ${role}, ${clerkUserId})
    `);
    clerkIds[role] = clerkUserId;
  }
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(() => {
  vi.stubEnv("POLAR_CHECKOUT_LINK_STARTER", STARTER_LINK);
  vi.stubEnv("POLAR_CHECKOUT_LINK_GROWTH", GROWTH_LINK);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("settings.getCheckout withholds the URL from a viewer", () => {
  /**
   * The assertion the brief asks for, over **every** plan rather than the one
   * the paywall happens to render first: a plan added to `SELLABLE_PLAN_IDS`
   * later must not arrive with a URL attached.
   */
  it("returns url: null for every plan", async () => {
    const result = await caller("viewer").getCheckout();

    expect(result.canCheckout).toBe(false);
    expect(result.plans.length).toBeGreaterThan(0);
    for (const entry of result.plans) {
      expect(entry.url, entry.plan).toBeNull();
    }
  });

  /**
   * `configured` is derived from `available`, not from `url`. Computing it from
   * `url` would tell every viewer that billing is unconfigured, and the page
   * would then explain the wrong reason they cannot buy.
   */
  it("still tells a viewer the deployment can sell", async () => {
    const result = await caller("viewer").getCheckout();
    expect(result.configured).toBe(true);
    expect(result.plans.find((entry) => entry.plan === "starter")?.available).toBe(true);
  });

  it("gives an admin and a manager the links, since EDITOR_ROLES has both", async () => {
    for (const role of ["admin", "manager"] as Role[]) {
      const result = await caller(role).getCheckout();
      expect(result.canCheckout, role).toBe(true);
      const starter = result.plans.find((entry) => entry.plan === "starter");
      expect(starter?.url, role).toContain("buy.polar.sh");
    }
  });

  /** `reference_id` is what maps a payment back to a row; the email pre-fills a field. */
  it("attaches the company id and the caller's own address", async () => {
    const result = await caller("admin").getCheckout();
    const url = new URL(result.plans.find((entry) => entry.plan === "starter")!.url!);

    expect(url.searchParams.get("reference_id")).toBe(companyId);
    expect(url.searchParams.get("customer_email")).toBe("admin@checkout.test");
  });

  it("gives each plan its own link, never one link for the ladder", async () => {
    const result = await caller("admin").getCheckout();
    const starter = new URL(result.plans.find((entry) => entry.plan === "starter")!.url!);
    const growth = new URL(result.plans.find((entry) => entry.plan === "growth")!.url!);
    expect(starter.pathname).not.toBe(growth.pathname);
  });

  it("has no link for a plan with no variable set", async () => {
    const result = await caller("admin").getCheckout();
    for (const plan of ["enterprise", "bureau"] as const) {
      const entry = result.plans.find((candidate) => candidate.plan === plan);
      expect(entry?.url, plan).toBeNull();
      expect(entry?.available, plan).toBe(false);
    }
  });
});

/**
 * `customer_email` lands in a URL a person then opens, so a value carrying
 * whitespace or a second parameter would be a query-injection shape. It is
 * dropped rather than sent, because a missing pre-fill costs one typed field.
 */
describe("checkoutLinkForCompany's email handling", () => {
  it.each([
    ["no email", null],
    ["a blank string", "   "],
    ["no at sign", "nobody"],
    ["two at signs", "a@b@c.com"],
    ["a newline", "a@b.com\nbcc: x@y.com"],
    ["a space", "a b@c.com"],
  ])("leaves customer_email off for %s", (_name, email) => {
    const link = checkoutLinkForCompany("starter", "11111111-2222-4333-8444-555555555555", email);
    expect(link).not.toBeNull();
    expect(new URL(link!).searchParams.has("customer_email")).toBe(false);
  });

  it("keeps reference_id whatever the email is", () => {
    const companyUuid = "11111111-2222-4333-8444-555555555555";
    const link = checkoutLinkForCompany("starter", companyUuid, "nonsense");
    expect(new URL(link!).searchParams.get("reference_id")).toBe(companyUuid);
  });
});

/**
 * The entitlement on `getBillingInfo`: the paywall closes on `access` and the
 * banner counts down from `trialEndsAt`, so both break if either field moves.
 */
describe("settings.getBillingInfo carries the entitlement", () => {
  it("reports a live trial, with the end date as an ISO string", async () => {
    const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await ctx.db.execute(sql`
      UPDATE companies SET settings = ${JSON.stringify({
        onboardingCompletedAt: startedAt.toISOString(),
        trialStartedAt: startedAt.toISOString(),
      })}::jsonb WHERE id = ${companyId}
    `);

    const info = await caller("viewer").getBillingInfo();

    expect(info.entitlement.access).toBe(true);
    expect(info.entitlement.reason).toBe("trialing");
    expect(info.entitlement.paymentFailed).toBe(false);
    // A string, not a Date: this app's tRPC client has no transformer, so a Date
    // would be typed as one and arrive as a string.
    expect(typeof info.entitlement.trialEndsAt).toBe("string");
  });

  it("reports a trial that has ended, which is what the paywall is mounted on", async () => {
    const startedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await ctx.db.execute(sql`
      UPDATE companies SET settings = ${JSON.stringify({
        onboardingCompletedAt: startedAt.toISOString(),
        trialStartedAt: startedAt.toISOString(),
      })}::jsonb WHERE id = ${companyId}
    `);

    const info = await caller("viewer").getBillingInfo();
    expect(info.entitlement.access).toBe(false);
    expect(info.entitlement.reason).toBe("trial_ended");
  });

  it("reports a failed payment while keeping access", async () => {
    await ctx.db.execute(sql`
      UPDATE companies SET settings = ${JSON.stringify({
        polarSubscriptionStatus: "past_due",
      })}::jsonb WHERE id = ${companyId}
    `);

    const info = await caller("viewer").getBillingInfo();
    expect(info.entitlement.access).toBe(true);
    expect(info.entitlement.paymentFailed).toBe(true);
  });
});
