import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { comparisonsRouter } from "@/server/routers/comparisons";
import { formatCurrency } from "@/lib/utils";
import { formatMoney } from "@/components/annual/annual-utils";

/**
 * Step 8b of docs/PAYROLL_AUDIT_FIX_PLAN.md: the comparison feature's figures
 * must carry the company's currency.
 *
 * `formatCurrency` defaulted to `"USD"` with Intl's symbol display, and 25
 * call sites across `components/dashboard` and `components/detailed-view` took
 * that default, so a Lebanese company's payroll was labelled in dollars on
 * every card, table and chart axis. Nothing threaded a currency as far as the
 * comparison at all — `comparisons.run` did not return one.
 *
 * The components themselves are `.tsx` and the web suite is a node environment
 * with no renderer, so the two halves that can be tested are tested: the
 * formatter's output, and the currency arriving from the router.
 */

/**
 * `currencyDisplay: "code"` joins the code to the number with a non-breaking
 * space (U+00A0) so a narrow column cannot split them.
 */
const plain = (text: string) => text.replace(/\u00a0/g, " ");

interface Seeded {
  companyId: string;
  clerkUserId: string;
  currentPeriodId: string;
  previousPeriodId: string;
}

let ctx: TestDb;
let acme: Seeded;
let beirut: Seeded;

async function seedCompany(db: TestDb["db"], slug: string, currency: string): Promise<Seeded> {
  const companyRes = await db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES (${slug}, ${slug}, ${currency})
    RETURNING id
  `);
  const companyId = (companyRes.rows[0] as { id: string }).id;

  const clerkUserId = `clerk_${slug}_admin`;
  const userRes = await db.execute(sql`
    INSERT INTO users (company_id, email, name, role, clerk_user_id)
    VALUES (${companyId}, ${`admin@${slug}.test`}, 'admin', 'admin', ${clerkUserId})
    RETURNING id
  `);
  const userId = (userRes.rows[0] as { id: string }).id;
  void userId;

  const periodIds: string[] = [];
  for (const [start, end, gross, net] of [
    ["2026-01-01", "2026-01-31", "1000.00", "800.00"],
    ["2026-02-01", "2026-02-28", "1100.00", "880.00"],
  ] as const) {
    const periodRes = await db.execute(sql`
      INSERT INTO payroll_periods
        (company_id, period_type, period_start, period_end, currency_code, status, source)
      VALUES (${companyId}, 'monthly', ${start}, ${end}, ${currency}, 'ready', 'upload')
      RETURNING id
    `);
    const periodId = (periodRes.rows[0] as { id: string }).id;
    await db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code)
      VALUES (${periodId}, ${`${slug}-E1`}, ${`Employee of ${slug}`}, 'Ops',
              ${JSON.stringify({ "Base Salary": Number(gross) })}::jsonb,
              ${gross}, ${net}, ${currency})
    `);
    periodIds.push(periodId);
  }

  return {
    companyId,
    clerkUserId,
    previousPeriodId: periodIds[0]!,
    currentPeriodId: periodIds[1]!,
  };
}

function caller(seeded: Seeded) {
  return comparisonsRouter.createCaller({ userId: seeded.clerkUserId, db: ctx.db } as never);
}

beforeAll(async () => {
  ctx = await createTestDb();
  acme = await seedCompany(ctx.db, "acme", "USD");
  beirut = await seedCompany(ctx.db, "beirut", "LBP");
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe("formatCurrency (step 8b)", () => {
  it("names the currency code and never a symbol", () => {
    expect(plain(formatCurrency(1234.5, "USD"))).toBe("USD 1,234.50");
    expect(formatCurrency(1234.5, "USD")).not.toContain("$");
    expect(plain(formatCurrency(1234.5, "LBP"))).toContain("LBP");
    expect(formatCurrency(1234.5, "LBP")).not.toContain("$");
    expect(formatCurrency(1234.5, "KWD")).not.toContain("$");
  });

  it("is the same function the annual dashboard uses, so the two cannot drift", () => {
    // Two implementations of the same formatter is how one feature ends up in
    // symbols and the other in codes.
    expect(formatMoney).toBe(formatCurrency);
    expect(formatMoney(987.65, "LBP")).toBe(formatCurrency(987.65, "LBP"));
  });

  it("prints a dash rather than NaN", () => {
    // The old formatter rendered "$NaN" for a missing figure.
    expect(formatCurrency(Number.NaN, "USD")).toBe("—");
  });
});

describe("comparisons.run returns the company currency", () => {
  it("gives a dollar company USD", async () => {
    const result = await caller(acme).run({
      currentPeriodId: acme.currentPeriodId,
      previousPeriodId: acme.previousPeriodId,
    });
    expect(result.currency).toBe("USD");
  });

  it("gives a Lebanese company LBP, not the formatter's default", async () => {
    // The whole point: before this, nothing on the comparison side knew the
    // currency, so every figure on this company's dashboard read in dollars.
    const result = await caller(beirut).run({
      currentPeriodId: beirut.currentPeriodId,
      previousPeriodId: beirut.previousPeriodId,
    });
    expect(result.currency).toBe("LBP");
    expect(plain(formatCurrency(result.summary.totalNet.current, result.currency))).toContain("LBP");
  });

  it("does not hand one company another's currency", async () => {
    const [acmeRun, beirutRun] = await Promise.all([
      caller(acme).run({
        currentPeriodId: acme.currentPeriodId,
        previousPeriodId: acme.previousPeriodId,
      }),
      caller(beirut).run({
        currentPeriodId: beirut.currentPeriodId,
        previousPeriodId: beirut.previousPeriodId,
      }),
    ]);
    expect(acmeRun.currency).toBe("USD");
    expect(beirutRun.currency).toBe("LBP");
  });

  it("getSummary carries the currency too, for the audit summary", async () => {
    const run = await caller(beirut).run({
      currentPeriodId: beirut.currentPeriodId,
      previousPeriodId: beirut.previousPeriodId,
    });
    const summary = await caller(beirut).getSummary({ id: run.comparisonRun.id });
    expect(summary.currency).toBe("LBP");
  });
});
