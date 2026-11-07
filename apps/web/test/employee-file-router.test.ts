import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { employeeFileRouter } from "@/server/routers/employee-file";

/**
 * `employeeFile.list` and `employeeFile.get` against a Postgres-shaped database.
 *
 * Seeded like `annual-router.test.ts`: two companies, three roles each,
 * `createCaller` with `{ userId, db }`. The point of running against PGlite
 * rather than a mock is that `numeric`, `date` and `timestamp` come back as
 * **strings**, exactly as neon-http returns them — a driver handing back JS
 * numbers and Dates would hide the class of bug the alias-and-parse rule exists
 * to catch.
 */

type Role = "admin" | "manager" | "viewer";

interface Seeded {
  companyId: string;
  users: Record<Role, { id: string; clerkUserId: string }>;
}

let ctx: TestDb;
let acme: Seeded;
let globex: Seeded;

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
    const clerkUserId = `clerk_ef_${opts.slug}_${role}`;
    const res = await db.execute(sql`
      INSERT INTO users (company_id, email, name, role, clerk_user_id)
      VALUES (${companyId}, ${`${role}@${opts.slug}.test`}, ${role}, ${role}, ${clerkUserId})
      RETURNING id
    `);
    users[role] = { id: (res.rows[0] as { id: string }).id, clerkUserId };
  }

  return { companyId, users };
}

interface EmployeeSpec {
  externalId: string;
  name?: string;
  department?: string;
  gross: number;
  net: number;
  components?: Record<string, number>;
  dimensions?: Record<string, string>;
  terminationDate?: string | null;
  fte?: number | null;
  /** A second row for the same id in the same period (spec 7.3). */
  duplicate?: boolean;
}

async function seedPeriod(
  db: TestDb["db"],
  opts: {
    companyId: string;
    year: number;
    month: number;
    currency: string;
    employees: readonly EmployeeSpec[];
    createdAt?: string;
  },
): Promise<string> {
  const mm = String(opts.month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(opts.year, opts.month, 0)).getUTCDate();

  const rows = opts.employees.flatMap((e) => (e.duplicate ? [e, e] : [e]));
  const totalGross = rows.reduce((a, e) => a + e.gross, 0);
  const totalNet = rows.reduce((a, e) => a + e.net, 0);

  const periodRes = await db.execute(sql`
    INSERT INTO payroll_periods
      (company_id, period_type, period_start, period_end, currency_code, status, source,
       total_employees, total_gross, total_net, created_at)
    VALUES (${opts.companyId}, 'monthly', ${`${opts.year}-${mm}-01`},
            ${`${opts.year}-${mm}-${lastDay}`}, ${opts.currency}, 'ready', 'upload',
            ${rows.length}, ${totalGross.toFixed(2)}, ${totalNet.toFixed(2)},
            ${opts.createdAt ?? `${opts.year}-${mm}-${lastDay}T12:00:00Z`})
    RETURNING id
  `);
  const periodId = (periodRes.rows[0] as { id: string }).id;

  // One INSERT per period, like `processUpload`, so every row of a period
  // shares a `created_at`. That is the fact that makes a
  // `DISTINCT ON ... created_at DESC` tie-break arbitrary, and the reason this
  // feature has none.
  for (const e of rows) {
    await db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, department,
         components, gross_salary, net_salary, currency_code, termination_date, fte,
         dimensions)
      VALUES (${periodId}, ${e.externalId}, ${e.name ?? `Employee ${e.externalId}`},
              ${e.department ?? "Ops"},
              ${JSON.stringify(e.components ?? { "Base Salary": e.gross })}::jsonb,
              ${e.gross.toFixed(2)}, ${e.net.toFixed(2)}, ${opts.currency},
              ${e.terminationDate ?? null},
              ${e.fte ?? null},
              ${JSON.stringify(e.dimensions ?? {})}::jsonb)
    `);
  }

  return periodId;
}

function callerFor(seeded: Seeded, role: Role) {
  return employeeFileRouter.createCaller({
    userId: seeded.users[role].clerkUserId,
    db: ctx.db,
  } as never);
}

beforeAll(async () => {
  ctx = await createTestDb();

  acme = await seedCompany(ctx.db, { name: "Acme", slug: "ef-acme", currency: "USD" });
  globex = await seedCompany(ctx.db, { name: "Globex", slug: "ef-globex", currency: "LBP" });

  const standard: EmployeeSpec[] = [
    {
      externalId: "E1",
      name: "Alice Johnson",
      department: "Engineering",
      gross: 5000,
      net: 4000,
      components: { "Base Salary": 4000, "Housing Allowance": 1000, "Income Tax": 1000 },
      dimensions: { Location: "Beirut" },
    },
    {
      externalId: "E2",
      name: "Bilal Nasr",
      department: "Operations",
      gross: 3000,
      net: 2400,
      components: { "Base Salary": 3000, "Income Tax": 600 },
      dimensions: { Location: "Dubai" },
    },
  ];

  // Jan-Mar 2026. March drops E2 and adds an impossible row, so the list's
  // critical-flag column has something real to count.
  await seedPeriod(ctx.db, { companyId: acme.companyId, year: 2026, month: 1, currency: "USD", employees: standard });
  await seedPeriod(ctx.db, { companyId: acme.companyId, year: 2026, month: 2, currency: "USD", employees: standard });
  await seedPeriod(ctx.db, {
    companyId: acme.companyId, year: 2026, month: 3, currency: "USD",
    employees: [
      standard[0]!,
      // Net above gross: a deduction mapped to the wrong side.
      {
        externalId: "E3", name: "Carla Haddad", department: "Engineering",
        gross: 1000, net: 1200,
        components: { "Base Salary": 1000, "Income Tax": -200 },
      },
    ],
  });

  // A duplicated export in April: E4 twice in one period.
  await seedPeriod(ctx.db, {
    companyId: acme.companyId, year: 2026, month: 4, currency: "USD",
    employees: [
      standard[0]!,
      { externalId: "E4", name: "Dana Khoury", gross: 2000, net: 1600, duplicate: true },
    ],
  });

  // Globex has its own E1, to prove the id list is the tenant boundary.
  await seedPeriod(ctx.db, {
    companyId: globex.companyId, year: 2026, month: 1, currency: "LBP",
    employees: [{ externalId: "E1", name: "Globex Person", gross: 9_000_000, net: 8_000_000 }],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

describe("role matrix", () => {
  it("lets an admin and a manager read the list and a file", async () => {
    for (const role of ["admin", "manager"] as Role[]) {
      const list = await callerFor(acme, role).list({ year: 2026 });
      expect(list.employees.length).toBeGreaterThan(0);

      const file = await callerFor(acme, role).get({ externalId: "E1", year: 2026 });
      expect(file.file.externalId).toBe("E1");
    }
  });

  it("refuses a viewer on both procedures", async () => {
    await expect(callerFor(acme, "viewer").list({ year: 2026 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      callerFor(acme, "viewer").get({ externalId: "E1", year: 2026 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("names the role rather than saying 'admin role'", async () => {
    // The message has to be distinguishable from `adminProcedure`'s, because two
    // existing suites match a refusal on /FORBIDDEN|admin role/i.
    await expect(callerFor(acme, "viewer").list({ year: 2026 })).rejects.toThrow(
      /admin or manager role/i,
    );
  });
});

describe("tenancy", () => {
  /**
   * `employee_snapshots` carries no `companyId`. It reaches tenancy only through
   * `payroll_periods`, and in this design the period ids were already resolved
   * under `company_id = ctx.companyId`, so the id list itself is the boundary.
   */
  it("answers NOT_FOUND for another company's id, never FORBIDDEN", async () => {
    await expect(
      callerFor(acme, "admin").get({ externalId: "ef-globex-only", year: 2026 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not leak another company's rows through a shared external id", async () => {
    // Both companies have an "E1". Acme must see only its own.
    const file = await callerFor(acme, "admin").get({ externalId: "E1", year: 2026 });
    expect(file.file.latestName).toBe("Alice Johnson");

    const globexFile = await callerFor(globex, "admin").get({ externalId: "E1", year: 2026 });
    expect(globexFile.file.latestName).toBe("Globex Person");
    expect(globexFile.file.currency).toBe("LBP");
  });

  it("lists only the caller's own employees", async () => {
    const list = await callerFor(globex, "admin").list({ year: 2026 });
    expect(list.employees.map((e) => e.name)).toEqual(["Globex Person"]);
  });
});

describe("round-trip budget", () => {
  /**
   * Three per route: the middleware's user lookup, the scope batch, and one data
   * batch. Counted the way `annual-router.test.ts` counts it — **including** the
   * middleware — which is the test's convention rather than CLAUDE.md's prose,
   * where "two batched round trips" counts only the batches.
   *
   * This is the test that makes an added sequential `await` fail instead of
   * quietly costing a request on the most-viewed screen in the feature.
   *
   * `toBe(3)`, not `toBeLessThanOrEqual(3)`, which is what these comments
   * already claimed. The counter does increment, so a fourth request failed —
   * but 0 would have passed too, and a change to `pglite-neon.ts` that stopped
   * counting would have left three green tests asserting nothing.
   */
  it("resolves the list in exactly 3 HTTP requests", async () => {
    const caller = callerFor(acme, "admin");
    await caller.list({ year: 2026 });

    ctx.resetRoundTrips();
    await caller.list({ year: 2026, page: 1, pageSize: 10 });
    // The user lookup, the scope batch, the data batch. The six list queries
    // and the log insert ride in the last one.
    expect(ctx.roundTrips()).toBe(3);
  });

  it("resolves a file in exactly 3 HTTP requests", async () => {
    const caller = callerFor(acme, "admin");
    await caller.get({ externalId: "E1", year: 2026 });

    ctx.resetRoundTrips();
    await caller.get({ externalId: "E1", year: 2026 });
    // The rows query, the existence probe and the log insert are one batch.
    // There is no memo, so this is a cold load every time.
    expect(ctx.roundTrips()).toBe(3);
  });

  it("stays within budget with every filter applied", async () => {
    const caller = callerFor(acme, "admin");
    ctx.resetRoundTrips();
    await caller.list({
      year: 2026,
      q: "alice",
      departments: ["Engineering"],
      hasFlag: "critical",
      sort: "range_gross",
    });
    expect(ctx.roundTrips()).toBe(3);
  });

  /**
   * The empty-scope path spends its third request on the access-log insert
   * alone rather than skipping the log, so it is at the budget and not over it.
   */
  it("keeps the empty-scope path at 3, log insert included", async () => {
    const caller = callerFor(acme, "admin");
    await caller.list({ year: 2019 });

    ctx.resetRoundTrips();
    await caller.list({ year: 2019 });
    expect(ctx.roundTrips()).toBe(3);
  });
});

describe("string-typed values at the boundary", () => {
  /**
   * Every `numeric`, `date` and `timestamp` arrives as a string. A test
   * asserting the parsed result is a `number` and the date is unshifted is what
   * catches a reintroduced `as unknown as`.
   */
  it("parses money to numbers and keeps dates as YYYY-MM-DD", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, sort: "name" });
    const alice = list.employees.find((e) => e.externalId === "E1");

    expect(typeof alice?.rangeGross).toBe("number");
    expect(typeof alice?.latestGross).toBe("number");
    expect(typeof alice?.paidPeriods).toBe("number");
    expect(alice?.rangeGross).toBe(20000);

    // The slot label comes from `assignSlot`, never from a raw ISO date.
    expect(alice?.lastPaidSlotLabel).toBe("Apr 2026");

    const file = await callerFor(acme, "admin").get({ externalId: "E1", year: 2026 });
    for (const slot of file.file.slots) {
      if (slot.gross === null) continue;
      expect(typeof slot.gross).toBe("number");
    }
    // A period ending 2026-01-31 must not become 30 January, which is what
    // `new Date(str)` in a negative-offset environment does — and `assignSlot`
    // would then place it in the wrong month.
    expect(file.scope.expected[0]?.end).toBe("2026-01-31");
  });
});

describe("the list's SQL-computed flags", () => {
  /**
   * Acceptance assertion 10: the two critical flags must be visible in the list
   * without opening a file. These three are pure column arithmetic, which is
   * what makes them affordable for the whole company before pagination.
   */
  it("counts net-above-gross per employee", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026 });
    const carla = list.employees.find((e) => e.externalId === "E3");
    expect(carla?.netExceedsGrossRows).toBe(1);
    expect(carla?.criticalFlags).toBe(1);
  });

  it("marks an employee with more than one row in some period", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026 });
    const dana = list.employees.find((e) => e.externalId === "E4");
    expect(dana?.hasDuplicateRows).toBe(true);
    // The sum of both rows, which is what ties to the register.
    expect(dana?.rangeGross).toBe(4000);

    const alice = list.employees.find((e) => e.externalId === "E1");
    expect(alice?.hasDuplicateRows).toBe(false);
  });

  it("filters to critical, and to duplicates", async () => {
    const critical = await callerFor(acme, "admin").list({ year: 2026, hasFlag: "critical" });
    expect(critical.employees.map((e) => e.externalId)).toEqual(["E3"]);
    expect(critical.total).toBe(1);

    const duplicates = await callerFor(acme, "admin").list({ year: 2026, hasFlag: "duplicate" });
    expect(duplicates.employees.map((e) => e.externalId)).toEqual(["E4"]);
  });

  it("sorts critical first, then by name", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, sort: "flags" });
    expect(list.employees[0]?.externalId).toBe("E3");
  });
});

describe("search and department filtering", () => {
  it("is case-insensitive, with ILIKE", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, q: "alice" });
    expect(list.employees.map((e) => e.externalId)).toEqual(["E1"]);
  });

  it("matches on the external id too", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, q: "e2" });
    expect(list.employees.map((e) => e.externalId)).toEqual(["E2"]);
  });

  it("matches an employee who was in the department in any slot in range", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      departments: ["Engineering"],
    });
    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E3"]);
  });

  it("returns the departments and discovered dimensions in scope", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026 });
    expect(list.departments).toContain("Engineering");
    expect(list.departments).toContain("Operations");

    // Discovered, never assumed: there is a Location picker because this
    // company has a Location key, and no picker for anything it does not have.
    const location = list.dimensions.find((d) => d.key === "Location");
    expect(location?.values.sort()).toEqual(["Beirut", "Dubai"]);
    expect(location?.truncated).toBe(false);
    expect(list.dimensions.map((d) => d.key)).toEqual(["Location"]);
  });
});

describe("the access log", () => {
  async function logRows(action: string, externalId?: string) {
    const res = await ctx.db.execute(sql`
      SELECT company_id          AS "companyId",
             user_id             AS "userId",
             action,
             employee_external_id AS "externalId",
             period_type         AS "periodType",
             currency_code       AS "currencyCode",
             fiscal_year         AS "fiscalYear",
             range_kind          AS "rangeKind",
             row_count           AS "rowCount"
      FROM employee_file_access_log
      WHERE action = ${action}
        ${externalId ? sql`AND employee_external_id = ${externalId}` : sql``}
      ORDER BY created_at DESC
    `);
    return res.rows as Record<string, unknown>[];
  }

  it("writes a row for a file read, inside the data batch", async () => {
    await callerFor(acme, "admin").get({ externalId: "E1", year: 2026, range: "full_year" });
    const rows = await logRows("view_file", "E1");
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0]!;
    expect(row.companyId).toBe(acme.companyId);
    expect(row.userId).toBe(acme.users.admin.id);
    expect(row.periodType).toBe("monthly");
    expect(row.currencyCode).toBe("USD");
    expect(Number(row.fiscalYear)).toBe(2026);
    expect(row.rangeKind).toBe("full_year");
    // The insert records the request; the count of rows returned is not worth a
    // round trip, so it stays at its default.
    expect(Number(row.rowCount)).toBe(0);
  });

  it("writes a row for a list read, naming no single person", async () => {
    await callerFor(acme, "manager").list({ year: 2026 });
    const rows = await logRows("view_list");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.externalId).toBeNull();
  });

  /**
   * It logs the **attempt**, not the successful render. An attempted read of an
   * id the company does not have is precisely what an access review wants to
   * see, so logging only successes would hide probing.
   */
  it("writes a row for a read that finds nothing and throws NOT_FOUND", async () => {
    const before = (await logRows("view_file", "ghost-id")).length;
    await expect(
      callerFor(acme, "admin").get({ externalId: "ghost-id", year: 2026 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const after = (await logRows("view_file", "ghost-id")).length;
    expect(after).toBe(before + 1);
  });
});

describe("an id with nothing in this range (finding F6)", () => {
  /**
   * NOT_FOUND only when the id is unknown to the company. An id that exists but
   * has nothing in the selected range renders a valid, **empty** file —
   * otherwise every bookmark breaks each January.
   */
  it("renders an empty file rather than 404ing", async () => {
    // E2 is paid in Jan and Feb 2026 only, so 2025 has nothing for them.
    const file = await callerFor(acme, "admin").get({ externalId: "E2", year: 2025 });
    expect(file.knownToCompany).toBe(true);
    expect(file.file.kpis.coverage.paid).toBe(0);
    // K1 is suppressed rather than 0.00, which would read as "we paid this
    // person nothing".
    expect(file.file.kpis.grossInRange.ok).toBe(false);
  });
});

describe("the assembled file", () => {
  it("returns one row per slot in R, including the ones nobody uploaded", async () => {
    const file = await callerFor(acme, "admin").get({
      externalId: "E1",
      year: 2026,
      range: "full_year",
    });
    expect(file.file.slots).toHaveLength(12);
    expect(file.file.slots.filter((s) => s.kind === "actual")).toHaveLength(4);
    // May onwards was never uploaded: unknown, not zero.
    expect(file.file.slots[4]?.kind).toBe("missing");
    expect(file.file.slots[4]?.gross).toBeNull();
  });

  it("stops a year-to-date range at the latest covered slot", async () => {
    const file = await callerFor(acme, "admin").get({ externalId: "E1", year: 2026 });
    expect(file.file.slots).toHaveLength(4);
    expect(file.scope.expected).toHaveLength(4);
    // K8 still annualises over a whole year, not over the truncated range.
    expect(file.scope.slotsPerYear).toBe(12);
  });

  it("marks a covered slot the employee has no row in as not_paid", async () => {
    // E2 is in Jan and Feb; March and April were uploaded without them.
    const file = await callerFor(acme, "admin").get({ externalId: "E2", year: 2026 });
    const kinds = file.file.slots.map((s) => s.kind);
    expect(kinds.slice(0, 4)).toEqual(["actual", "actual", "not_paid", "not_paid"]);
    expect(file.file.kpis.coverage.paid).toBe(2);
    expect(file.file.kpis.coverage.notPaid).toBe(2);
    expect(file.file.presence.status.kind).toBe("left");
    expect(file.file.presence.status.slotLabel).toBe("Feb 2026");
  });

  it("sums a duplicate slot and flags it", async () => {
    const file = await callerFor(acme, "admin").get({
      externalId: "E4",
      year: 2026,
      range: "full_year",
    });
    const april = file.file.slots[3];
    expect(april?.kind).toBe("duplicate");
    expect(april?.rowCount).toBe(2);
    expect(april?.gross).toBe(4000);
    // The gap against the department aggregates is named rather than hidden.
    expect(file.file.tieOuts.aggregateGapCause).toBe("duplicate_rows");
  });

  it("surfaces the critical reconciliation breach on the file too", async () => {
    const file = await callerFor(acme, "admin").get({ externalId: "E3", year: 2026 });
    const critical = file.file.flags.filter((f) => f.severity === "critical");
    expect(critical.map((f) => f.type)).toContain("net_exceeds_gross");
    expect(critical[0]?.slotLabel).toBe("Mar 2026");
  });

  it("ties each slot's gross to the period total it came from", async () => {
    const file = await callerFor(acme, "admin").get({ externalId: "E4", year: 2026 });
    const april = file.file.tieOuts.perSlot.find((s) => s.slotLabel === "Apr 2026");
    // `payroll_periods.total_gross` is the sum of EVERY row, which is why
    // summing duplicates is what ties to the register.
    expect(april?.employeeGross).toBe(4000);
    expect(april?.periodTotalGross).toBe(9000);
    expect(april?.cause).toBe("duplicate_rows");
  });
});

describe("re-uploaded periods (spec 7.1)", () => {
  it("counts the superseded upload and leaves the total unchanged", async () => {
    const company = await seedCompany(ctx.db, {
      name: "Reupload", slug: "ef-reupload", currency: "USD",
    });
    const employees: EmployeeSpec[] = [{ externalId: "R1", gross: 1000, net: 800 }];

    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees, createdAt: "2026-02-01T00:00:00Z",
    });
    // The same window uploaded again. `processUpload` always inserts, nothing
    // deletes the old row, and both are `ready`.
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees, createdAt: "2026-02-05T00:00:00Z",
    });

    const file = await employeeFileRouter
      .createCaller({ userId: company.users.admin.clerkUserId, db: ctx.db } as never)
      .get({ externalId: "R1", year: 2026 });

    expect(file.scope.supersededCount).toBe(1);
    expect(file.file.kpis.coverage.supersededUploads).toBe(1);
    // Not doubled: `dedupePeriods` kept the newest upload only.
    expect(file.file.kpis.grossInRange).toEqual({ ok: true, value: 1000 });
    expect(file.file.slots.filter((s) => s.kind === "actual")).toHaveLength(1);
  });
});

describe("the three list scopes", () => {
  /**
   * Each scope is a SQL predicate applied **before** pagination. Applied after,
   * every page would come back short and `total` would count a different set
   * from the one on screen.
   */
  it("paid_in_range lists everyone with a row in the range, leavers badged", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, scope: "paid_in_range" });
    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E2", "E3", "E4"]);
    expect(list.total).toBe(4);
    // A leaver never simply vanishes: E2 stopped in February and is still here.
    const e2 = list.employees.find((e) => e.externalId === "E2");
    expect(e2?.lastPaidSlotLabel).toBe("Feb 2026");
    expect(e2?.currentlyEmployed).toBe(false);
    expect(list.excludedByScope).toBe(0);
  });

  it("currently_employed keeps only the latest covered slot's roster", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      scope: "currently_employed",
    });
    // April is the latest covered slot: E1 and E4 are in it.
    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E4"]);
    expect(list.total).toBe(2);
  });

  it("states how many the currently_employed filter dropped", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      scope: "currently_employed",
    });
    // "2 people paid in 2026 are not currently employed."
    expect(list.excludedByScope).toBe(2);
    expect(list.counts.paidInRange).toBe(4);
    expect(list.counts.currentlyEmployed).toBe(2);
  });

  it("keeps total and the page in agreement under a scope filter", async () => {
    // The assertion that a post-pagination filter would fail: page 1 of size 1
    // must still carry the scope's own total.
    const page = await callerFor(acme, "admin").list({
      year: 2026,
      scope: "currently_employed",
      pageSize: 1,
      sort: "name",
    });
    expect(page.employees).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("everyone_on_record ignores the range but keeps the figures to it", async () => {
    // A single-slot range: only April. Under `paid_in_range` that is E1 and E4;
    // under `everyone_on_record` the whole year's roster lists, with money for
    // April alone.
    const inRange = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 4,
      scope: "paid_in_range",
    });
    expect(inRange.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E4"]);

    const onRecord = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 4,
      scope: "everyone_on_record",
      sort: "name",
    });
    expect(onRecord.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E2", "E3", "E4"]);
    expect(onRecord.total).toBe(4);

    // E2 was not paid in April, so the money is blank rather than borrowed from
    // a different window.
    const e2 = onRecord.employees.find((e) => e.externalId === "E2");
    expect(e2?.paidPeriods).toBe(0);
    expect(e2?.rangeGross).toBe(0);
    expect(e2?.lastPaidSlotLabel).toBeNull();
    expect(e2?.paidInRange).toBe(false);

    // And E1's figures are April's, not the year's.
    const e1 = onRecord.employees.find((e) => e.externalId === "E1");
    expect(e1?.rangeGross).toBe(5000);
    expect(e1?.paidPeriods).toBe(1);
  });

  it("combines a scope with a flag filter", async () => {
    // E3 has the critical flag but left in March, so it is not in April's
    // roster: the two predicates are ANDed into one HAVING rather than fighting.
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      scope: "currently_employed",
      hasFlag: "critical",
    });
    expect(list.employees).toEqual([]);
    expect(list.total).toBe(0);
  });
});

describe("pagination and the count", () => {
  it("counts the whole filtered set, not the page", async () => {
    const page = await callerFor(acme, "admin").list({ year: 2026, pageSize: 1, sort: "name" });
    expect(page.employees).toHaveLength(1);
    expect(page.total).toBe(4);
    expect(page.pageSize).toBe(1);

    const second = await callerFor(acme, "admin").list({
      year: 2026, pageSize: 1, page: 2, sort: "name",
    });
    expect(second.employees[0]?.externalId).not.toBe(page.employees[0]?.externalId);
  });
});

describe("a scope with no surviving periods", () => {
  it("returns empty without running the data query", async () => {
    // `IN ()` is a Postgres syntax error, so the empty case must return before
    // any SQL runs rather than building a statement with no binds.
    const list = await callerFor(acme, "admin").list({ year: 2019 });
    expect(list.employees).toEqual([]);
    expect(list.total).toBe(0);
    expect(list.departments).toEqual([]);
    expect(list.dimensions).toEqual([]);
  });

  /**
   * It still logs. The claim that the insert "cannot be skipped by an early
   * return" was wrong: this return happens before the batch is built, so a read
   * of a year with no uploads logged nothing at all. Logging reads is a
   * decision, and a read that found nothing is still a read.
   */
  it("logs the read anyway", async () => {
    const before = await ctx.db.execute(sql`
      SELECT COUNT(*)::int AS n FROM employee_file_access_log
      WHERE action = 'view_list' AND fiscal_year = 2019
    `);
    await callerFor(acme, "admin").list({ year: 2019 });
    const after = await ctx.db.execute(sql`
      SELECT COUNT(*)::int AS n FROM employee_file_access_log
      WHERE action = 'view_list' AND fiscal_year = 2019
    `);
    expect(Number((after.rows[0] as { n: number }).n)).toBe(
      Number((before.rows[0] as { n: number }).n) + 1,
    );
  });

  /**
   * `everyone_on_record` is defined as ignoring the range, so the range must
   * not be able to empty it. The guard is on the id list the query reads, not
   * on the range's own: June 2026 has no upload, and the year's roster is still
   * four people with no money in that slot.
   */
  it("still lists everyone on record when the range itself is empty", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 6,
      scope: "everyone_on_record",
      sort: "name",
    });
    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E2", "E3", "E4"]);
    expect(list.total).toBe(4);
    expect(list.counts.everyoneOnRecord).toBe(4);
    // The figures stay with the range, which here has nothing in it.
    expect(list.counts.paidInRange).toBe(0);
    for (const employee of list.employees) {
      expect(employee.paidPeriods).toBe(0);
      expect(employee.rangeGross).toBe(0);
      expect(employee.lastPaidSlotLabel).toBeNull();
    }
  });
});

describe("range=slot resolves a period instead of showing the year (defect 3)", () => {
  /**
   * The list's range control sets `range` and nothing else, so `range=slot`
   * with no index is a reachable state. It used to narrow nothing: a full year
   * of money under a control saying "One period", with the file page's picker
   * showing January's label over it.
   */
  it("defaults the slot to the latest covered one", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, range: "slot" });
    expect(list.scope.slotIndex).toBe(4);
    expect(list.scope.expected.map((s) => s.label)).toEqual(["Apr 2026"]);
    // April's roster and April's money, not the year's.
    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["E1", "E4"]);
    const alice = list.employees.find((e) => e.externalId === "E1");
    expect(alice?.rangeGross).toBe(5000);
  });

  it("offers the whole year's calendar so another period can be chosen", async () => {
    // `expected` is the one slot the response is about; `allSlots` is what the
    // picker lists. Driven by `expected`, it collapsed to the chosen slot.
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 2,
    });
    expect(list.scope.expected).toHaveLength(1);
    expect(list.scope.allSlots).toHaveLength(12);
    expect(list.scope.allSlots[0]?.label).toBe("Jan 2026");
  });

  it("falls back to the default for a slot index this year does not have", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 99,
    });
    expect(list.scope.slotIndex).toBe(4);
  });

  it("does the same on a file, and leaves slotsPerYear a whole year", async () => {
    const file = await callerFor(acme, "admin").get({
      externalId: "E1",
      year: 2026,
      range: "slot",
    });
    expect(file.scope.slotIndex).toBe(4);
    expect(file.file.slots).toHaveLength(1);
    expect(file.scope.allSlots).toHaveLength(12);
    expect(file.scope.slotsPerYear).toBe(12);
  });
});

describe("currently employed is unknown, not false, outside the range (defect 4)", () => {
  /**
   * The predicate reads the latest covered slot's rows, and that slot is April.
   * Asked about February alone, the `FILTER` could never match an id the FROM
   * clause excludes, so it answered `false` for everybody and the list rendered
   * `Left Feb 2026` on every row — with an authoritative slot label, from one
   * URL, for a company whose whole roster is still being paid.
   */
  it("answers null for every row when the latest covered slot is out of range", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 2,
    });
    expect(list.employees.length).toBeGreaterThan(0);
    for (const employee of list.employees) {
      expect(employee.currentlyEmployed).toBeNull();
    }
    expect(list.currentlyEmployedKnown).toBe(false);
  });

  it("states nothing about how many left, rather than all of them", async () => {
    const list = await callerFor(acme, "admin").list({
      year: 2026,
      range: "slot",
      slotIndex: 2,
      scope: "currently_employed",
    });
    // "N people paid in 2026 are not currently employed" was false for all N.
    expect(list.excludedByScope).toBe(0);
    expect(list.currentlyEmployedKnown).toBe(false);
  });

  it("keeps answering the question when the range does reach that slot", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2026, range: "full_year" });
    expect(list.currentlyEmployedKnown).toBe(true);
    const alice = list.employees.find((e) => e.externalId === "E1");
    expect(alice?.currentlyEmployed).toBe(true);
    const bilal = list.employees.find((e) => e.externalId === "E2");
    expect(bilal?.currentlyEmployed).toBe(false);
  });

  /**
   * With no covered slot anywhere in the year there is no slot to be outside
   * of, so `false` stays the honest answer rather than becoming unknown.
   */
  it("stays false, and known, when the year has no covered slot at all", async () => {
    const list = await callerFor(acme, "admin").list({ year: 2019 });
    expect(list.currentlyEmployedKnown).toBe(false);
    expect(list.employees).toEqual([]);
  });
});

describe("the list's own defects, one company each", () => {
  it("projects the latest FTE in range, which is what the column renders", async () => {
    const company = await seedCompany(ctx.db, {
      name: "Parttime", slug: "ef-fte", currency: "USD",
    });
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees: [
        { externalId: "F1", gross: 1000, net: 800, fte: 1 },
        { externalId: "F2", gross: 500, net: 400 },
      ],
    });
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 2, currency: "USD",
      employees: [
        { externalId: "F1", gross: 500, net: 400, fte: 0.5 },
        { externalId: "F2", gross: 500, net: 400 },
      ],
    });

    const list = await employeeFileRouter
      .createCaller({ userId: company.users.admin.clerkUserId, db: ctx.db } as never)
      .list({ year: 2026, sort: "name" });

    const f1 = list.employees.find((e) => e.externalId === "F1");
    // The latest in range, so the part-time conversion rather than the 1.0 it
    // started the year on.
    expect(f1?.fte).toBe(0.5);
    // A register that maps the column but leaves the cell blank is still null,
    // never 0 — a 0 FTE is a claim that somebody works no hours.
    const f2 = list.employees.find((e) => e.externalId === "F2");
    expect(f2?.fte).toBeNull();
  });

  /**
   * `jsonb_object_keys` and `jsonb_each_text` raise 22023 on a jsonb scalar,
   * and they share one transaction with the page and count queries — so one
   * such row anywhere in scope blanked the whole list rather than losing a
   * filter.
   */
  it("survives a scalar in the dimensions column", async () => {
    const company = await seedCompany(ctx.db, {
      name: "Scalar", slug: "ef-scalar", currency: "USD",
    });
    const periodId = await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees: [{ externalId: "S1", gross: 1000, net: 800, dimensions: { Site: "North" } }],
    });
    await ctx.db.execute(sql`
      INSERT INTO employee_snapshots
        (payroll_period_id, employee_external_id, employee_name, components,
         gross_salary, net_salary, currency_code, dimensions)
      VALUES (${periodId}, 'S2', 'Scalar Person', '{"Base Salary": 900}'::jsonb,
              '900.00', '700.00', 'USD', '"north"'::jsonb)
    `);

    const list = await employeeFileRouter
      .createCaller({ userId: company.users.admin.clerkUserId, db: ctx.db } as never)
      .list({ year: 2026, sort: "name" });

    expect(list.employees.map((e) => e.externalId).sort()).toEqual(["S1", "S2"]);
    // The object-valued row still yields its key; the scalar yields none.
    expect(list.dimensions.map((d) => d.key)).toEqual(["Site"]);
  });

  /**
   * Two people sharing a display name, ordered by name alone, come back in
   * whatever order Postgres finds cheapest — which it is free to change between
   * the two requests that fetch page 1 and page 2. One appears twice and the
   * other not at all, silently, in a list somebody is counting.
   */
  it("pages a shared display name without repeating or losing a row", async () => {
    const company = await seedCompany(ctx.db, {
      name: "Namesakes", slug: "ef-namesakes", currency: "USD",
    });
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees: [
        { externalId: "N1", name: "Mohamad Ali", gross: 1000, net: 800 },
        { externalId: "N2", name: "Mohamad Ali", gross: 1000, net: 800 },
        { externalId: "N3", name: "Mohamad Ali", gross: 1000, net: 800 },
      ],
    });

    const caller = employeeFileRouter.createCaller({
      userId: company.users.admin.clerkUserId,
      db: ctx.db,
    } as never);

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await caller.list({ year: 2026, sort: "name", pageSize: 1, page });
      expect(res.employees).toHaveLength(1);
      seen.push(res.employees[0]!.externalId);
    }
    expect(seen).toEqual(["N1", "N2", "N3"]);

    // Every sort, not only the one the tie-break was noticed on.
    for (const sort of ["flags", "range_gross", "latest_gross", "paid_periods"] as const) {
      const first = await caller.list({ year: 2026, sort, pageSize: 1, page: 1 });
      const second = await caller.list({ year: 2026, sort, pageSize: 1, page: 2 });
      expect(first.employees[0]?.externalId).not.toBe(second.employees[0]?.externalId);
    }
  });

  /**
   * `companies.settings` is jsonb written by an operator, and this is the one
   * input the feature read without zod. `{"netChangePct": null}` spread over
   * `DEFAULT_TOLERANCES` replaces 20 with null, every threshold comparison
   * becomes false, and the exceptions panel goes quiet while the card beside it
   * says the thresholds came from the company's settings.
   */
  it("ignores a malformed tolerance rather than disabling every threshold", async () => {
    const company = await seedCompany(ctx.db, {
      name: "Tolerance", slug: "ef-tolerance", currency: "USD",
    });
    await ctx.db.execute(sql`
      UPDATE companies
      SET settings = '{"tolerances": {"netChangePct": null, "baseChangePct": "lots"}}'::jsonb
      WHERE id = ${company.companyId}
    `);
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 1, currency: "USD",
      employees: [{ externalId: "T1", gross: 1000, net: 800 }],
    });
    // Net halves: beyond the default 20% threshold, and beyond nothing at all.
    await seedPeriod(ctx.db, {
      companyId: company.companyId, year: 2026, month: 2, currency: "USD",
      employees: [{ externalId: "T1", gross: 1000, net: 400 }],
    });

    const file = await employeeFileRouter
      .createCaller({ userId: company.users.admin.clerkUserId, db: ctx.db } as never)
      .get({ externalId: "T1", year: 2026 });

    expect(file.file.flags.map((f) => f.type)).toContain("net_change_beyond_tolerance");
    // And the card does not claim a company threshold it could not read.
    expect(file.file.tolerancesSource).toBe("default");
  });
});
