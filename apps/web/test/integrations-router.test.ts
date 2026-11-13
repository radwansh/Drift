import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { integrationsRouter } from "@/server/routers/integrations";

/**
 * The gates on `integrations.*`, on both axes.
 *
 * All four procedures were `protectedProcedure`, so any signed-in viewer on
 * any plan could list a company's connectors and connect or disconnect one by
 * calling the procedure directly. The page and the sidebar gated the screen
 * only — `test/integrations-ui.test.ts` holds that half, and this holds the
 * server's.
 *
 * Three companies, because the two axes have to be shown to compose and to be
 * separable: an Enterprise one to exercise the role axis, a free one to
 * exercise the plan axis, and a second Enterprise one so a write can be
 * checked for staying inside its own tenant. There is no row-level security
 * and no automatic filter.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  slug: string;
  users: Record<Role, string>;
}

let ctx: TestDb;
/** Enterprise. The company the connectors are actually usable on. */
let enterprise: Seeded;
/** Free — the plan every company in the product is on today. */
let free: Seeded;
/** A second Enterprise tenant, to prove a write does not cross into it. */
let neighbour: Seeded;

async function seedCompany(db: TestDb["db"], slug: string, settings: object): Promise<Seeded> {
  const companyRes = await db.execute(sql`
    INSERT INTO companies (name, slug, currency_code, settings)
    VALUES (${slug}, ${slug}, 'USD', ${JSON.stringify(settings)}::jsonb)
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
  return integrationsRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

async function storedProviders(companyId: string): Promise<string[]> {
  // The FILTER matters: a LEFT JOIN LATERAL over an absent `integrations` key
  // still yields one row with a NULL `i`, and an unfiltered `jsonb_agg` turns
  // that into `[null]` rather than the SQL NULL the `?? []` is for.
  const res = await ctx.db.execute(sql`
    SELECT jsonb_agg(i->>'provider' ORDER BY i->>'provider') FILTER (WHERE i IS NOT NULL) AS providers
    FROM companies c
    LEFT JOIN LATERAL jsonb_array_elements(c.settings->'integrations') i ON TRUE
    WHERE c.id = ${companyId}
  `);
  return (res.rows[0] as { providers: string[] | null }).providers ?? [];
}

beforeAll(async () => {
  ctx = await createTestDb();
  enterprise = await seedCompany(ctx.db, "entco", { plan: "enterprise" });
  free = await seedCompany(ctx.db, "freeco", {});
  neighbour = await seedCompany(ctx.db, "nextdoor", { plan: "enterprise" });
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("integrations reads are gated on the plan", () => {
  it("lets an Enterprise member list, and starts empty", async () => {
    expect(await caller(enterprise, "viewer").list()).toEqual([]);
  });

  /**
   * The plan axis is not the role axis: a viewer may read the list on
   * Enterprise, exactly as the sidebar shows them the entry.
   */
  it("lets an Enterprise viewer list, since reading is not a write", async () => {
    await expect(caller(enterprise, "viewer").list()).resolves.toBeDefined();
  });

  it("refuses a free company's admin, naming the plan and not the role", async () => {
    await expect(caller(free, "admin").list()).rejects.toThrow(/Enterprise feature/i);
    await expect(caller(free, "admin").list()).rejects.not.toThrow(/admin or manager role/i);
  });

  it("refuses syncStatus on a free plan too, stub though it is", async () => {
    await expect(
      caller(free, "admin").syncStatus({
        provider: "adp",
        periodId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(/Enterprise feature/i);
  });

  it("answers syncStatus on Enterprise", async () => {
    const status = await caller(enterprise, "viewer").syncStatus({
      provider: "adp",
      periodId: "00000000-0000-0000-0000-000000000000",
    });
    expect(status).toEqual({
      provider: "adp",
      periodId: "00000000-0000-0000-0000-000000000000",
      status: "not_synced",
      lastSyncAt: null,
    });
  });

  /**
   * `hasIntegrations` answers `false` for an unresolved plan, and the router
   * has to close on it rather than open — the same way the nav argument was
   * made required so the gate failed closed.
   */
  it("closes on a plan the vocabulary does not recognise", async () => {
    await ctx.db.execute(sql`
      UPDATE companies SET settings = settings || '{"plan":"platinum"}'::jsonb WHERE id = ${free.companyId}
    `);
    await expect(caller(free, "admin").list()).rejects.toThrow(/Enterprise feature/i);

    // And on a plan that is real but is not one of INTEGRATION_PLANS.
    await ctx.db.execute(sql`
      UPDATE companies SET settings = settings || '{"plan":"growth"}'::jsonb WHERE id = ${free.companyId}
    `);
    await expect(caller(free, "admin").list()).rejects.toThrow(/Enterprise feature/i);
  });
});

describe("integrations writes are gated on the role as well", () => {
  it("lets an Enterprise admin connect a provider", async () => {
    const result = await caller(enterprise, "admin").configure({
      provider: "adp",
      config: { apiKey: "test" },
    });
    expect(result).toEqual({ provider: "adp", configured: true });
    expect(await storedProviders(enterprise.companyId)).toEqual(["adp"]);
  });

  it("lets a manager connect one too, since EDITOR_ROLES has both", async () => {
    await caller(enterprise, "manager").configure({ provider: "sage", config: {} });
    expect(await storedProviders(enterprise.companyId)).toEqual(["adp", "sage"]);
  });

  /**
   * The case the move exists for. The wording is asserted and not just the
   * code, because `/FORBIDDEN/` alone would also match the plan gate beside it
   * and so would not say which one refused.
   */
  it("refuses a viewer on Enterprise, naming the role and not the plan", async () => {
    await expect(
      caller(enterprise, "viewer").configure({ provider: "workday", config: {} }),
    ).rejects.toThrow(/admin or manager role/i);
    await expect(
      caller(enterprise, "viewer").disconnect({ provider: "adp" }),
    ).rejects.toThrow(/admin or manager role/i);
    // And neither one wrote anything.
    expect(await storedProviders(enterprise.companyId)).toEqual(["adp", "sage"]);
  });

  it("refuses a free company's admin on the plan instead", async () => {
    await expect(
      caller(free, "admin").configure({ provider: "adp", config: {} }),
    ).rejects.toThrow(/Enterprise feature/i);
    expect(await storedProviders(free.companyId)).toEqual([]);
  });

  /** Both gates refuse; the role is checked first, so that is what is said. */
  it("tells a free company's viewer about the role, the first gate it fails", async () => {
    await expect(
      caller(free, "viewer").configure({ provider: "adp", config: {} }),
    ).rejects.toThrow(/admin or manager role/i);
  });

  it("lets an admin disconnect", async () => {
    const result = await caller(enterprise, "admin").disconnect({ provider: "adp" });
    expect(result).toEqual({ provider: "adp", disconnected: true });
    expect(await storedProviders(enterprise.companyId)).toEqual(["sage"]);
  });
});

/**
 * The gate's own lookup replaced the one each handler was doing for itself, so
 * it cost nothing. Asserted exactly rather than with `<=`, the convention
 * `annual-router.test.ts` and `employee-file-router.test.ts` use: 0 passes a
 * `<=` assertion too, so a shim that stopped counting would leave this green.
 *
 * Each count includes the middleware's user lookup, as those two suites' do.
 */
describe("gating cost no extra round trips", () => {
  it("list stays at 2: the user lookup and the settings lookup", async () => {
    ctx.resetRoundTrips();
    await caller(enterprise, "viewer").list();
    expect(ctx.roundTrips()).toBe(2);
  });

  it("configure stays at 3, the third being the write", async () => {
    ctx.resetRoundTrips();
    await caller(enterprise, "admin").configure({ provider: "bamboo", config: {} });
    expect(ctx.roundTrips()).toBe(3);
  });

  it("disconnect stays at 3", async () => {
    ctx.resetRoundTrips();
    await caller(enterprise, "admin").disconnect({ provider: "bamboo" });
    expect(ctx.roundTrips()).toBe(3);
  });

  /** A refusal costs the two reads and never reaches the write. */
  it("spends 2 refusing on the plan, and 1 refusing on the role", async () => {
    ctx.resetRoundTrips();
    await expect(caller(free, "admin").list()).rejects.toThrow(/Enterprise feature/i);
    expect(ctx.roundTrips()).toBe(2);

    ctx.resetRoundTrips();
    await expect(
      caller(enterprise, "viewer").configure({ provider: "adp", config: {} }),
    ).rejects.toThrow(/admin or manager role/i);
    // The role gate refuses before the settings lookup runs at all.
    expect(ctx.roundTrips()).toBe(1);
  });
});

describe("a write stays inside its own tenant", () => {
  it("writes only the caller's company, leaving the neighbour's connectors alone", async () => {
    await caller(neighbour, "admin").configure({ provider: "gusto", config: {} });

    expect(await storedProviders(neighbour.companyId)).toEqual(["gusto"]);
    expect(await storedProviders(enterprise.companyId)).toEqual(["sage"]);
  });

  it("gives each tenant its own list", async () => {
    const mine = await caller(enterprise, "admin").list();
    const theirs = await caller(neighbour, "admin").list();
    expect(mine.map((i) => i.provider)).toEqual(["sage"]);
    expect(theirs.map((i) => i.provider)).toEqual(["gusto"]);
  });

  it("does not disconnect a provider of the same name in another company", async () => {
    await caller(enterprise, "admin").configure({ provider: "gusto", config: {} });
    await caller(enterprise, "admin").disconnect({ provider: "gusto" });

    expect(await storedProviders(enterprise.companyId)).toEqual(["sage"]);
    // The neighbour's identically-named connector survives.
    expect(await storedProviders(neighbour.companyId)).toEqual(["gusto"]);
  });

  /**
   * The gate reads `companies.settings`, which is also where the plan lives,
   * so a write through it must not disturb the billing keys beside it.
   */
  it("keeps the plan and the billing keys that share the column", async () => {
    await ctx.db.execute(sql`
      UPDATE companies
      SET settings = settings || '{"stripeSubscriptionId":"sub_entco"}'::jsonb
      WHERE id = ${enterprise.companyId}
    `);
    await caller(enterprise, "admin").configure({ provider: "workday", config: {} });

    const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${enterprise.companyId}`);
    const settings = (res.rows[0] as { settings: Record<string, unknown> }).settings;
    expect(settings.plan).toBe("enterprise");
    expect(settings.stripeSubscriptionId).toBe("sub_entco");
    expect(await storedProviders(enterprise.companyId)).toEqual(["sage", "workday"]);
  });
});
