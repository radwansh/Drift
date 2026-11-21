import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { settingsRouter } from "@/server/routers/settings";

/**
 * `settings.getCompany` / `settings.updateCompany`, now that
 * `(main)/settings/page.tsx` is wired to them instead of to five `useState`
 * literals.
 *
 * The case that matters is the gate. `updateCompany` was a
 * `protectedProcedure`, so **any signed-in viewer could rename the company**
 * for everyone in it and change the currency code every figure in the product
 * is labelled with. Nothing called it, so there was no screen to notice —
 * which is exactly the shape `tenant-scoping.test.ts` was written for, and the
 * reason this needs a test rather than a one-line diff.
 *
 * Two companies, so a write is also checked for staying inside its own tenant:
 * there is no row-level security and no automatic filter, and the procedure
 * now takes its company from middleware rather than from a lookup of its own.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  slug: string;
  users: Record<Role, string>;
}

let ctx: TestDb;
let acme: Seeded;
let globex: Seeded;

async function seedCompany(db: TestDb["db"], slug: string, currency: string): Promise<Seeded> {
  const companyRes = await db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES (${slug}, ${slug}, ${currency})
    RETURNING id
  `);
  const companyId = (companyRes.rows[0] as { id: string }).id;

  const users = {} as Record<Role, string>;
  for (const role of ["admin", "manager", "viewer"] as Role[]) {
    const clerkUserId = `clerk_${slug}_${role}`;
    await db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@${slug}.test`}, ${role}, ${role}, ${clerkUserId})
    `);
    users[role] = clerkUserId;
  }

  return { companyId, slug, users };
}

function caller(seeded: Seeded, role: Role) {
  return settingsRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

async function nameOf(companyId: string): Promise<string> {
  const res = await ctx.db.execute(sql`SELECT name FROM companies WHERE id = ${companyId}`);
  return (res.rows[0] as { name: string }).name;
}

beforeAll(async () => {
  ctx = await createTestDb();
  acme = await seedCompany(ctx.db, "acme", "USD");
  globex = await seedCompany(ctx.db, "globex", "LBP");
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("settings.getCompany", () => {
  it("returns the caller's own company", async () => {
    const company = await caller(acme, "viewer").getCompany();
    expect(company.id).toBe(acme.companyId);
    expect(company.name).toBe("acme");
    expect(company.currencyCode).toBe("USD");
  });

  it("gives each tenant its own row, with its own currency", async () => {
    const company = await caller(globex, "admin").getCompany();
    expect(company.id).toBe(globex.companyId);
    expect(company.currencyCode).toBe("LBP");
  });
});

describe("settings.updateCompany is an editorProcedure", () => {
  it("lets an admin rename the company", async () => {
    const updated = await caller(acme, "admin").updateCompany({ name: "Acme Payroll" });
    expect(updated.name).toBe("Acme Payroll");
    expect(await nameOf(acme.companyId)).toBe("Acme Payroll");
  });

  it("lets a manager rename it too, since EDITOR_ROLES has both", async () => {
    await caller(acme, "manager").updateCompany({ name: "Acme Payroll Ltd" });
    expect(await nameOf(acme.companyId)).toBe("Acme Payroll Ltd");
  });

  /**
   * The whole point of the gate. The wording is asserted rather than just the
   * code, because `/FORBIDDEN/` alone would also match `payDetailProcedure`
   * and `adminProcedure` and so would not say which gate refused.
   */
  it("refuses a viewer", async () => {
    await expect(caller(acme, "viewer").updateCompany({ name: "Viewer Corp" })).rejects.toThrow(
      /admin or manager role/i,
    );
    expect(await nameOf(acme.companyId)).toBe("Acme Payroll Ltd");
  });

  it("writes the currency the form offers", async () => {
    const updated = await caller(acme, "admin").updateCompany({ currencyCode: "EUR" });
    expect(updated.currencyCode).toBe("EUR");
    // And leaves the name alone: the form sends both, a partial input must not
    // blank the field it omits.
    expect(updated.name).toBe("Acme Payroll Ltd");
  });

  it("writes only the caller's own company", async () => {
    expect(await nameOf(globex.companyId)).toBe("globex");
    const globexRow = await caller(globex, "admin").getCompany();
    expect(globexRow.currencyCode).toBe("LBP");
  });
});

/**
 * What the billing page renders.
 *
 * It showed a "Professional" plan at $299, marked Active, with four paid
 * invoices. `getBillingInfo` has always answered something else, and for every
 * company in the product it answers this: free, inactive, no subscription.
 */
describe("settings.getBillingInfo", () => {
  it("reports free and inactive for a company with nothing recorded", async () => {
    const info = await caller(globex, "admin").getBillingInfo();
    expect(info).toEqual({
      subscriptionId: null,
      status: "inactive",
      plan: "free",
      periodEnd: null,
      // No Polar token and no customer, which is every environment today.
      portalAvailable: false,
      /**
       * The entitlement rides on this procedure because it is the one ungated
       * billing read, and both the paywall and the trial banner need it: the
       * paywall closes on `access` turning true and the banner counts the last
       * seven days from `trialEndsAt`. `test/billing-checkout.test.ts` covers
       * the live-trial, ended-trial and past-due shapes.
       *
       * A company with no trial keys at all reads `onboarding_incomplete`, not
       * `trial_ended` — the distinction exists so the paywall never tells
       * somebody their trial expired before it began, and this is the state
       * every company that existed before the trial release is in.
       */
      entitlement: {
        access: false,
        reason: "onboarding_incomplete",
        trialEndsAt: null,
        paymentFailed: false,
      },
    });
  });

  it("reads a plan that has actually been written to companies.settings", async () => {
    // `api/webhooks/polar` is what writes these in the product; a direct write
    // is how the state is reached here without standing up a webhook delivery.
    await ctx.db.execute(sql`
      UPDATE companies
      SET settings = ${JSON.stringify({
        plan: "enterprise",
        polarSubscriptionStatus: "active",
        polarSubscriptionId: "sub_test_123",
        polarCurrentPeriodEnd: "2027-01-31",
      })}::jsonb
      WHERE id = ${globex.companyId}
    `);

    const info = await caller(globex, "viewer").getBillingInfo();
    expect(info.plan).toBe("enterprise");
    expect(info.status).toBe("active");
    expect(info.subscriptionId).toBe("sub_test_123");
    expect(info.periodEnd).toBe("2027-01-31");
  });

  /**
   * The portal control appears only when there is a portal behind it. Without
   * `POLAR_ACCESS_TOKEN` there is nothing to ask, so a stored customer id on
   * its own is not enough — and the page must not offer a button that leads
   * nowhere, which is the whole failure the Stripe URL was.
   */
  it("does not offer a portal without both a token and a customer", async () => {
    await ctx.db.execute(sql`
      UPDATE companies
      SET settings = settings || '{"polarCustomerId":"cus_globex"}'::jsonb
      WHERE id = ${globex.companyId}
    `);
    expect((await caller(globex, "admin").getBillingInfo()).portalAvailable).toBe(false);

    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
    try {
      expect((await caller(globex, "admin").getBillingInfo()).portalAvailable).toBe(true);
      // Acme has the token but no customer, so still nothing to open.
      expect((await caller(acme, "admin").getBillingInfo()).portalAvailable).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }

    await ctx.db.execute(sql`
      UPDATE companies SET settings = settings - 'polarCustomerId'::text
      WHERE id = ${globex.companyId}
    `);
  });

  it("does not leak another company's billing state", async () => {
    const acmeInfo = await caller(acme, "admin").getBillingInfo();
    expect(acmeInfo.plan).toBe("free");
    expect(acmeInfo.subscriptionId).toBeNull();
  });
});

/**
 * `updateCompany`'s `settings` input used to replace the whole jsonb column.
 *
 * These run after the `getBillingInfo` block on purpose: it leaves globex with
 * a real `plan`, the three Polar billing keys and nothing else, which is
 * exactly the state a replace destroyed and a merge has to preserve.
 */
describe("settings.updateCompany merges settings rather than replacing them", () => {
  async function settingsOf(companyId: string): Promise<Record<string, unknown>> {
    const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
    return (res.rows[0] as { settings: Record<string, unknown> }).settings;
  }

  it("keeps the plan and the Polar billing keys when writing an unrelated one", async () => {
    const before = await settingsOf(globex.companyId);
    expect(before.plan).toBe("enterprise");

    const updated = await caller(globex, "admin").updateCompany({
      settings: { tolerances: { netChangePct: 15 } },
    });

    // The returned row and the stored row agree, and both still hold billing.
    for (const after of [updated.settings as Record<string, unknown>, await settingsOf(globex.companyId)]) {
      expect(after.plan).toBe("enterprise");
      expect(after.polarSubscriptionId).toBe("sub_test_123");
      expect(after.polarSubscriptionStatus).toBe("active");
      expect(after.polarCurrentPeriodEnd).toBe("2027-01-31");
      expect(after.tolerances).toEqual({ netChangePct: 15 });
    }
  });

  it("overwrites only the key it is given, leaving the rest of the column alone", async () => {
    await caller(globex, "admin").updateCompany({
      settings: { tolerances: { minAbsolute: 500 } },
    });
    const after = await settingsOf(globex.companyId);
    // A merge replaces the value at the key, so the old threshold is gone...
    expect(after.tolerances).toEqual({ minAbsolute: 500 });
    // ...and everything beside it survives, which is the whole point.
    expect(after.plan).toBe("enterprise");
  });

  /** Without this the endpoint could only ever grow a company's settings. */
  it("deletes a key through unsetSettings, and nothing else", async () => {
    expect(await settingsOf(globex.companyId)).toHaveProperty("tolerances");

    const updated = await caller(globex, "admin").updateCompany({ unsetSettings: ["tolerances"] });

    expect(updated.settings).not.toHaveProperty("tolerances");
    const after = await settingsOf(globex.companyId);
    expect(after).not.toHaveProperty("tolerances");
    expect(after.plan).toBe("enterprise");
    expect(after.polarSubscriptionId).toBe("sub_test_123");
  });

  it("deletes a key that is not there without failing", async () => {
    await expect(caller(globex, "admin").updateCompany({ unsetSettings: ["tolerances"] })).resolves
      .toBeDefined();
    expect(await settingsOf(globex.companyId)).not.toHaveProperty("tolerances");
  });

  it("merges and deletes in one call, and still writes name and currency", async () => {
    await caller(globex, "admin").updateCompany({ settings: { tolerances: { baseChangePct: 8 } } });
    const updated = await caller(globex, "admin").updateCompany({
      name: "Globex SARL",
      currencyCode: "EUR",
      unsetSettings: ["tolerances"],
    });
    expect(updated.name).toBe("Globex SARL");
    expect(updated.currencyCode).toBe("EUR");
    expect(updated.settings).not.toHaveProperty("tolerances");
    expect((updated.settings as Record<string, unknown>).plan).toBe("enterprise");
  });

  it("refuses a key named in both settings and unsetSettings", async () => {
    await expect(
      caller(globex, "admin").updateCompany({
        settings: { tolerances: { netChangePct: 1 } },
        unsetSettings: ["tolerances"],
      }),
    ).rejects.toThrow(/both name tolerances/i);
  });

  it("merges into an empty column, and into one holding a non-object", async () => {
    // `{}` is the column default, and the path every company is on today.
    await caller(acme, "admin").updateCompany({ settings: { tolerances: { minAbsolute: 1 } } });
    expect(await settingsOf(acme.companyId)).toEqual({ tolerances: { minAbsolute: 1 } });

    // A scalar is only reachable by a direct write — which is how `plan` is
    // set, so a typo there is reachable. `jsonb || jsonb` would append and
    // turn the column into an array; the CASE keeps it an object.
    await ctx.db.execute(sql`UPDATE companies SET settings = 'null'::jsonb WHERE id = ${acme.companyId}`);
    await caller(acme, "admin").updateCompany({ settings: { tolerances: { minAbsolute: 2 } } });
    const after = await settingsOf(acme.companyId);
    expect(Array.isArray(after)).toBe(false);
    expect(after).toEqual({ tolerances: { minAbsolute: 2 } });
  });

  it("still refuses a viewer, so the merge did not widen the gate", async () => {
    await expect(
      caller(globex, "viewer").updateCompany({ settings: { tolerances: {} } }),
    ).rejects.toThrow(/admin or manager role/i);
  });
});

/**
 * The reason the merge needed an allow-list at all.
 *
 * A replace could only destroy `plan`. A merge that accepted any key would let
 * any admin write `{"plan": "enterprise"}` through the settings form and
 * unlock Integrations for their own company, because `hasIntegrations` trusts
 * the column. So the merge and this check are one change, not two.
 */
describe("settings.updateCompany refuses the keys it does not own", () => {
  const REFUSED: readonly [string, RegExp][] = [
    ["plan", /Polar webhook/i],
    ["polarCustomerId", /Polar webhook/i],
    ["polarSubscriptionId", /Polar webhook/i],
    ["polarSubscriptionStatus", /Polar webhook/i],
    ["polarCurrentPeriodEnd", /Polar webhook/i],
    ["polarProductId", /Polar webhook/i],
    ["integrations", /integrations\.configure/i],
    ["fiscalStartMonth", /annual\.setFiscalStartMonth/i],
    ["aiEnabled", /annual\.setAiEnabled/i],
  ];

  /**
   * The names these three used to have. They hold no data in any company — the
   * column was `{}` everywhere when the rename landed — so refusing them by
   * name is a signpost rather than a compatibility shim, and it is what makes
   * the rename discoverable from the error instead of from the diff.
   */
  const RENAMED: readonly [string, string][] = [
    ["stripeSubscriptionId", "polarSubscriptionId"],
    ["stripeSubscriptionStatus", "polarSubscriptionStatus"],
    ["subscriptionPeriodEnd", "polarCurrentPeriodEnd"],
  ];

  it.each(RENAMED)("refuses the old name %s and names its replacement", async (was, now) => {
    await expect(
      caller(acme, "admin").updateCompany({ settings: { [was]: "x" } }),
    ).rejects.toThrow(new RegExp(`now "${now}"`));
  });

  it.each(REFUSED)("refuses to write %s, and says what does own it", async (key, message) => {
    await expect(
      caller(acme, "admin").updateCompany({ settings: { [key]: "x" } }),
    ).rejects.toThrow(message);
  });

  it.each(REFUSED)("refuses to delete %s too", async (key, message) => {
    // Deleting is as damaging as writing: dropping `plan` downgrades a paying
    // company to the "free" default every reader falls back to.
    await expect(
      caller(acme, "admin").updateCompany({ unsetSettings: [key] }),
    ).rejects.toThrow(message);
  });

  it("fails closed on a key nobody has heard of, naming what it does write", async () => {
    await expect(
      caller(acme, "admin").updateCompany({ settings: { somethingNew: 1 } }),
    ).rejects.toThrow(/does not write "somethingNew".*It writes: tolerances/is);
  });

  it("writes nothing at all when one key of several is refused", async () => {
    const before = await caller(acme, "admin").getCompany();
    await expect(
      caller(acme, "admin").updateCompany({
        name: "Should Not Land",
        settings: { tolerances: { minAbsolute: 99 }, plan: "enterprise" },
      }),
    ).rejects.toThrow(/Polar webhook/i);

    const after = await caller(acme, "admin").getCompany();
    expect(after.name).toBe(before.name);
    expect(after.settings).toEqual(before.settings);
  });

  it("leaves acme on the free plan after all of that", async () => {
    expect((await caller(acme, "admin").getBillingInfo()).plan).toBe("free");
  });
});

/**
 * `settings.createBillingPortal`, which used to invent a URL.
 *
 * It returned `https://billing.stripe.com/session/<subscription id>`, built by
 * string concatenation, or Stripe's home page when there was no subscription —
 * which was every company, since nothing has ever written a subscription id.
 * Neither URL has ever resolved. These pin that it now answers null instead,
 * and that null is a normal answer rather than an error.
 */
describe("settings.createBillingPortal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no URL at all when Polar is not configured", async () => {
    const result = await caller(acme, "admin").createBillingPortal({});
    expect(result).toEqual({ url: null, reason: "not_configured" });
  });

  it("returns no URL when the company has no Polar customer", async () => {
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
    const result = await caller(acme, "admin").createBillingPortal({});
    expect(result).toEqual({ url: null, reason: "no_customer" });
  });

  /**
   * The regression that matters. Whatever happens, this procedure must never
   * answer a URL it assembled itself — the only URL it may return is one Polar
   * handed back.
   */
  it("never invents a billing URL", async () => {
    for (const stub of [null, "polar_oat_test"]) {
      if (stub) vi.stubEnv("POLAR_ACCESS_TOKEN", stub);
      const result = await caller(acme, "admin").createBillingPortal({});
      expect(result.url).toBeNull();
      expect(JSON.stringify(result)).not.toMatch(/stripe/i);
      vi.unstubAllEnvs();
    }
  });

  /** The portal cancels subscriptions and changes the payment method. */
  it("refuses a viewer, because it is a company-wide write", async () => {
    await expect(caller(acme, "viewer").createBillingPortal({})).rejects.toThrow(
      /admin or manager role/i,
    );
  });
});

/**
 * `settings.getCheckout` — one Polar Checkout Link per plan.
 *
 * Polar's links are per product: the Starter link is Starter, monthly, in EUR.
 * There is no single link that covers the ladder, so a plan without its own
 * variable has no checkout, and that is the state of every plan by default.
 */
describe("settings.getCheckout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers nothing when no checkout link is configured", async () => {
    const result = await caller(acme, "admin").getCheckout();
    expect(result.configured).toBe(false);
    expect(result.plans.every((entry) => entry.url === null)).toBe(true);
  });

  it("offers only the plans that have their own link", async () => {
    vi.stubEnv("POLAR_CHECKOUT_LINK_STARTER", "https://buy.polar.sh/polar_cl_starter");
    const result = await caller(acme, "admin").getCheckout();

    expect(result.configured).toBe(true);
    const starter = result.plans.find((entry) => entry.plan === "starter");
    const growth = result.plans.find((entry) => entry.plan === "growth");
    expect(starter?.url).toContain("buy.polar.sh/polar_cl_starter");
    // Growth is NOT quietly pointed at the Starter product.
    expect(growth?.url).toBeNull();
  });

  /** How the webhook maps a payment back to a row in this database. */
  it("attaches the company id as reference_id", async () => {
    vi.stubEnv("POLAR_CHECKOUT_LINK_STARTER", "https://buy.polar.sh/polar_cl_starter");
    const result = await caller(acme, "admin").getCheckout();
    const url = new URL(result.plans.find((entry) => entry.plan === "starter")!.url!);
    expect(url.searchParams.get("reference_id")).toBe(acme.companyId);
  });

  /**
   * A viewer sees the ladder but is handed no link, and `configured` still
   * reports what the deployment can sell — otherwise the page would tell a
   * viewer that billing is unconfigured and explain the wrong reason.
   */
  it("withholds the links from a viewer while still reporting the deployment", async () => {
    vi.stubEnv("POLAR_CHECKOUT_LINK_STARTER", "https://buy.polar.sh/polar_cl_starter");
    const result = await caller(acme, "viewer").getCheckout();

    expect(result.canCheckout).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.plans.every((entry) => entry.url === null)).toBe(true);
  });

  /**
   * A mistyped variable must not become a link on a billing page. Anything that
   * is not https on a polar.sh host is dropped rather than rendered.
   */
  it.each([
    "http://buy.polar.sh/polar_cl_x",
    "https://evil.example.com/polar_cl_x",
    "not-a-url",
  ])("ignores %s rather than linking to it", async (value) => {
    vi.stubEnv("POLAR_CHECKOUT_LINK_STARTER", value);
    const result = await caller(acme, "admin").getCheckout();
    expect(result.plans.find((entry) => entry.plan === "starter")?.url).toBeNull();
    expect(result.configured).toBe(false);
  });
});
