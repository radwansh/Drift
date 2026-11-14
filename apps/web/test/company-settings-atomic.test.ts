import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { annualRouter } from "@/server/routers/annual";
import { integrationsRouter } from "@/server/routers/integrations";

/**
 * Every writer of `companies.settings` writes it in **one statement**.
 *
 * `settings` is one free-form jsonb column shared by five features — `plan`,
 * the three Stripe keys, `integrations`, `fiscalStartMonth`, `aiEnabled` and
 * `tolerances`. A read-modify-write of such a column does not lose a
 * concurrent write to its *own* key, which is why nothing ever noticed: the
 * second writer wins, and that is what anyone would expect. What it loses is a
 * concurrent write to a **different** key. Two admins acting at once, one
 * turning AI off and one setting the fiscal start month, and whichever UPDATE
 * lands second writes back the whole object it read before the first one ran.
 * Among the keys that vanish that way is the company's billing state.
 *
 * `settings.updateCompany` was moved onto an atomic `jsonb ||` inside the
 * UPDATE; `test/settings-router.test.ts` holds that half. This holds the other
 * four writers — `annual.setFiscalStartMonth`, `annual.setAiEnabled`,
 * `integrations.configure` and `integrations.disconnect` — and the window they
 * each used to have.
 *
 * The interleaving is real rather than mimed: `ctx.beforeStatement` runs the
 * other caller's write immediately before the statement under test executes.
 * PGlite is one backend so two transactions cannot truly overlap, but a
 * read-modify-write loses a write precisely *because* its two halves are
 * separate statements — writing into that gap is the whole failure, and a
 * procedure that reads and writes in one statement has no gap to write into.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  users: Record<Role, string>;
}

let ctx: TestDb;
/** Enterprise, so the integrations plan gate lets the writes through. */
let atom: Seeded;

const BILLING = {
  plan: "enterprise",
  stripeSubscriptionId: "sub_atom",
  stripeSubscriptionStatus: "active",
  subscriptionPeriodEnd: "2027-03-31",
} as const;

async function seedCompany(slug: string, settings: object): Promise<Seeded> {
  const companyRes = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code, settings)
    VALUES (${slug}, ${slug}, 'USD', ${JSON.stringify(settings)}::jsonb)
    RETURNING id
  `);
  const companyId = (companyRes.rows[0] as { id: string }).id;

  const users = {} as Record<Role, string>;
  for (const role of ["admin", "manager", "viewer"] as Role[]) {
    const clerkUserId = `clerk_${slug}_${role}`;
    await ctx.db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@${slug}.test`}, ${role}, ${role}, ${clerkUserId})
    `);
    users[role] = clerkUserId;
  }
  return { companyId, users };
}

function annual(seeded: Seeded, role: Role) {
  return annualRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

function integrations(seeded: Seeded, role: Role) {
  return integrationsRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

async function settingsOf(companyId: string): Promise<Record<string, unknown>> {
  const res = await ctx.db.execute(sql`SELECT settings FROM companies WHERE id = ${companyId}`);
  return (res.rows[0] as { settings: Record<string, unknown> }).settings;
}

interface StoredIntegration extends Record<string, unknown> {
  provider?: string;
}

async function connectorsOf(companyId: string): Promise<StoredIntegration[]> {
  const settings = await settingsOf(companyId);
  return (settings.integrations as StoredIntegration[]) ?? [];
}

/** Sets the column directly, the way a concurrent writer's UPDATE would. */
async function writeDirectly(companyId: string, patch: Record<string, unknown>): Promise<void> {
  // Through `raw`, not `db`: a statement sent through `db` is counted as a
  // round trip, and these run inside procedures whose budgets are asserted.
  await ctx.raw.query(`UPDATE companies SET settings = settings || $2::jsonb WHERE id = $1`, [
    companyId,
    JSON.stringify(patch),
  ]);
}

/** Resets the column to a known state without going through any procedure. */
async function resetSettings(companyId: string, settings: object): Promise<void> {
  await ctx.raw.query(`UPDATE companies SET settings = $2::jsonb WHERE id = $1`, [
    companyId,
    JSON.stringify(settings),
  ]);
}

/**
 * Runs `call`, landing `interloper` immediately before the first UPDATE `call`
 * issues — the moment a read-modify-write is defenceless.
 *
 * Matching on the statement text rather than on a call count keeps this
 * independent of how many reads the procedure does, so it would have caught
 * the old three-statement shape and catches the new two-statement one.
 */
async function interleaveBeforeTheWrite(
  call: () => Promise<unknown>,
  interloper: () => Promise<unknown>,
): Promise<void> {
  let fired = false;
  const remove = ctx.beforeStatement(async (text) => {
    if (fired || !/^\s*update\s/i.test(text)) return;
    // Set before awaiting, so an UPDATE issued by the interloper itself cannot
    // re-enter this even if the harness stopped suppressing hooks.
    fired = true;
    await interloper();
  });
  try {
    await call();
  } finally {
    remove();
  }
  // Without this the test would pass just as well by never interleaving.
  expect(fired).toBe(true);
}

beforeAll(async () => {
  ctx = await createTestDb();
  atom = await seedCompany("atomco", BILLING);
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("annual.setFiscalStartMonth and annual.setAiEnabled write one key", () => {
  it("writes the fiscal start month and leaves billing alone", async () => {
    await resetSettings(atom.companyId, BILLING);

    expect(await annual(atom, "admin").setFiscalStartMonth({ month: 4 })).toEqual({ month: 4 });

    expect(await settingsOf(atom.companyId)).toEqual({ ...BILLING, fiscalStartMonth: 4 });
  });

  it("writes aiEnabled without disturbing the month written before it", async () => {
    expect(await annual(atom, "manager").setAiEnabled({ enabled: false })).toEqual({
      enabled: false,
    });

    expect(await settingsOf(atom.companyId)).toEqual({
      ...BILLING,
      fiscalStartMonth: 4,
      aiEnabled: false,
    });
  });

  it("overwrites its own key rather than growing a second one", async () => {
    await annual(atom, "admin").setFiscalStartMonth({ month: 7 });
    await annual(atom, "admin").setAiEnabled({ enabled: true });

    expect(await settingsOf(atom.companyId)).toEqual({
      ...BILLING,
      fiscalStartMonth: 7,
      aiEnabled: true,
    });
  });

  /**
   * `jsonb || jsonb` appends when either side is not an object, so a column
   * holding a scalar would turn into an array and every `settings.plan` read
   * would go quietly undefined. Only a direct write can get it into that
   * state — which is how `plan` is set today, so a typo there is reachable.
   */
  it("merges into a column holding a non-object, keeping it an object", async () => {
    await ctx.raw.query(`UPDATE companies SET settings = 'null'::jsonb WHERE id = $1`, [
      atom.companyId,
    ]);
    await annual(atom, "admin").setAiEnabled({ enabled: false });

    const after = await settingsOf(atom.companyId);
    expect(Array.isArray(after)).toBe(false);
    expect(after).toEqual({ aiEnabled: false });
  });

  it("still refuses a viewer, so writing in SQL did not widen the gate", async () => {
    await resetSettings(atom.companyId, BILLING);

    await expect(annual(atom, "viewer").setFiscalStartMonth({ month: 2 })).rejects.toThrow(
      /admin or manager role/i,
    );
    await expect(annual(atom, "viewer").setAiEnabled({ enabled: false })).rejects.toThrow(
      /admin or manager role/i,
    );
    expect(await settingsOf(atom.companyId)).toEqual(BILLING);
  });

  /**
   * Exactly, not `<=`: 0 passes a `<=` assertion too, which is the convention
   * `annual-router.test.ts` and `employee-file-router.test.ts` both use.
   *
   * Two, not three. The lookup each of these did for itself is gone with the
   * read-modify-write, so the atomic version is also one request cheaper —
   * the middleware's user lookup, then the write.
   */
  it("costs 2 round trips each: the middleware lookup and the write", async () => {
    ctx.resetRoundTrips();
    await annual(atom, "admin").setFiscalStartMonth({ month: 1 });
    expect(ctx.roundTrips()).toBe(2);

    ctx.resetRoundTrips();
    await annual(atom, "admin").setAiEnabled({ enabled: true });
    expect(ctx.roundTrips()).toBe(2);
  });
});

describe("a concurrent write to another key survives", () => {
  it("keeps an aiEnabled write that lands while setFiscalStartMonth is in flight", async () => {
    await resetSettings(atom.companyId, BILLING);

    await interleaveBeforeTheWrite(
      () => annual(atom, "admin").setFiscalStartMonth({ month: 9 }),
      () => writeDirectly(atom.companyId, { aiEnabled: false }),
    );

    const after = await settingsOf(atom.companyId);
    expect(after.fiscalStartMonth).toBe(9);
    // The key the read-modify-write would have written back over.
    expect(after.aiEnabled).toBe(false);
    expect(after.plan).toBe("enterprise");
  });

  it("keeps a billing write that lands while setAiEnabled is in flight", async () => {
    await resetSettings(atom.companyId, { plan: "enterprise" });

    await interleaveBeforeTheWrite(
      () => annual(atom, "admin").setAiEnabled({ enabled: true }),
      () =>
        writeDirectly(atom.companyId, {
          stripeSubscriptionId: "sub_new",
          stripeSubscriptionStatus: "past_due",
        }),
    );

    const after = await settingsOf(atom.companyId);
    expect(after.aiEnabled).toBe(true);
    expect(after.stripeSubscriptionId).toBe("sub_new");
    expect(after.stripeSubscriptionStatus).toBe("past_due");
  });

  /** The two-admins case, both of them going through the router. */
  it("keeps both keys when the two annual setters interleave", async () => {
    await resetSettings(atom.companyId, BILLING);

    await interleaveBeforeTheWrite(
      () => annual(atom, "admin").setFiscalStartMonth({ month: 10 }),
      () => annual(atom, "manager").setAiEnabled({ enabled: false }),
    );

    expect(await settingsOf(atom.companyId)).toEqual({
      ...BILLING,
      fiscalStartMonth: 10,
      aiEnabled: false,
    });
  });

  it("keeps an aiEnabled write that lands while integrations.configure is in flight", async () => {
    await resetSettings(atom.companyId, BILLING);

    await interleaveBeforeTheWrite(
      () => integrations(atom, "admin").configure({ provider: "adp", config: { apiKey: "k" } }),
      () => writeDirectly(atom.companyId, { aiEnabled: false }),
    );

    const after = await settingsOf(atom.companyId);
    expect(after.aiEnabled).toBe(false);
    expect(after.plan).toBe("enterprise");
    expect((after.integrations as StoredIntegration[]).map((i) => i.provider)).toEqual(["adp"]);
  });

  it("keeps a fiscalStartMonth write that lands while integrations.disconnect is in flight", async () => {
    await resetSettings(atom.companyId, {
      ...BILLING,
      integrations: [{ provider: "adp" }, { provider: "sage" }],
    });

    await interleaveBeforeTheWrite(
      () => integrations(atom, "admin").disconnect({ provider: "adp" }),
      () => writeDirectly(atom.companyId, { fiscalStartMonth: 6 }),
    );

    const after = await settingsOf(atom.companyId);
    expect(after.fiscalStartMonth).toBe(6);
    expect((after.integrations as StoredIntegration[]).map((i) => i.provider)).toEqual(["sage"]);
  });

  /**
   * The array edit is per element, so an atomic `configure` keeps more than
   * the neighbouring keys: two admins connecting two *different* providers at
   * once both land. A whole-object write could only keep one of them.
   */
  it("keeps a connector another caller added mid-flight", async () => {
    await resetSettings(atom.companyId, BILLING);

    await interleaveBeforeTheWrite(
      () => integrations(atom, "admin").configure({ provider: "sage", config: {} }),
      () => writeDirectly(atom.companyId, { integrations: [{ provider: "workday" }] }),
    );

    expect((await connectorsOf(atom.companyId)).map((i) => i.provider)).toEqual([
      "workday",
      "sage",
    ]);
  });

  it("keeps a connector another caller added while disconnecting a third", async () => {
    await resetSettings(atom.companyId, {
      ...BILLING,
      integrations: [{ provider: "adp" }, { provider: "sage" }],
    });

    await interleaveBeforeTheWrite(
      () => integrations(atom, "admin").disconnect({ provider: "adp" }),
      () =>
        writeDirectly(atom.companyId, {
          integrations: [{ provider: "adp" }, { provider: "sage" }, { provider: "gusto" }],
        }),
    );

    expect((await connectorsOf(atom.companyId)).map((i) => i.provider)).toEqual(["sage", "gusto"]);
  });
});

/**
 * The array edit moved from JS into `jsonb_agg`, so its semantics are worth
 * pinning beyond the provider names `integrations-router.test.ts` checks:
 * `configure` upserts by provider, and the upsert is a merge of the config
 * into the element that is already there, in place.
 */
describe("the integrations array edit behaves as it did in JS", () => {
  it("appends a new connector with its config and a connectedAt stamp", async () => {
    await resetSettings(atom.companyId, BILLING);

    const before = Date.now();
    await integrations(atom, "admin").configure({
      provider: "adp",
      config: { apiKey: "k1", region: "eu" },
    });

    const [connector, ...rest] = await connectorsOf(atom.companyId);
    expect(rest).toEqual([]);
    expect(connector).toMatchObject({ provider: "adp", apiKey: "k1", region: "eu" });
    const connectedAt = Date.parse(connector?.connectedAt as string);
    expect(Number.isNaN(connectedAt)).toBe(false);
    expect(connectedAt).toBeGreaterThanOrEqual(before - 1000);
  });

  it("merges the config into an existing connector, in place, keeping its stamp", async () => {
    await integrations(atom, "admin").configure({ provider: "sage", config: {} });
    const [adpBefore] = await connectorsOf(atom.companyId);

    await integrations(atom, "admin").configure({
      provider: "adp",
      config: { apiKey: "k2", extra: true },
    });

    const after = await connectorsOf(atom.companyId);
    // Order is the array's order, not "most recently configured last".
    expect(after.map((i) => i.provider)).toEqual(["adp", "sage"]);
    expect(after[0]).toMatchObject({
      provider: "adp",
      apiKey: "k2",
      region: "eu",
      extra: true,
      connectedAt: adpBefore?.connectedAt as string,
    });
  });

  it("removes only the named connector, and takes an absent one as a no-op", async () => {
    await integrations(atom, "admin").disconnect({ provider: "nobody" });
    expect((await connectorsOf(atom.companyId)).map((i) => i.provider)).toEqual(["adp", "sage"]);

    await integrations(atom, "admin").disconnect({ provider: "adp" });
    expect((await connectorsOf(atom.companyId)).map((i) => i.provider)).toEqual(["sage"]);

    await integrations(atom, "admin").disconnect({ provider: "sage" });
    // An empty array, as the JS `filter` produced, not a missing key.
    expect(await connectorsOf(atom.companyId)).toEqual([]);
    expect(await settingsOf(atom.companyId)).toHaveProperty("integrations");
  });

  it("treats an integrations key holding a non-array as no connectors", async () => {
    await resetSettings(atom.companyId, { ...BILLING, integrations: 5 });

    await integrations(atom, "admin").configure({ provider: "adp", config: {} });
    expect((await connectorsOf(atom.companyId)).map((i) => i.provider)).toEqual(["adp"]);

    await resetSettings(atom.companyId, { ...BILLING, integrations: "nonsense" });
    await integrations(atom, "admin").disconnect({ provider: "adp" });
    expect(await connectorsOf(atom.companyId)).toEqual([]);
  });

  /** A scalar in the array matches no provider, and must survive untouched. */
  it("leaves an element that is not an object alone", async () => {
    await resetSettings(atom.companyId, {
      ...BILLING,
      integrations: ["junk", { provider: "adp", a: 1 }],
    });

    await integrations(atom, "admin").configure({ provider: "adp", config: { a: 2 } });
    expect(await connectorsOf(atom.companyId)).toEqual([
      "junk" as never,
      { provider: "adp", a: 2 },
    ]);

    await integrations(atom, "admin").disconnect({ provider: "adp" });
    expect(await connectorsOf(atom.companyId)).toEqual(["junk" as never]);
  });

  it("writes nothing for a viewer, and nothing for a company off the plan", async () => {
    await resetSettings(atom.companyId, BILLING);

    await expect(
      integrations(atom, "viewer").configure({ provider: "adp", config: {} }),
    ).rejects.toThrow(/admin or manager role/i);

    await resetSettings(atom.companyId, { plan: "free" });
    await expect(
      integrations(atom, "admin").configure({ provider: "adp", config: {} }),
    ).rejects.toThrow(/Enterprise feature/i);

    expect(await settingsOf(atom.companyId)).toEqual({ plan: "free" });
  });
});

/**
 * `setFiscalStartMonth` clears the summary memo, and must keep doing so: the
 * memo keys on the procedure's inputs, not on the company's settings, so a
 * fiscal start month that moves every year boundary would otherwise be
 * invisible for up to 30 seconds. Writing in one statement is exactly the kind
 * of edit that could drop the line.
 */
describe("setFiscalStartMonth still clears the summary memo", () => {
  it("makes the next identical getSummary rebuild instead of answering from memo", async () => {
    await resetSettings(atom.companyId, BILLING);
    const caller = annual(atom, "admin");

    await caller.getSummary({ year: 2026 });

    ctx.resetRoundTrips();
    await caller.getSummary({ year: 2026 });
    // Only the middleware's user lookup: the summary itself came from the memo.
    expect(ctx.roundTrips()).toBe(1);

    await caller.setFiscalStartMonth({ month: 4 });

    ctx.resetRoundTrips();
    await caller.getSummary({ year: 2026 });
    expect(ctx.roundTrips()).toBeGreaterThan(1);
  });
});
