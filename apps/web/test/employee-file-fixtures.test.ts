import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import {
  duplicateRowFixture,
  reuploadFixture,
  FIXTURE_EXPECTATIONS,
  type UploadFixture,
} from "@saas/db/fixtures/employeeFile";
import { createTestDb, type TestDb } from "./pglite-neon";
import { employeeFileRouter } from "@/server/routers/employee-file";
import { payrollPeriodsRouter } from "@/server/routers/payroll-periods";
import { processUpload } from "@/server/upload/processor";

/**
 * The two Employee File fixtures that have to go through the real writer
 * (section 8 of docs/EMPLOYEE_FILE_PLAN.md, acceptance assertions 2, 6 and 7).
 *
 * Seven of the nine v1 fixtures are engine fixtures and are asserted in
 * `packages/payroll-core/src/employee/`, because what they test is arithmetic.
 * These two test what `processUpload` *writes*, which an engine fixture would
 * have to assume:
 *
 *   - every row of a period is inserted in **one statement**, so they share a
 *     `created_at` and a `DISTINCT ON ... created_at DESC` tie-break picks
 *     arbitrarily — the reason this feature has no `DISTINCT ON` anywhere;
 *   - `payroll_periods.total_gross` accumulates **every** row, which is why
 *     summing duplicates is what ties to the register;
 *   - a re-upload is an insert and nothing deletes, so both periods are `ready`
 *     and de-duplication is a read-time decision.
 */

let ctx: TestDb;
let companyId: string;
let adminClerkId: string;

async function seed() {
  const companyRes = await ctx.db.execute(sql`
    INSERT INTO companies (name, slug, currency_code)
    VALUES ('Fixture Co', 'ef-fixtures', 'USD')
    RETURNING id
  `);
  companyId = (companyRes.rows[0] as { id: string }).id;

  adminClerkId = "clerk_ef_fixtures_admin";
  await ctx.db.execute(sql`
    INSERT INTO users (company_id, email, name, role, clerk_user_id)
    VALUES (${companyId}, 'admin@ef-fixtures.test', 'Admin', 'admin', ${adminClerkId})
  `);
}

function periodsCaller() {
  return payrollPeriodsRouter.createCaller({ userId: adminClerkId, db: ctx.db } as never);
}

function fileCaller() {
  return employeeFileRouter.createCaller({ userId: adminClerkId, db: ctx.db } as never);
}

/** Through the product's own upload path: the gate, then the writer. */
async function ingest(fixture: UploadFixture) {
  return periodsCaller().ingest({
    rows: [...fixture.rows],
    mappings: [...fixture.mappings],
    periodType: fixture.periodType,
    periodStart: fixture.periodStart,
    periodEnd: fixture.periodEnd,
    currencyCode: fixture.currencyCode,
    filename: fixture.filename,
  });
}

/**
 * Straight to the writer, skipping the gate.
 *
 * Only used for the duplicate-row fixture, and only because the gate refuses
 * it — see the test below. Nothing else in these tests bypasses `ingest`.
 */
async function writeDirect(fixture: UploadFixture) {
  return processUpload({
    db: ctx.db as never,
    rows: [...fixture.rows],
    mappings: [...fixture.mappings] as never,
    companyId,
    periodType: fixture.periodType,
    periodStart: fixture.periodStart,
    periodEnd: fixture.periodEnd,
    currencyCode: fixture.currencyCode,
    filename: fixture.filename,
  });
}

beforeAll(async () => {
  ctx = await createTestDb();
  await seed();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

describe("duplicate rows for one employee in one period (spec 7.3)", () => {
  /**
   * The finding this fixture turned up, and the reason it cannot be ingested
   * the way section 8 assumed.
   *
   * `validateRows` treats a repeated employee id as an **error**, not a
   * warning, and `payrollPeriods.ingest` refuses on `valid: false` before
   * `processUpload` runs. So duplicate rows in `employee_snapshots` can only be
   * data written before that gate existed, or by a path that skips it — the
   * Employee File's sum-and-flag behaviour is about historical data, not about
   * what the product will accept today.
   *
   * Asserting the refusal is better evidence than ingesting the file would
   * have been: it pins both halves of the policy at once.
   */
  it("is refused at the upload gate, so it can only be historical data", async () => {
    const fixture = duplicateRowFixture();
    await expect(ingest(fixture)).rejects.toThrow(/stopped the import/i);

    const check = await periodsCaller().checkData({
      rows: [...fixture.rows],
      mappings: [...fixture.mappings],
      currencyCode: fixture.currencyCode,
    });
    expect(check.valid).toBe(false);
    expect(check.errors.some((error) => /duplicate employee id/i.test(error.message))).toBe(true);
  });

  it("writes every row in one statement, so they share a created_at", async () => {
    const fixture = duplicateRowFixture();
    const result = await writeDirect(fixture);

    const rows = await ctx.db.execute(sql`
      SELECT employee_external_id AS "externalId", created_at AS "createdAt"
      FROM employee_snapshots
      WHERE payroll_period_id = ${result.periodId}
    `);
    const stamps = new Set(
      (rows.rows as { createdAt: string | Date }[]).map((row) => String(row.createdAt)),
    );
    expect(rows.rows).toHaveLength(4);
    // One distinct timestamp across four rows. This is why `created_at` cannot
    // break a duplicate-row tie: the tie-break would pick arbitrarily, and
    // possibly differently between runs.
    expect(stamps.size).toBe(1);
  });

  it("accumulates every row into the period total, which is what ties to the register", async () => {
    const res = await ctx.db.execute(sql`
      SELECT total_gross AS "totalGross", total_employees AS "totalEmployees"
      FROM payroll_periods
      WHERE company_id = ${companyId} AND period_start = '2026-01-01'
    `);
    const row = res.rows[0] as { totalGross: string; totalEmployees: number };
    expect(Number(row.totalGross)).toBeCloseTo(
      FIXTURE_EXPECTATIONS.duplicateRowTotalGross,
      2,
    );
  });

  it("sums the duplicated employee's slot and flags it, excluding it from the averages", async () => {
    const result = await fileCaller().get({ externalId: "E002", year: 2026, range: "full_year" });
    const slot = result.file.slots.find((entry) => entry.kind === "duplicate");

    expect(slot).toBeDefined();
    expect(slot?.rowCount).toBe(2);
    expect(slot?.gross).toBeCloseTo(FIXTURE_EXPECTATIONS.duplicateRowEmployeeGross, 2);
    // Both rows carried through, so the file can list them separately.
    expect(slot?.rows).toHaveLength(2);

    // K1 is the sum, because that is the register's figure.
    expect(result.file.kpis.grossInRange.ok).toBe(true);
    if (result.file.kpis.grossInRange.ok) {
      expect(result.file.kpis.grossInRange.value).toBeCloseTo(
        FIXTURE_EXPECTATIONS.duplicateRowEmployeeGross,
        2,
      );
    }

    // And excluded from every rate and average: the only paid slot here is the
    // duplicate one, so K5 and K6 have no clean slot to work from.
    expect(result.file.kpis.averageGrossPerPaidPeriod.ok).toBe(false);
    expect(result.file.kpis.recurringLatest.ok).toBe(false);
    expect(result.file.kpis.coverage.duplicate).toBe(1);

    // R6: the gap against the aggregates is named rather than reconciled away.
    expect(result.file.tieOuts.aggregateGapCause).toBe("duplicate_rows");
  });

  it("is visible from the list without opening a file (assertion 10)", async () => {
    const list = await fileCaller().list({ year: 2026, range: "full_year", scope: "paid_in_range" });
    const grace = list.employees.find((employee) => employee.externalId === "E002");
    expect(grace?.hasDuplicateRows).toBe(true);

    const filtered = await fileCaller().list({
      year: 2026,
      range: "full_year",
      hasFlag: "duplicate",
    });
    expect(filtered.employees.map((employee) => employee.externalId)).toEqual(["E002"]);
  });
});

describe("a re-uploaded period (spec 7.1)", () => {
  it("accepts both uploads of the same window through the real gate", async () => {
    const { first, second } = reuploadFixture();
    const one = await ingest(first);
    const two = await ingest(second);

    expect(one.periodId).not.toBe(two.periodId);

    // Nothing deletes: both periods exist and both are `ready`.
    const res = await ctx.db.execute(sql`
      SELECT status FROM payroll_periods
      WHERE company_id = ${companyId} AND period_start = '2026-02-01'
    `);
    expect(res.rows).toHaveLength(2);
    expect((res.rows as { status: string }[]).every((row) => row.status === "ready")).toBe(true);
  });

  it("keeps the newest upload and counts the superseded one (assertion 7)", async () => {
    const result = await fileCaller().get({ externalId: "E003", year: 2026, range: "full_year" });

    expect(result.scope.supersededCount).toBe(1);
    expect(result.file.kpis.coverage.supersededUploads).toBe(1);

    /**
     * February carries the corrected figure, never the sum of the two uploads
     * and never the first one's.
     *
     * Asserted on the slot rather than on K1, because this employee is also in
     * the January duplicate-row period: the full-year total is legitimately
     * 3,300 + 3,600, and reading the re-upload off a year total would pass for
     * the wrong reason.
     */
    const february = result.file.slots.find((slot) => slot.slot.index === 2);
    expect(february?.kind).toBe("actual");
    expect(february?.gross).toBeCloseTo(FIXTURE_EXPECTATIONS.reuploadCorrectedGross, 2);
    expect(february?.gross).not.toBeCloseTo(FIXTURE_EXPECTATIONS.reuploadFirstGross, 2);

    // One upload on that slot, not two merged: a re-upload is superseded, which
    // is a different thing from an off-cycle run sharing a month.
    expect(february?.mergedRunCount).toBe(1);
    expect(february?.rowCount).toBe(1);

    // And the year total is each slot's own figure, so the superseded upload
    // contributes nothing at all.
    expect(result.file.kpis.grossInRange.ok).toBe(true);
    if (result.file.kpis.grossInRange.ok) {
      expect(result.file.kpis.grossInRange.value).toBeCloseTo(
        FIXTURE_EXPECTATIONS.reuploadCorrectedGross + FIXTURE_EXPECTATIONS.duplicateRowKatherineGross,
        2,
      );
    }
  });

  it("leaves an employee the correction did not touch unchanged", async () => {
    const result = await fileCaller().get({ externalId: "E001", year: 2026, range: "full_year" });
    expect(result.file.kpis.grossInRange.ok).toBe(true);
    if (result.file.kpis.grossInRange.ok) {
      // 5,500 in February. January is the duplicate-row period, which E001 is
      // also in, so the full-year figure is both months.
      expect(result.file.kpis.grossInRange.value).toBeCloseTo(11_000, 2);
    }
  });
});
