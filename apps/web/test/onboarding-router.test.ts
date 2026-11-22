import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";

/**
 * Mocked because it reaches Clerk's Backend API, which needs a secret key this
 * repo does not have in any environment. The seam is
 * `server/clerk-invitations.ts` precisely so that the *decision* — send first,
 * write second, refuse rather than pretend — is testable without a key, which
 * is the part that was wrong: `auth.inviteUser` inserted a row and sent
 * nothing. What cannot be verified here is the HTTP call itself.
 */
const clerk = vi.hoisted(() => ({ sendClerkInvitation: vi.fn() }));
vi.mock("@/server/clerk-invitations", () => ({
  sendClerkInvitation: clerk.sendClerkInvitation,
  isClerkConfigured: () => true,
  invitationRedirectUrl: () => "https://clarivo-app.com/sign-up",
}));

/**
 * Mocked so the call can be *asserted*, not replaced: the real function is a
 * placeholder another agent owns that returns null, and the mock's default
 * return is null too, so the path under test is the one that ships today.
 */
const email = vi.hoisted(() => ({ scheduleTrialEndedEmail: vi.fn() }));
vi.mock("@/server/trial-email", () => ({
  scheduleTrialEndedEmail: email.scheduleTrialEndedEmail,
  cancelTrialEndedEmail: vi.fn(),
}));

const { onboardingRouter } = await import("@/server/routers/onboarding");
const { settingsRouter } = await import("@/server/routers/settings");
const { ensureUser } = await import("@/server/ensure-user");
const { loadAccount } = await import("@/server/current-account");
const { onboardingCompleted, trialEndOf, TRIAL_DAYS, TRIAL_MS, TRIAL_SETTINGS_KEY_NAMES } =
  await import("@/lib/entitlement");

/**
 * The five-step onboarding's writes, against a real Postgres.
 *
 * Three things here are worth more than the rest:
 *
 * 1. **Finishing twice changes nothing.** A double-submit, a retried request
 *    or a bookmarked finish URL must not restart or lengthen a trial. The
 *    second call has to match no row at all — `updated_at` included — rather
 *    than write the same values again.
 * 2. **Every write is one statement that merges.** `companies.settings` is one
 *    jsonb column shared by five features, so a write that replaced it, or
 *    read-modified-wrote it, would silently destroy a company's billing state.
 *    The interleaving here is the same technique
 *    `company-settings-atomic.test.ts` uses, and it is real: the hook lands the
 *    other caller's write immediately before the statement under test.
 * 3. **The five trial keys stay unwritable from the settings form.** This
 *    router is the only path to them, and that is what makes `trialEndOf()`'s
 *    cap a lock rather than a suggestion.
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

async function seedCompany(slug: string, name: string, currency: string): Promise<Seeded> {
  const companyRes = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES (${name}, ${slug}, ${currency})
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
  return { companyId, slug, users };
}

function caller(seeded: Seeded, role: Role) {
  return onboardingRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

function settingsCaller(seeded: Seeded, role: Role) {
  return settingsRouter.createCaller({ userId: seeded.users[role], db: ctx.db } as never);
}

interface CompanyRow {
  name: string;
  currency_code: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

async function companyOf(companyId: string): Promise<CompanyRow> {
  const res = await ctx.db.execute(sql`
    SELECT name, currency_code, settings, updated_at FROM companies WHERE id = ${companyId}
  `);
  return res.rows[0] as unknown as CompanyRow;
}

/** Sets the column directly, the way a concurrent writer's UPDATE would. */
async function writeDirectly(companyId: string, patch: Record<string, unknown>): Promise<void> {
  // Through `raw`, not `db`: a statement sent through `db` counts as a round
  // trip and would spoil the budget assertions around it.
  await ctx.raw.query(`UPDATE companies SET settings = settings || $2::jsonb WHERE id = $1`, [
    companyId,
    JSON.stringify(patch),
  ]);
}

async function resetCompany(
  companyId: string,
  name: string,
  currency: string,
  settings: object,
): Promise<void> {
  await ctx.raw.query(
    `UPDATE companies SET name = $2, currency_code = $3, settings = $4::jsonb WHERE id = $1`,
    [companyId, name, currency, JSON.stringify(settings)],
  );
}

/** Counts the statements a call issues, by SQL text. */
async function countStatements(
  call: () => Promise<unknown>,
  pattern: RegExp,
): Promise<number> {
  let seen = 0;
  const remove = ctx.beforeStatement((text) => {
    if (pattern.test(text)) seen += 1;
  });
  try {
    await call();
  } finally {
    remove();
  }
  return seen;
}

/**
 * Runs `call`, landing `interloper` immediately before the first UPDATE it
 * issues — the moment a read-modify-write is defenceless.
 */
async function interleaveBeforeTheWrite(
  call: () => Promise<unknown>,
  interloper: () => Promise<unknown>,
): Promise<void> {
  let fired = false;
  const remove = ctx.beforeStatement(async (text) => {
    if (fired || !/^\s*update\s/i.test(text)) return;
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
  // The name `ensureUser` writes when Clerk gave it nothing, which is what
  // step 1 exists to replace.
  acme = await seedCompany("acme", "My company", "USD");
  globex = await seedCompany("globex", "Globex SARL", "LBP");
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(() => {
  clerk.sendClerkInvitation.mockReset();
  clerk.sendClerkInvitation.mockResolvedValue({ ok: true, invitationId: "inv_test" });
  email.scheduleTrialEndedEmail.mockReset();
  // Null is what the placeholder returns today, in every environment.
  email.scheduleTrialEndedEmail.mockResolvedValue(null);
});

describe("onboarding.getState", () => {
  beforeEach(async () => {
    await resetCompany(acme.companyId, "My company", "USD", {});
  });

  it("reports an untouched company: the placeholder name, nothing saved", async () => {
    const state = await caller(acme, "admin").getState();
    expect(state).toMatchObject({
      isAdmin: true,
      name: "My company",
      currencyCode: "USD",
      country: null,
      industry: null,
      fiscalStartMonth: null,
      stepsSaved: 0,
      currencyLocked: false,
      ownEmail: "admin@acme.test",
    });
  });

  /**
   * `(main)/layout.tsx` sends **every** member of an un-onboarded company here,
   * not only the admin — which for a company predating this release means a
   * manager or a viewer can land on the page. They are told who has to finish
   * it, so `getState` has to answer them rather than refuse.
   */
  it("answers a manager and a viewer, telling them they are not the admin", async () => {
    for (const role of ["manager", "viewer"] as Role[]) {
      const state = await caller(acme, role).getState();
      expect(state.isAdmin).toBe(false);
      expect(state.name).toBe("My company");
    }
  });

  /**
   * Exactly, not `<=`: 0 passes a `<=` assertion too, which is the convention
   * `annual-router.test.ts` and `employee-file-router.test.ts` both use. Two:
   * the middleware's user lookup, then one batch for the company row and the
   * has-a-period probe. The settings ride along on the middleware's join and
   * are not read again.
   */
  it("costs 2 round trips", async () => {
    ctx.resetRoundTrips();
    await caller(acme, "admin").getState();
    expect(ctx.roundTrips()).toBe(2);
  });

  it("reads back what the steps stored, and keeps tenants apart", async () => {
    await caller(acme, "admin").saveCompanyBasics({ name: "Acme Payroll", country: "AU" });
    await caller(acme, "admin").saveIndustry({ industry: "Healthcare" });
    await caller(acme, "admin").saveFiscalStartMonth({ month: 7 });

    const state = await caller(acme, "admin").getState();
    expect(state).toMatchObject({
      name: "Acme Payroll",
      country: "AU",
      industry: "Healthcare",
      fiscalStartMonth: 7,
    });

    // Globex saw none of it.
    const other = await caller(globex, "admin").getState();
    expect(other).toMatchObject({ name: "Globex SARL", country: null, currencyCode: "LBP" });
  });

  /** A hand-written country or industry must not reach the page as a value. */
  it("reads an unusable stored country or industry as nothing", async () => {
    await writeDirectly(acme.companyId, { country: "ZZ", industry: 7 });
    const state = await caller(acme, "admin").getState();
    expect(state.country).toBeNull();
    expect(state.industry).toBeNull();
  });
});

describe("the steps save, each in one statement", () => {
  beforeEach(async () => {
    await resetCompany(acme.companyId, "My company", "USD", {});
  });

  it("step 1 writes the name and the country, and suggests the rest from it", async () => {
    const result = await caller(acme, "admin").saveCompanyBasics({
      name: "Acme Payroll",
      country: "AU",
    });
    expect(result).toEqual({
      name: "Acme Payroll",
      country: "AU",
      suggestedCurrency: "AUD",
      suggestedFiscalStartMonth: 7,
    });

    const row = await companyOf(acme.companyId);
    expect(row.name).toBe("Acme Payroll");
    expect(row.settings).toEqual({ country: "AU", onboardingStep: 1 });
  });

  it("step 1 trims the name and holds the 2..200 bounds", async () => {
    await caller(acme, "admin").saveCompanyBasics({ name: "  Acme  ", country: "US" });
    expect((await companyOf(acme.companyId)).name).toBe("Acme");

    for (const name of ["", " ", "A", " A ", "a".repeat(201)]) {
      await expect(
        caller(acme, "admin").saveCompanyBasics({ name, country: "US" }),
      ).rejects.toThrow();
    }
    // Nothing above landed.
    expect((await companyOf(acme.companyId)).name).toBe("Acme");
  });

  it("step 1 refuses a country that is not an ISO 3166-1 code", async () => {
    for (const country of ["", "A", "AUS", "ZZ", "au"]) {
      await expect(
        caller(acme, "admin").saveCompanyBasics({ name: "Acme", country }),
      ).rejects.toThrow();
    }
    expect((await companyOf(acme.companyId)).settings).toEqual({});
  });

  it("step 2 writes an industry, and clears it rather than storing a null", async () => {
    await caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "GB" });

    await caller(acme, "admin").saveIndustry({ industry: "Technology" });
    expect((await companyOf(acme.companyId)).settings).toMatchObject({ industry: "Technology" });

    await caller(acme, "admin").saveIndustry({ industry: null });
    const after = (await companyOf(acme.companyId)).settings;
    // Deleted, not stored as null: a stored null is a value, and "no industry"
    // is the absence of one.
    expect(after).not.toHaveProperty("industry");
    expect(after).toMatchObject({ country: "GB", onboardingStep: 2 });
  });

  it("step 2 refuses an industry that is not on the list", async () => {
    await expect(
      caller(acme, "admin").saveIndustry({ industry: "Agriculture" as never }),
    ).rejects.toThrow();
  });

  it("step 3 writes the currency, upper-casing it", async () => {
    await caller(acme, "admin").saveCurrency({ currencyCode: "aud" });
    const row = await companyOf(acme.companyId);
    expect(row.currency_code).toBe("AUD");
    expect(row.settings).toMatchObject({ onboardingStep: 3 });
  });

  it("step 4 writes the fiscal start month, bounded to 1..12", async () => {
    await caller(acme, "admin").saveFiscalStartMonth({ month: 7 });
    expect((await companyOf(acme.companyId)).settings).toMatchObject({ fiscalStartMonth: 7 });

    for (const month of [0, 13, -1, 1.5, Number.NaN]) {
      await expect(
        caller(acme, "admin").saveFiscalStartMonth({ month }),
      ).rejects.toThrow();
    }
    expect((await companyOf(acme.companyId)).settings).toMatchObject({ fiscalStartMonth: 7 });
  });

  /**
   * The progress marker is what makes "resume at the first incomplete step"
   * possible at all: steps 2, 3 and 5 leave no trace in the data that
   * distinguishes an answer from an unasked question — step 3 least of all,
   * since `currency_code` is `NOT NULL DEFAULT 'USD'`.
   */
  it("advances the step marker, and never moves it backwards", async () => {
    await caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "US" });
    await caller(acme, "admin").saveIndustry({ industry: "Retail" });
    await caller(acme, "admin").saveCurrency({ currencyCode: "USD" });
    await caller(acme, "admin").saveFiscalStartMonth({ month: 4 });
    expect((await caller(acme, "admin").getState()).stepsSaved).toBe(4);

    // Going Back to step 1 and saving again must not lose the later steps.
    await caller(acme, "admin").saveCompanyBasics({ name: "Acme Two", country: "GB" });
    expect((await caller(acme, "admin").getState()).stepsSaved).toBe(4);
  });

  /**
   * Every step merges into `companies.settings` rather than replacing it, so a
   * company's plan and billing state survive onboarding. A replace here would
   * downgrade a paying company to the "free" default every reader falls back
   * to.
   */
  it("keeps the billing keys a replace would have destroyed", async () => {
    const BILLING = {
      plan: "enterprise",
      polarSubscriptionId: "sub_acme",
      polarSubscriptionStatus: "active",
    };
    await resetCompany(acme.companyId, "My company", "USD", BILLING);

    await caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "DE" });
    await caller(acme, "admin").saveIndustry({ industry: "Manufacturing" });
    await caller(acme, "admin").saveCurrency({ currencyCode: "EUR" });
    await caller(acme, "admin").saveFiscalStartMonth({ month: 1 });

    expect((await companyOf(acme.companyId)).settings).toEqual({
      ...BILLING,
      country: "DE",
      industry: "Manufacturing",
      fiscalStartMonth: 1,
      onboardingStep: 4,
    });
  });

  it("keeps a concurrent write to another key that lands mid-flight", async () => {
    await resetCompany(acme.companyId, "My company", "USD", { plan: "enterprise" });

    await interleaveBeforeTheWrite(
      () => caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "FR" }),
      () => writeDirectly(acme.companyId, { aiEnabled: false }),
    );

    const row = await companyOf(acme.companyId);
    expect(row.name).toBe("Acme");
    expect(row.settings).toMatchObject({
      country: "FR",
      // The key a read-modify-write would have written back over.
      aiEnabled: false,
      plan: "enterprise",
    });
  });

  /**
   * `jsonb || jsonb` appends when either side is not an object, so a column
   * holding a scalar would become an array and every `settings.plan` read would
   * go quietly undefined. Only a direct write can reach that state — which is
   * how `plan` is set today, so a typo there is reachable.
   */
  it("merges into a column holding a non-object, keeping it an object", async () => {
    await ctx.raw.query(`UPDATE companies SET settings = 'null'::jsonb WHERE id = $1`, [
      acme.companyId,
    ]);
    await caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "US" });

    const settings = (await companyOf(acme.companyId)).settings;
    expect(Array.isArray(settings)).toBe(false);
    expect(settings).toEqual({ country: "US", onboardingStep: 1 });
  });

  it("writes step 1 in a single UPDATE", async () => {
    const updates = await countStatements(
      () => caller(acme, "admin").saveCompanyBasics({ name: "Acme", country: "US" }),
      /^\s*update\s+"?companies"?/i,
    );
    expect(updates).toBe(1);
  });
});

/**
 * The base currency labels every figure in the product and converts nothing, so
 * changing it after payroll exists would relabel a year of figures as a
 * currency they were never paid in.
 */
describe("step 3 is read-only once the company has payroll", () => {
  async function addReadyPeriod(companyId: string, currency: string): Promise<void> {
    await ctx.raw.query(
      `INSERT INTO payroll_periods (company_id, period_type, period_start, period_end, currency_code, status)
       VALUES ($1, 'monthly', '2026-06-01', '2026-06-30', $2, 'ready')`,
      [companyId, currency],
    );
  }

  beforeEach(async () => {
    await resetCompany(globex.companyId, "Globex SARL", "LBP", {});
    await ctx.raw.query(`DELETE FROM payroll_periods WHERE company_id = $1`, [globex.companyId]);
  });

  it("reports the currency as locked, and refuses a change", async () => {
    await addReadyPeriod(globex.companyId, "LBP");

    expect((await caller(globex, "admin").getState()).currencyLocked).toBe(true);
    await expect(
      caller(globex, "admin").saveCurrency({ currencyCode: "USD" }),
    ).rejects.toThrow(/already has payroll in LBP/i);
    expect((await companyOf(globex.companyId)).currency_code).toBe("LBP");
  });

  /** Continue on a read-only step is not a change, so it must still advance. */
  it("accepts the currency that is already stored", async () => {
    await addReadyPeriod(globex.companyId, "LBP");

    await expect(
      caller(globex, "admin").saveCurrency({ currencyCode: "LBP" }),
    ).resolves.toEqual({ currencyCode: "LBP" });
    expect((await caller(globex, "admin").getState()).stepsSaved).toBe(3);
  });

  /**
   * `status = 'ready'` is the filter every annual and Employee File query uses,
   * so a `ready` period is exactly one whose figures a customer can see. A
   * failed upload has nothing rendered against it, and treating one as a lock
   * would leave a company whose first upload failed unable to ever set its
   * currency.
   */
  it("does not lock on a period that is not ready", async () => {
    await ctx.raw.query(
      `INSERT INTO payroll_periods (company_id, period_type, period_start, period_end, currency_code, status)
       VALUES ($1, 'monthly', '2026-06-01', '2026-06-30', 'LBP', 'failed')`,
      [globex.companyId],
    );

    expect((await caller(globex, "admin").getState()).currencyLocked).toBe(false);
    await expect(
      caller(globex, "admin").saveCurrency({ currencyCode: "EUR" }),
    ).resolves.toEqual({ currencyCode: "EUR" });
  });
});

describe("every mutation is admin-only", () => {
  beforeEach(async () => {
    await resetCompany(acme.companyId, "My company", "USD", { country: "US" });
  });

  const attempts: [string, (seeded: Seeded, role: Role) => Promise<unknown>][] = [
    ["saveCompanyBasics", (s, r) => caller(s, r).saveCompanyBasics({ name: "Nope", country: "US" })],
    ["saveIndustry", (s, r) => caller(s, r).saveIndustry({ industry: "Retail" })],
    ["saveCurrency", (s, r) => caller(s, r).saveCurrency({ currencyCode: "EUR" })],
    ["saveFiscalStartMonth", (s, r) => caller(s, r).saveFiscalStartMonth({ month: 4 })],
    ["inviteAccountant", (s, r) => caller(s, r).inviteAccountant({ email: "a@b.test", role: "viewer" })],
    ["finish", (s, r) => caller(s, r).finish()],
  ];

  /**
   * **The manager is the case this gate exists for.** A manager is an
   * `EDITOR_ROLE` and may change company-wide settings, so `editorProcedure`
   * alone would let them rename the company, set the currency every figure is
   * labelled with, cut the fiscal year and invite people — and start the trial.
   * Setting the company up is the owner's job, so they are refused here, by the
   * admin check, and the sentence proves it was that check and not the one
   * above it.
   */
  it.each(attempts)("refuses a manager on %s", async (_name, attempt) => {
    await expect(attempt(acme, "manager")).rejects.toThrow(
      /Setting up the company requires the admin role/i,
    );
  });

  /**
   * A viewer is refused one gate earlier, by `editorProcedure` itself, so the
   * sentence they get is that gate's rather than the admin check's. Both are
   * asserted rather than collapsed to `/FORBIDDEN/`: which gate refused is the
   * thing worth knowing, and a viewer reaching the admin check at all would
   * mean the editor gate had been dropped from underneath it.
   */
  it.each(attempts)("refuses a viewer on %s", async (_name, attempt) => {
    await expect(attempt(acme, "viewer")).rejects.toThrow(/admin or manager role/i);
  });

  it("wrote nothing at all through any of those refusals", async () => {
    const row = await companyOf(acme.companyId);
    expect(row.name).toBe("My company");
    expect(row.currency_code).toBe("USD");
    expect(row.settings).toEqual({ country: "US" });
    expect(clerk.sendClerkInvitation).not.toHaveBeenCalled();
  });
});

describe("step 5 sends a real invitation", () => {
  beforeEach(async () => {
    await resetCompany(acme.companyId, "Acme", "USD", { country: "US" });
    await ctx.raw.query(
      `DELETE FROM users WHERE company_id = $1 AND clerk_user_id IS NULL`,
      [acme.companyId],
    );
  });

  it("sends the invitation, then writes the row ensureUser will claim", async () => {
    const result = await caller(acme, "admin").inviteAccountant({
      email: "  Accountant@Acme.test ",
      role: "manager",
    });

    expect(clerk.sendClerkInvitation).toHaveBeenCalledWith("accountant@acme.test");
    expect(result).toMatchObject({ email: "accountant@acme.test", role: "manager" });

    const res = await ctx.db.execute(sql`
      SELECT role, clerk_user_id AS "clerkUserId", company_id AS "companyId"
      FROM users WHERE email = 'accountant@acme.test'
    `);
    expect(res.rows[0]).toMatchObject({
      role: "manager",
      // Null, so `ensureUser` claims it by email on their first sign-in.
      clerkUserId: null,
      companyId: acme.companyId,
    });
  });

  it("offers the Viewer level as the viewer role", async () => {
    await caller(acme, "admin").inviteAccountant({ email: "v@acme.test", role: "viewer" });
    const res = await ctx.db.execute(sql`SELECT role FROM users WHERE email = 'v@acme.test'`);
    expect(res.rows[0]).toMatchObject({ role: "viewer" });
  });

  it("refuses a role that is not one of the two the step offers", async () => {
    for (const role of ["admin", "owner", ""]) {
      await expect(
        caller(acme, "admin").inviteAccountant({ email: "x@acme.test", role }),
      ).rejects.toThrow();
    }
  });

  /**
   * Inviting yourself would mail you an invitation to a company you are already
   * the admin of, and `users.email` is UNIQUE, so the row would be refused
   * anyway — with a constraint violation instead of a sentence.
   */
  it("refuses the admin's own address before anything is sent", async () => {
    for (const address of ["admin@acme.test", "ADMIN@ACME.TEST", " admin@acme.test "]) {
      await expect(
        caller(acme, "admin").inviteAccountant({ email: address, role: "manager" }),
      ).rejects.toThrow(/your own address/i);
    }
    expect(clerk.sendClerkInvitation).not.toHaveBeenCalled();
  });

  it("refuses an address that already has an account, naming which case it is", async () => {
    await expect(
      caller(acme, "admin").inviteAccountant({ email: "manager@acme.test", role: "viewer" }),
    ).rejects.toThrow(/already on your company/i);

    await expect(
      caller(acme, "admin").inviteAccountant({ email: "admin@globex.test", role: "viewer" }),
    ).rejects.toThrow(/already has a Clarivo account/i);

    expect(clerk.sendClerkInvitation).not.toHaveBeenCalled();
  });

  it("refuses an address that is not an address", async () => {
    for (const address of ["", "not-an-email", "a@b", "a b@c.test"]) {
      await expect(
        caller(acme, "admin").inviteAccountant({ email: address, role: "manager" }),
      ).rejects.toThrow();
    }
    expect(clerk.sendClerkInvitation).not.toHaveBeenCalled();
  });

  /**
   * **The failure this whole seam exists for.** `auth.inviteUser` inserted a
   * row and sent nothing, and the row in the user list looks exactly like a
   * successful invitation. When the invitation does not go out, nothing may be
   * written and the refusal has to say so.
   */
  it("writes no row when Clerk refuses, and surfaces what Clerk said", async () => {
    clerk.sendClerkInvitation.mockResolvedValue({
      ok: false,
      reason: "refused",
      message: "That email address is not allowed to sign up.",
    });

    await expect(
      caller(acme, "admin").inviteAccountant({ email: "blocked@acme.test", role: "manager" }),
    ).rejects.toThrow(/not allowed to sign up/i);

    const res = await ctx.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email = 'blocked@acme.test'`,
    );
    expect(res.rows[0]).toMatchObject({ n: 0 });
  });

  it("says so plainly when the deployment has no Clerk credentials", async () => {
    clerk.sendClerkInvitation.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      message: "Clarivo cannot send invitations on this deployment: no Clerk credentials are configured. Nobody has been invited.",
    });

    await expect(
      caller(acme, "admin").inviteAccountant({ email: "nobody@acme.test", role: "manager" }),
    ).rejects.toThrow(/Nobody has been invited/i);
  });
});

describe("finish starts the trial, exactly once", () => {
  beforeEach(async () => {
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      onboardingStep: 4,
    });
  });

  it("writes the three keys, fourteen days apart, and schedules the email", async () => {
    const before = Date.now();
    const result = await caller(acme, "admin").finish();
    const after = Date.now();

    expect(result.alreadyComplete).toBe(false);

    const settings = (await companyOf(acme.companyId)).settings;
    const completedAt = Date.parse(settings.onboardingCompletedAt as string);
    const startedAt = Date.parse(settings.trialStartedAt as string);
    const endsAt = Date.parse(settings.trialEndsAt as string);

    // Server time, taken inside the call.
    expect(startedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(startedAt).toBeLessThanOrEqual(after + 1000);
    expect(completedAt).toBe(startedAt);
    // Exact hours from TRIAL_MS, not fourteen calendar days: that is the
    // arithmetic trialEndOf()'s cap uses, and a different one here would make
    // the cap bite on every company.
    expect(endsAt - startedAt).toBe(TRIAL_MS);
    expect(TRIAL_DAYS).toBe(14);

    expect(onboardingCompleted(settings)).toBe(true);
    expect(settings.onboardingStep).toBe(5);

    expect(email.scheduleTrialEndedEmail).toHaveBeenCalledTimes(1);
    const args = email.scheduleTrialEndedEmail.mock.calls[0]![0];
    expect(args.companyId).toBe(acme.companyId);
    // The capped date the paywall will enforce, not the local arithmetic.
    expect(args.trialEndsAt).toEqual(trialEndOf(settings));
  });

  /**
   * **The assertion this feature turns on.** A double-submit, a retried
   * request or a bookmarked finish URL must not restart or lengthen a trial.
   * The second call matches no row, so nothing is written at all — `updated_at`
   * included — rather than the same values being written again.
   */
  it("changes nothing the second time, and does not move trialEndsAt", async () => {
    const first = await caller(acme, "admin").finish();
    const afterFirst = await companyOf(acme.companyId);

    // Far enough apart that a rewrite would be unmistakable.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = await caller(acme, "admin").finish();
    const afterSecond = await companyOf(acme.companyId);

    expect(second.alreadyComplete).toBe(true);
    expect(afterSecond.settings).toEqual(afterFirst.settings);
    // Not a single column moved, which is stronger than "the dates match".
    expect(afterSecond.updated_at).toBe(afterFirst.updated_at);
    expect(second.trialEndsAt).toEqual(first.trialEndsAt);
    expect(trialEndOf(afterSecond.settings)).toEqual(trialEndOf(afterFirst.settings));

    // And no second email: the first finish scheduled it.
    expect(email.scheduleTrialEndedEmail).toHaveBeenCalledTimes(1);
  });

  it("finishing five more times still changes nothing", async () => {
    await caller(acme, "admin").finish();
    const snapshot = await companyOf(acme.companyId);

    for (let i = 0; i < 5; i += 1) {
      const result = await caller(acme, "admin").finish();
      expect(result.alreadyComplete).toBe(true);
    }

    expect(await companyOf(acme.companyId)).toEqual(snapshot);
    expect(email.scheduleTrialEndedEmail).toHaveBeenCalledTimes(1);
  });

  it("writes the trial in a single UPDATE", async () => {
    const updates = await countStatements(
      () => caller(acme, "admin").finish(),
      /^\s*update\s+"?companies"?/i,
    );
    expect(updates).toBe(1);
  });

  it("costs 2 round trips: the middleware lookup and the write", async () => {
    ctx.resetRoundTrips();
    await caller(acme, "admin").finish();
    expect(ctx.roundTrips()).toBe(2);
  });

  it("keeps the billing keys, and everything the steps stored", async () => {
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      industry: "Healthcare",
      fiscalStartMonth: 7,
      onboardingStep: 4,
      plan: "enterprise",
      polarSubscriptionId: "sub_acme",
    });

    await caller(acme, "admin").finish();

    expect(await companyOf(acme.companyId)).toMatchObject({
      settings: expect.objectContaining({
        country: "AU",
        industry: "Healthcare",
        fiscalStartMonth: 7,
        plan: "enterprise",
        polarSubscriptionId: "sub_acme",
      }),
    });
  });

  it("refuses to finish a company that never saved step 1", async () => {
    await resetCompany(acme.companyId, "My company", "USD", {});
    await expect(caller(acme, "admin").finish()).rejects.toThrow(/Company basics/i);
    expect(await companyOf(acme.companyId)).toMatchObject({ settings: {} });
    expect(email.scheduleTrialEndedEmail).not.toHaveBeenCalled();
  });

  /**
   * A null id is a normal answer: `server/trial-email.ts` is a placeholder that
   * returns null and must never fail onboarding. A customer who cannot finish
   * signing up because an email could not be scheduled is a worse failure than
   * a missing email.
   */
  it("completes when scheduling returns null, and stores no email id", async () => {
    await expect(caller(acme, "admin").finish()).resolves.toMatchObject({
      alreadyComplete: false,
    });
    expect((await companyOf(acme.companyId)).settings).not.toHaveProperty("trialEndedEmailId");
  });

  /**
   * The trial is already written by the time the email is attempted, so a
   * throw would show the customer a failed sign-up for a company that is set
   * up — and send them back to a flow that now refuses to finish.
   */
  it("completes even when scheduling throws", async () => {
    email.scheduleTrialEndedEmail.mockRejectedValue(new Error("Resend is down"));

    await expect(caller(acme, "admin").finish()).resolves.toMatchObject({
      alreadyComplete: false,
    });
    expect(onboardingCompleted((await companyOf(acme.companyId)).settings)).toBe(true);
  });

  it("records the email id when scheduling returns one", async () => {
    email.scheduleTrialEndedEmail.mockResolvedValue("email_abc123");
    await caller(acme, "admin").finish();
    expect((await companyOf(acme.companyId)).settings).toMatchObject({
      trialEndedEmailId: "email_abc123",
    });
  });

  /**
   * A state no path through the app produces — one of the three keys set and
   * not the others — reachable only by a hand-written UPDATE. Preserving the
   * *start* is what stops a trial being restarted, and `trialEndOf()`'s cap
   * means no combination of stored values buys more than fourteen days.
   */
  it("keeps an existing trialStartedAt rather than restarting the clock", async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      trialStartedAt: old,
    });

    await caller(acme, "admin").finish();

    const settings = (await companyOf(acme.companyId)).settings;
    expect(settings.trialStartedAt).toBe(old);
    // Ten days in already, so four are left rather than fourteen.
    const endsAt = trialEndOf(settings)!;
    expect(endsAt.getTime()).toBe(Date.parse(old) + TRIAL_MS);
  });

  it("cannot be stretched by a stored trialEndsAt far in the future", async () => {
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      trialEndsAt: "2099-01-01T00:00:00.000Z",
    });

    await caller(acme, "admin").finish();

    const settings = (await companyOf(acme.companyId)).settings;
    // The stored date survives, because the keys are written only when unset...
    expect(settings.trialEndsAt).toBe("2099-01-01T00:00:00.000Z");
    // ...and it buys nothing, because trialEndOf() takes the earlier of the
    // stored date and trialStartedAt + 14 days.
    const endsAt = trialEndOf(settings)!;
    expect(endsAt.getTime()).toBe(Date.parse(settings.trialStartedAt as string) + TRIAL_MS);
  });

  /** A key present but holding something unreadable is not a finished trial. */
  it("treats an unusable onboardingCompletedAt as unfinished and completes it", async () => {
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      onboardingCompletedAt: null,
    });

    await expect(caller(acme, "admin").finish()).resolves.toMatchObject({
      alreadyComplete: false,
    });
    expect(onboardingCompleted((await companyOf(acme.companyId)).settings)).toBe(true);
  });
});

/**
 * Invited users never see onboarding: they join an existing company through
 * `ensureUser`'s claim-by-email and inherit its trial, because the trial lives
 * on the company rather than on the person.
 */
describe("an invited user skips onboarding and shares the company's trial", () => {
  it("lands in the inviting company, with the role chosen, already onboarded", async () => {
    await resetCompany(acme.companyId, "Acme Payroll", "AUD", {
      country: "AU",
      onboardingStep: 4,
    });
    await ctx.raw.query(`DELETE FROM users WHERE company_id = $1 AND clerk_user_id IS NULL`, [
      acme.companyId,
    ]);

    await caller(acme, "admin").inviteAccountant({
      email: "bookkeeper@acme.test",
      role: "manager",
      name: "Bookkeeper",
    });
    await caller(acme, "admin").finish();
    const companyTrial = trialEndOf((await companyOf(acme.companyId)).settings);

    // Their first sign-in. The profile is passed explicitly because `ensureUser`
    // otherwise asks Clerk for it, which has no request context here — and the
    // address is what the claim matches on.
    const claimed = await ensureUser(ctx.db, "clerk_bookkeeper", {
      email: "bookkeeper@acme.test",
      name: "Bookkeeper",
    });

    expect(claimed.companyId).toBe(acme.companyId);
    expect(claimed.role).toBe("manager");
    expect(claimed.clerkUserId).toBe("clerk_bookkeeper");

    // What `(main)/layout.tsx` reads to decide whether to send them to
    // /onboarding: the company's settings, which already carry the trial.
    const account = await loadAccount(ctx.db, "clerk_bookkeeper");
    expect(account.companyId).toBe(acme.companyId);
    expect(onboardingCompleted(account.settings)).toBe(true);
    expect(trialEndOf(account.settings)).toEqual(companyTrial);

    // And no company of their own was created.
    const res = await ctx.db.execute(
      sql`SELECT count(*)::int AS n FROM companies WHERE slug = 'co-clerk_bookkeeper'`,
    );
    expect(res.rows[0]).toMatchObject({ n: 0 });
  });

  it("gives them no way to re-run onboarding for the company", async () => {
    // A manager, which is what "Accountant" grants: admin-only throughout.
    const invited = onboardingRouter.createCaller({
      userId: "clerk_bookkeeper",
      db: ctx.db,
    } as never);
    await expect(invited.finish()).rejects.toThrow(/admin role/i);
    expect((await invited.getState()).isAdmin).toBe(false);
  });
});

/**
 * The five trial keys are refused by `settings.updateCompany` **by name**, and
 * must stay refused: `trialEndOf()` caps a trial at `trialStartedAt +
 * TRIAL_DAYS` precisely so a stored date cannot stretch it, and letting a
 * settings form write the date would hand an admin the other half of that lock.
 * This router is the only writer.
 */
describe("the trial keys stay unwritable from the settings form", () => {
  it("names all five, so this test cannot drift from the contract", () => {
    expect(TRIAL_SETTINGS_KEY_NAMES).toEqual([
      "onboardingCompletedAt",
      "trialStartedAt",
      "trialEndsAt",
      "trialEndedEmailId",
      "trialEndedEmailSentAt",
    ]);
  });

  it.each(TRIAL_SETTINGS_KEY_NAMES)("refuses to write %s", async (key) => {
    await expect(
      settingsCaller(globex, "admin").updateCompany({ settings: { [key]: "2099-01-01" } }),
    ).rejects.toThrow(/written by onboarding, the trial-ended email and the Polar webhook/i);
  });

  it.each(TRIAL_SETTINGS_KEY_NAMES)("refuses to delete %s too", async (key) => {
    // Deleting is as damaging as writing: dropping `onboardingCompletedAt`
    // sends a live company's admin back through onboarding.
    await expect(
      settingsCaller(globex, "admin").updateCompany({ unsetSettings: [key] }),
    ).rejects.toThrow(/written by onboarding, the trial-ended email and the Polar webhook/i);
  });

  /** The keys onboarding writes that an editor *may* correct afterwards. */
  it("still lets an editor correct the country and the industry", async () => {
    await resetCompany(globex.companyId, "Globex SARL", "LBP", { country: "FR" });
    const updated = await settingsCaller(globex, "manager").updateCompany({
      settings: { country: "BE", industry: "Retail" },
    });
    expect(updated.settings).toMatchObject({ country: "BE", industry: "Retail" });
  });

  it("refuses the progress marker, because only onboarding moves it", async () => {
    await expect(
      settingsCaller(globex, "admin").updateCompany({ settings: { onboardingStep: 5 } }),
    ).rejects.toThrow(/does not write "onboardingStep"/i);
  });

  it("refuses fiscalStartMonth, pointing at the endpoint that owns it", async () => {
    await expect(
      settingsCaller(globex, "admin").updateCompany({ settings: { fiscalStartMonth: 7 } }),
    ).rejects.toThrow(/annual\.setFiscalStartMonth/i);
  });
});
