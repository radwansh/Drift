import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { loadAccount } from "@/server/current-account";
import { visibleNavItems } from "@/lib/constants";

/**
 * `currentAccount`, now that it carries the plan as well as the role.
 *
 * `(main)/layout.tsx` gates the sidebar with both and every page under it
 * gates itself, so the claim this file exists to hold is the **round-trip
 * count**: the plan lives on `companies` rather than on `users`, and carrying
 * it must not cost a query per page view. `annual-router.test.ts` and
 * `employee-file-router.test.ts` pin their budgets with `toBe` for the same
 * reason — `<=` passed when a shim stopped counting altogether.
 *
 * `loadAccount` is tested rather than the `cache()`d `currentAccount`, which
 * cannot run outside a request: `auth()` has no session to read.
 */

let ctx: TestDb;
let companyId: string;

async function setPlan(plan: unknown): Promise<void> {
  const settings = plan === undefined ? {} : { plan };
  await ctx.db.execute(sql`
    UPDATE companies SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${companyId}
  `);
}

beforeAll(async () => {
  ctx = await createTestDb();
  const res = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code) VALUES ('Acme', 'acme', 'USD')
    RETURNING id
  `);
  companyId = (res.rows[0] as { id: string }).id;
  await ctx.db.execute(sql`
    INSERT INTO users (company_id, email, name, role, clerk_user_id)
    VALUES (${companyId}, 'admin@acme.test', 'Admin', 'admin', 'clerk_acme_admin')
  `);
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("loadAccount", () => {
  it("resolves the user and the plan in a single round trip", async () => {
    await setPlan("enterprise");
    ctx.resetRoundTrips();
    const account = await loadAccount(ctx.db, "clerk_acme_admin");
    expect(ctx.roundTrips()).toBe(1);
    expect(account.role).toBe("admin");
    expect(account.companyId).toBe(companyId);
    expect(account.plan).toBe("enterprise");
  });

  it("returns the user row's own fields, so every existing caller is unchanged", async () => {
    const account = await loadAccount(ctx.db, "clerk_acme_admin");
    expect(account.email).toBe("admin@acme.test");
    expect(account.name).toBe("Admin");
    expect(account.clerkUserId).toBe("clerk_acme_admin");
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("defaults an absent plan key to free, as getBillingInfo does", async () => {
    await setPlan(undefined);
    expect((await loadAccount(ctx.db, "clerk_acme_admin")).plan).toBe("free");
  });

  it("reads a plan however it is cased", async () => {
    await setPlan("Enterprise");
    expect((await loadAccount(ctx.db, "clerk_acme_admin")).plan).toBe("enterprise");
  });

  /**
   * A value nobody put there must not be read as "free". "Free" is a real
   * plan with a real sentence about money on the billing page; `null` says the
   * plan is unknown, and every gate treats unknown as closed.
   */
  it("answers null for a plan the vocabulary does not recognise", async () => {
    for (const value of ["professional", 299, null]) {
      await setPlan(value);
      const account = await loadAccount(ctx.db, "clerk_acme_admin");
      expect(account.plan, `plan ${JSON.stringify(value)}`).toBeNull();
      // And the nav closes on it, rather than opening.
      expect(visibleNavItems(account.role, account.plan).map((i) => i.href)).not.toContain(
        "/integrations",
      );
    }
  });

  it("provisions an account that has no row yet, and reads the new company's plan", async () => {
    ctx.resetRoundTrips();
    const account = await loadAccount(ctx.db, "clerk_brand_new");
    // The provisioning path costs more than one, once per account rather than
    // once per request: the join that found nothing, then `ensureUser`.
    expect(ctx.roundTrips()).toBeGreaterThan(1);
    expect(account.companyId).not.toBe(companyId);
    expect(account.role).toBe("admin");
    expect(account.plan).toBe("free");

    // And the second resolution is back to one query.
    ctx.resetRoundTrips();
    const again = await loadAccount(ctx.db, "clerk_brand_new");
    expect(ctx.roundTrips()).toBe(1);
    expect(again.id).toBe(account.id);
  });
});
