import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
