import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { annualRouter } from "@/server/routers/annual";

/**
 * Router tests against a Postgres-shaped database (the R-probes of the review).
 *
 * These exist because no test ran the annual router against a database at all,
 * which is why C1 — reading camelCase keys off snake_case rows — shipped.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  users: Record<Role, { id: string; clerkUserId: string }>;
}

let ctx: TestDb;
let acme: Seeded;
/** A second tenant, to prove scoping. */
let other: Seeded;

async function seedCompany(
  db: TestDb["db"],
  opts: { name: string; slug: string; currency: string },
): Promise<Seeded> {
  const companyRes = await db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES (${opts.name}, ${opts.slug}, ${opts.currency})
    RETURNING id
  `);
  const companyId = (companyRes.rows[0] as { id: string }).id;

  const users = {} as Seeded["users"];
  for (const role of ["admin", "manager", "viewer"] as Role[]) {
    const clerkUserId = `clerk_${opts.slug}_${role}`;
    const res = await db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@${opts.slug}.test`}, ${role}, ${role}, ${clerkUserId})
      RETURNING id
    `);
    users[role] = { id: (res.rows[0] as { id: string }).id, clerkUserId };
  }

  return { companyId, users };
}

/**
 * One monthly period with two employees. Components are deliberately a mix:
 * a mapped earning, a mapped deduction, an employer cost, and an uncategorised
 * line, so the category and bridge maths has something to reconcile.
 */
async function seedPeriod(
  db: TestDb["db"],
  opts: {
    companyId: string;
    month: number;
    currency: string;
    gross: number;
    net: number;
    employees: string[];
    department?: string;
  },
) {
  const mm = String(opts.month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(2026, opts.month, 0)).getUTCDate();
  const periodRes = await db.execute(sql`
    INSERT INTO payroll_periods
      (company_id, period_type, period_start, period_end, currency_code, status, source)
    VALUES (${opts.companyId}, 'monthly', ${`2026-${mm}-01`}, ${`2026-${mm}-${lastDay}`},
            ${opts.currency}, 'ready', 'upload')
    RETURNING id
  `);
  const periodId = (periodRes.rows[0] as { id: string }).id;

  const perHeadGross = opts.gross / opts.employees.length;
  const perHeadNet = opts.net / opts.employees.length;

  for (const externalId of opts.employees) {
    const components = {
      "Base Salary": (perHeadGross * 0.8).toFixed(2),
      "Income Tax": (perHeadGross * 0.2).toFixed(2),
      "Employer Social Security": (perHeadGross * 0.1).toFixed(2),
      "Mystery Line": (perHeadGross * 0.2).toFixed(2),
    };
    await db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code)
      VALUES (${periodId}, ${externalId}, ${`Employee ${externalId}`},
              ${opts.department ?? "Ops"}, ${JSON.stringify(components)}::jsonb,
              ${perHeadGross.toFixed(2)}, ${perHeadNet.toFixed(2)}, ${opts.currency})
    `);
  }

  return periodId;
}

function callerFor(seeded: Seeded, role: Role) {
  return annualRouter.createCaller({
    userId: seeded.users[role].clerkUserId,
    db: ctx.db,
  } as never);
}

beforeAll(async () => {
  ctx = await createTestDb();

  acme = await seedCompany(ctx.db, { name: "Acme", slug: "acme", currency: "USD" });
  other = await seedCompany(ctx.db, { name: "Globex", slug: "globex", currency: "LBP" });

  // Acme: Jan-Mar 2026, two employees, one of whom leaves in March.
  await seedPeriod(ctx.db, { companyId: acme.companyId, month: 1, currency: "USD", gross: 10_000, net: 8_000, employees: ["E1", "E2"] });
  await seedPeriod(ctx.db, { companyId: acme.companyId, month: 2, currency: "USD", gross: 10_000, net: 8_000, employees: ["E1", "E2"] });
  await seedPeriod(ctx.db, { companyId: acme.companyId, month: 3, currency: "USD", gross: 5_000, net: 4_000, employees: ["E1"] });

  // Globex pays in LBP only.
  await seedPeriod(ctx.db, { companyId: other.companyId, month: 1, currency: "LBP", gross: 90_000_000, net: 80_000_000, employees: ["G1"] });
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

// ---- finding C1: the bug that made the page unusable ----
describe("getSummary on Postgres (finding C1)", () => {
  it("returns the uploaded periods with real dates rather than throwing", async () => {
    const summary = await callerFor(acme, "admin").getSummary({ year: 2026 });

    // v1 threw "Invalid time value" here: it read `createdAt` off a row whose key
    // was `created_at`, so `new Date(undefined).toISOString()` blew up.
    expect(summary.coverage.uploaded).toBe(3);
    expect(summary.coverage.expected).toBe(12);
    expect(summary.periodType).toBe("monthly");
    expect(summary.currency).toBe("USD");
    expect(summary.bridge.actual.gross).toBeCloseTo(25_000, 2);
    expect(summary.bridge.actual.net).toBeCloseTo(20_000, 2);
  });

  it("labels periods with month names, not ISO dates", async () => {
    const summary = await callerFor(acme, "admin").getSummary({ year: 2026 });
    const actual = summary.periods.filter((p) => p.kind === "actual");
    expect(actual.map((p) => p.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
  });

  it("resolves the company's own currency instead of defaulting to USD", async () => {
    // v1 built `allCurrencies` from a snake_case key, so the list was [null] and
    // every company fell through to the literal "USD" (finding C1/R3).
    const summary = await callerFor(other, "admin").getSummary({ year: 2026 });
    expect(summary.currency).toBe("LBP");
    expect(summary.allCurrencies).toEqual(["LBP"]);
    expect(summary.coverage.uploaded).toBe(1);
  });

  it("scopes to the caller's company", async () => {
    const acmeSummary = await callerFor(acme, "admin").getSummary({ year: 2026 });
    const otherSummary = await callerFor(other, "admin").getSummary({ year: 2026 });
    expect(acmeSummary.bridge.actual.gross).not.toBeCloseTo(otherSummary.bridge.actual.gross, 2);
    expect(otherSummary.bridge.actual.gross).toBeCloseTo(90_000_000, 2);
  });

  it("detects joiners and leavers across the seeded periods", async () => {
    const summary = await callerFor(acme, "admin").getSummary({ year: 2026 });
    // E2 is absent in March.
    expect(summary.headcount.leaverTotal).toBe(1);
  });
});

// ---- step 22, finding A4 ----
describe("role checks (step 22)", () => {
  it("lets a viewer read the summary", async () => {
    const summary = await callerFor(acme, "viewer").getSummary({ year: 2026 });
    expect(summary.coverage.uploaded).toBe(3);
  });

  it("refuses a viewer changing component categories", async () => {
    await expect(
      callerFor(acme, "viewer").setComponentCategories({
        entries: [{ componentKey: "Mystery Line", category: "other_earning" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a viewer setting the budget", async () => {
    await expect(
      callerFor(acme, "viewer").setBudget({ year: 2026, currency: "USD", amount: 1000, basis: "gross" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a manager and an admin", async () => {
    await expect(
      callerFor(acme, "manager").setBudget({ year: 2026, currency: "USD", amount: 1000, basis: "gross" }),
    ).resolves.toMatchObject({ amount: 1000 });

    await expect(
      callerFor(acme, "admin").setComponentCategories({
        entries: [{ componentKey: "Mystery Line", category: "other_earning" }],
      }),
    ).resolves.toMatchObject({ updated: 1 });
  });
});

// ---- step 24, findings C13 / C14 ----
describe("component categories (step 24)", () => {
  it("scopes amounts to the selected year and currency", async () => {
    // Globex has only LBP data; asking for USD must not borrow Acme's or sum
    // across currencies (finding C13).
    const listed = await callerFor(other, "admin").listComponentCategories({
      year: 2026,
      currency: "LBP",
      periodType: "monthly",
    });

    expect(listed.currency).toBe("LBP");
    const base = listed.categories.find((c) => c.componentKey === "Base Salary");
    expect(base).toBeDefined();
    expect(base!.amountToDate).toBeCloseTo(90_000_000 * 0.8, 0);
  });

  it("reports the classifier rule alongside the category", async () => {
    const listed = await callerFor(acme, "admin").listComponentCategories({
      year: 2026,
      currency: "USD",
      periodType: "monthly",
    });
    const base = listed.categories.find((c) => c.componentKey === "Base Salary");
    expect(base!.autoRule).toBe("base");
  });

  it("saves many keys in a single call and records who changed them", async () => {
    const result = await callerFor(acme, "admin").setComponentCategories({
      entries: [
        { componentKey: "Mystery Line", category: "other_earning" },
        { componentKey: "Base Salary", category: "base_salary" },
      ],
    });
    expect(result.updated).toBe(2);

    const audit = await ctx.db.execute(sql`
      SELECT entity, entity_key AS "entityKey", user_id AS "userId"
      FROM annual_audit_log
      WHERE company_id = ${acme.companyId}
      ORDER BY created_at DESC
    `);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect((audit.rows[0] as { entity: string }).entity).toBeTruthy();
  });

  it("resetting a category falls back to the classifier", async () => {
    await callerFor(acme, "admin").setComponentCategories({
      entries: [{ componentKey: "Base Salary", category: "other_earning" }],
    });
    const reset = await callerFor(acme, "admin").resetComponentCategory({ componentKey: "Base Salary" });
    expect(reset.category).toBe("base_salary");
  });
});

// ---- step 25, findings C15 / B4 ----
describe("budget endpoint (step 25)", () => {
  it("upper-cases a lower-case currency code", async () => {
    // v1 accepted "lbp" and stored it as a currency distinct from "LBP".
    const saved = await callerFor(other, "admin").setBudget({
      year: 2026,
      currency: "lbp" as never,
      amount: 5_000,
      basis: "gross",
    });
    expect(saved.amount).toBe(5_000);

    const read = await callerFor(other, "admin").getBudget({ year: 2026, currency: "LBP" as never });
    expect(read.amount).toBe(5_000);
  });

  it("stores an LBP-scale budget that used to overflow the column", async () => {
    // numeric(14,2) topped out near 1e12; this is 1.2e13 (finding B4/R7).
    const amount = 12_000_000_000_000;
    const saved = await callerFor(other, "admin").setBudget({
      year: 2026,
      currency: "LBP" as never,
      amount,
      basis: "gross",
    });
    expect(saved.amount).toBe(amount);

    const read = await callerFor(other, "admin").getBudget({ year: 2026, currency: "LBP" as never });
    expect(read.amount).toBe(amount);
  });

  it("stores a basis and monthly phasing", async () => {
    await callerFor(acme, "admin").setBudget({
      year: 2026,
      currency: "USD" as never,
      amount: 120_000,
      basis: "employer_cost",
      phasing: [
        { month: 1, amount: 10_000 },
        { month: 2, amount: 10_000 },
      ],
    });

    const read = await callerFor(acme, "admin").getBudget({ year: 2026, currency: "USD" as never });
    expect(read.basis).toBe("employer_cost");
    expect(read.phasing).toEqual([
      { month: 1, amount: 10_000 },
      { month: 2, amount: 10_000 },
    ]);
  });

  it("rejects a non-ISO currency code", async () => {
    await expect(
      callerFor(acme, "admin").setBudget({ year: 2026, currency: "US1" as never, amount: 1, basis: "gross" }),
    ).rejects.toThrow();
  });
});

// ---- step 23, finding A3 ----
describe("insights API (step 23)", () => {
  it("getInsights reads the cache without calling the model or writing a row", async () => {
    const before = await ctx.db.execute(sql`SELECT COUNT(*)::int AS n FROM annual_insight_caches`);
    const result = await callerFor(acme, "viewer").getInsights({ year: 2026 });
    const after = await ctx.db.execute(sql`SELECT COUNT(*)::int AS n FROM annual_insight_caches`);

    // Nothing cached yet, and reading must not create anything: this used to be a
    // query that called the model and wrote the cache, so a window refocus spent
    // tokens.
    expect(result.bullets).toEqual([]);
    expect(result.stale).toBe(true);
    expect((before.rows[0] as { n: number }).n).toBe((after.rows[0] as { n: number }).n);
  });

  it("generateInsights is editor-only and records the source as rules without a key", async () => {
    await expect(
      callerFor(acme, "viewer").generateInsights({ year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const generated = await callerFor(acme, "admin").generateInsights({ year: 2026 });
    expect(generated.bullets.length).toBeGreaterThanOrEqual(3);
    // No ANTHROPIC_API_KEY in tests, so this is the deterministic fallback and
    // must be labelled as such rather than cached under a model name.
    expect(generated.source).toBe("rules");
    expect(generated.model).toBeNull();

    const read = await callerFor(acme, "viewer").getInsights({ year: 2026 });
    expect(read.source).toBe("rules");
    expect(read.bullets.length).toBeGreaterThanOrEqual(3);
    expect(read.stale).toBe(false);
  });
});

// ---- step 42 ----
describe("workbook export (step 42)", () => {
  it("produces a workbook whose totals match the figures on screen", async () => {
    const caller = callerFor(acme, "admin");
    const summary = await caller.getSummary({ year: 2026 });
    const workbook = await caller.exportWorkbook({ year: 2026 });

    expect(workbook.filename).toBe("acme-annual-2026-USD.xlsx");
    // A real xlsx is a zip, so the payload starts with the PK local-file header.
    expect(Buffer.from(workbook.base64, "base64").subarray(0, 2).toString("binary")).toBe("PK");
    expect(workbook.sheets).toContain("Summary");
    expect(workbook.sheets).toContain("Periods");

    /**
     * The acceptance check, read out of the actual bytes the user downloads
     * rather than a convenience field echoed by the procedure — otherwise the
     * assertion would be comparing the summary against itself.
     */
    const parsed = XLSX.read(Buffer.from(workbook.base64, "base64"), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets["Summary"]!, { header: 1 });
    const cellFor = (label: string): number[] => {
      const row = rows.find((r) => r[0] === label);
      if (!row) throw new Error(`Summary sheet has no "${label}" row`);
      return [Number(row[1]), Number(row[2]), Number(row[3])];
    };

    const [grossToDate, , grossFullYear] = cellFor("Gross");
    const [netToDate] = cellFor("Net");
    const [, , costFullYear] = cellFor("Total employment cost");

    expect(grossToDate).toBeCloseTo(summary.bridge.actual.gross, 2);
    expect(netToDate).toBeCloseTo(summary.bridge.actual.net, 2);
    expect(grossFullYear).toBeCloseTo(summary.bridge.fullYear.gross, 2);
    expect(costFullYear).toBeCloseTo(summary.bridge.fullYear.totalEmploymentCost, 2);
  });
});

// ---- step 44 ----
describe("drill-down (step 44)", () => {
  it("lets a viewer open a department's periods", async () => {
    const result = await callerFor(acme, "viewer").drillDown({ year: 2026, department: "Ops" });
    expect(result.scope).toBe("department");
    expect(result.department?.department).toBe("Ops");
    expect(result.periods.length).toBeGreaterThan(0);
  });

  it("refuses a viewer and a manager reaching employee rows, but allows an admin", async () => {
    const scope = { year: 2026, periodType: "monthly" as const, currency: "USD" as never };

    // The acceptance check. This is the only place the annual feature exposes
    // individual pay, so it is admin-only — a manager can change company
    // settings without being able to read every salary.
    await expect(callerFor(acme, "viewer").drillDownEmployees(scope)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(acme, "manager").drillDownEmployees(scope)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const rows = await callerFor(acme, "admin").drillDownEmployees(scope);
    expect(rows.employees.length).toBeGreaterThan(0);
    expect(rows.employees[0]!.employeeExternalId).toBeTruthy();
  });

  it("scopes employee rows to the caller's company", async () => {
    const acmeRows = await callerFor(acme, "admin").drillDownEmployees({
      year: 2026,
      periodType: "monthly",
      currency: "USD" as never,
    });
    const otherRows = await callerFor(other, "admin").drillDownEmployees({
      year: 2026,
      periodType: "monthly",
      currency: "LBP" as never,
    });

    const acmeIds = acmeRows.employees.map((e) => e.employeeExternalId);
    const otherIds = otherRows.employees.map((e) => e.employeeExternalId);
    expect(acmeIds).not.toEqual(expect.arrayContaining(otherIds));
  });
});

// ---- step 46 ----
describe("audit trail (step 46)", () => {
  it("records who changed a category and a budget, and when", async () => {
    const admin = callerFor(acme, "admin");
    await admin.setComponentCategories({
      entries: [{ componentKey: "Mystery Line", category: "bonus_commission" }],
    });
    await admin.setBudget({ year: 2026, currency: "USD" as never, amount: 999_000, basis: "net" });

    const trail = await admin.auditTrail({ limit: 50 });

    const category = trail.entries.find((e) => e.entity === "component_category");
    const budget = trail.entries.find((e) => e.entity === "annual_budget");

    expect(category).toBeDefined();
    expect(budget).toBeDefined();
    // Who, and when.
    expect(category!.userName).toBeTruthy();
    expect(budget!.userEmail).toContain("@");
    expect(Date.parse(budget!.createdAt)).toBeGreaterThan(0);
    // And what changed.
    expect(budget!.newValue).toMatchObject({ amount: 999_000, basis: "net" });
  });

  it("filters by entity and stays within the company", async () => {
    const onlyBudgets = await callerFor(acme, "admin").auditTrail({ entity: "annual_budget" });
    expect(onlyBudgets.entries.every((e) => e.entity === "annual_budget")).toBe(true);

    // Globex has had its own budget changes; it must not see Acme's.
    const otherTrail = await callerFor(other, "admin").auditTrail({ limit: 50 });
    expect(otherTrail.entries.every((e) => !e.entityKey.startsWith("2026:USD"))).toBe(true);
  });
});

// ---- step 26, finding A5 ----
describe("round trips (step 26)", () => {
  it("resolves a full summary in at most 3 HTTP requests", async () => {
    // Warm the memo away so this measures a cold load.
    const caller = callerFor(acme, "admin");
    await caller.getSummary({ year: 2026, forecastMethod: "average" });

    ctx.resetRoundTrips();
    await caller.getSummary({ year: 2026, forecastMethod: "run_rate" });
    const used = ctx.roundTrips();

    // v1 issued about 13 sequential requests per summary. The budget is 3: the
    // user lookup in middleware, the setup batch, and the data batch.
    expect(used).toBeLessThanOrEqual(3);
  });

  it("serves a repeated identical summary from the memo", async () => {
    const caller = callerFor(acme, "admin");
    await caller.getSummary({ year: 2026, forecastMethod: "prior_year" });

    ctx.resetRoundTrips();
    await caller.getSummary({ year: 2026, forecastMethod: "prior_year" });
    // Only the middleware's user lookup should remain.
    expect(ctx.roundTrips()).toBeLessThanOrEqual(1);
  });
});
