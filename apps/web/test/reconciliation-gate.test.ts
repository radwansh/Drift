import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { ensureUser } from "@/server/ensure-user";
import { payrollPeriodsRouter } from "@/server/routers/payroll-periods";
import type { Category } from "@saas/payroll-core";

/**
 * Step 4's gate, end to end: a register that does not reconcile must never
 * become a period.
 *
 * The distinction this file exists to pin is "never becomes one" rather than
 * "becomes one that is flagged". `payrollPeriods.ingest` throws before
 * `processUpload` is called, so there is no row to clean up and no period stuck
 * on `processing` — which is checked by counting rows after each refusal, not
 * by trusting that the throw happened early.
 *
 * It runs on the repository's own `samples/payroll_july_2026.csv`, the file the
 * plan names: 520.00 of pay is in the register and not in its own Gross column,
 * and Clarivo used to import it, build a dashboard on it and write an AI
 * narrative about it without a word.
 */

const SAMPLES = path.resolve(import.meta.dirname, "../../../samples");

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

function caller(clerkUserId: string) {
  return payrollPeriodsRouter.createCaller({ userId: clerkUserId, db: ctx.db } as never);
}

/** The sample CSV as the rows the client sends: objects keyed by header. */
function sheet(file: string): Record<string, unknown>[] {
  // By code point, the way `server/upload/parser.ts` does it: a BOM written as
  // a regex literal is irregular whitespace in source and eslint rejects it.
  const raw = readFileSync(path.join(SAMPLES, file), "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

const BASE = {
  mappedComponent: "",
  isEmployeeId: false,
  isEmployeeName: false,
  isDepartment: false,
  isGrossSalary: false,
  isNetSalary: false,
};

/** The mapping the upload modal auto-detects for the 2026 registers. */
function mappings2026() {
  return [
    { ...BASE, sourceColumn: "Employee ID", isEmployeeId: true },
    { ...BASE, sourceColumn: "Full Name", isEmployeeName: true },
    { ...BASE, sourceColumn: "Department", isDepartment: true },
    { ...BASE, sourceColumn: "Gross Salary", isGrossSalary: true },
    { ...BASE, sourceColumn: "Net Salary", isNetSalary: true },
    { ...BASE, sourceColumn: "Base Salary", mappedComponent: "Base Salary" },
    { ...BASE, sourceColumn: "Housing Allowance", mappedComponent: "Housing Allowance" },
    { ...BASE, sourceColumn: "Transport Allowance", mappedComponent: "Transport Allowance" },
    { ...BASE, sourceColumn: "Bonus", mappedComponent: "Bonus" },
    { ...BASE, sourceColumn: "Tax Deduction", mappedComponent: "Tax Deduction" },
    { ...BASE, sourceColumn: "Insurance Deduction", mappedComponent: "Insurance Deduction" },
  ];
}

function ingestInput(file: string, overrides: Record<string, unknown> = {}) {
  return {
    rows: sheet(file),
    mappings: mappings2026(),
    periodType: "monthly" as const,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    currencyCode: "USD",
    filename: file,
    ...overrides,
  };
}

async function periodCount(companyId: string): Promise<number> {
  const res = await ctx.db.execute(
    sql`SELECT count(*)::int AS n FROM payroll_periods WHERE company_id = ${companyId}`,
  );
  return (res.rows[0] as { n: number }).n;
}

/** Every table the ingest path writes to, so a refusal can be shown to write none. */
async function rowCounts(): Promise<Record<string, number>> {
  const res = await ctx.db.execute(sql`
    SELECT (SELECT count(*)::int FROM payroll_periods)        AS "periods",
           (SELECT count(*)::int FROM employee_snapshots)     AS "snapshots",
           (SELECT count(*)::int FROM period_component_totals) AS "totals"
  `);
  return res.rows[0] as unknown as Record<string, number>;
}

describe("the gate refuses a register that does not reconcile", () => {
  it("refuses samples/payroll_july_2026.csv, naming a row and an amount", async () => {
    const user = await ensureUser(ctx.db, "clerk_gate_july", { email: "july@gate.test" });

    const before = await periodCount(user.companyId);
    let message = "";
    try {
      await caller("clerk_gate_july").ingest(ingestInput("payroll_july_2026.csv"));
      throw new Error("the gate let it through");
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }

    expect(message).toMatch(/stopped the import/i);
    // Three rows are out, so the count the admin sees has to be three.
    expect(message).toMatch(/^3 problem\(s\)/);
    // And the first problem names the employee and the amount, not a code.
    expect(message).toContain("E001");
    expect(message).toContain("-300.00");

    // Nothing was written: not a period, not a `processing` orphan.
    expect(await periodCount(user.companyId)).toBe(before);
  });

  it("writes nothing at all — no snapshots and no aggregates either", async () => {
    const user = await ensureUser(ctx.db, "clerk_gate_none", { email: "none@gate.test" });

    // Measured across the whole database, before and after. Scoping to this
    // company would pass even if the refused call had written to another one,
    // and `employee_snapshots` and `period_component_totals` carry no
    // `company_id` of their own to scope by.
    const before = await rowCounts();

    await expect(
      caller("clerk_gate_none").ingest(ingestInput("payroll_july_2026.csv")),
    ).rejects.toThrow();

    expect(await rowCounts()).toEqual(before);
    expect(await periodCount(user.companyId)).toBe(0);
  });

  it("accepts samples/payroll_june_2026.csv, which balances", async () => {
    const user = await ensureUser(ctx.db, "clerk_gate_june", { email: "june@gate.test" });

    const result = await caller("clerk_gate_june").ingest(
      ingestInput("payroll_june_2026.csv", { periodStart: "2026-06-01", periodEnd: "2026-06-30" }),
    );

    expect(result.employeeCount).toBe(20);
    expect(result.totalGross).toBe(242630);
    expect(result.totalNet).toBe(194160);
    expect(await periodCount(user.companyId)).toBe(1);

    // The panel's figures come back, and they reconcile.
    expect(result.reconciliation?.balanced).toBe(true);
    expect(result.reconciliation?.breaches).toEqual([]);
    expect(result.reconciliation?.totals.earnings).toBe(242630);
  });

  it("refuses the same file with one net moved by a cent", async () => {
    const user = await ensureUser(ctx.db, "clerk_gate_cent", { email: "cent@gate.test" });

    const rows = sheet("payroll_june_2026.csv");
    const first = { ...rows[0]!, "Net Salary": String(Number(rows[0]!["Net Salary"]) + 0.01) };

    await expect(
      caller("clerk_gate_cent").ingest(
        ingestInput("payroll_june_2026.csv", {
          rows: [first, ...rows.slice(1)],
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
        }),
      ),
    ).rejects.toThrow(/\+0\.01/);

    expect(await periodCount(user.companyId)).toBe(0);
  });
});

describe("the period control total", () => {
  it("refuses an upload whose stated gross disagrees with the rows", async () => {
    const user = await ensureUser(ctx.db, "clerk_ctl_bad", { email: "ctl-bad@gate.test" });

    await expect(
      caller("clerk_ctl_bad").ingest(
        ingestInput("payroll_june_2026.csv", {
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          controlTotalGross: 242_630.5,
        }),
      ),
    ).rejects.toThrow(/control total/i);

    expect(await periodCount(user.companyId)).toBe(0);
  });

  it("accepts and stores a control total that agrees", async () => {
    await ensureUser(ctx.db, "clerk_ctl_ok", { email: "ctl-ok@gate.test" });

    const result = await caller("clerk_ctl_ok").ingest(
      ingestInput("payroll_june_2026.csv", {
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        controlTotalGross: 242_630,
        controlTotalNet: 194_160,
      }),
    );

    expect(result.controlTotalsMissing).toEqual([]);

    const res = await ctx.db.execute(sql`
      SELECT control_total_gross AS "gross", control_total_net AS "net"
      FROM payroll_periods WHERE id = ${result.periodId}
    `);
    const row = res.rows[0] as { gross: string | null; net: string | null };

    // Stored, so the period keeps the figure it was ticked against — Clarivo's
    // own totals can only ever agree with themselves.
    expect(Number(row.gross)).toBe(242630);
    expect(Number(row.net)).toBe(194160);
  });

  it("imports without one, and says which line was not supplied", async () => {
    const user = await ensureUser(ctx.db, "clerk_ctl_absent", { email: "ctl-absent@gate.test" });

    const result = await caller("clerk_ctl_absent").ingest(
      ingestInput("payroll_june_2026.csv", { periodStart: "2026-06-01", periodEnd: "2026-06-30" }),
    );

    // Absence is reported, not treated as agreement.
    expect(result.controlTotalsMissing).toEqual(["gross", "net"]);
    expect(await periodCount(user.companyId)).toBe(1);

    const res = await ctx.db.execute(sql`
      SELECT control_total_gross AS "gross" FROM payroll_periods WHERE id = ${result.periodId}
    `);
    expect((res.rows[0] as { gross: string | null }).gross).toBeNull();
  });
});

describe("an unplaced column is a warning, not a refusal", () => {
  it("imports a register whose only oddity is a column Clarivo cannot place", async () => {
    const user = await ensureUser(ctx.db, "clerk_unplaced", { email: "unplaced@gate.test" });

    // The shape `samples/2025` has: the arithmetic is right, and one column is
    // money nobody has mapped. Blocking here would stop a real upload.
    const result = await caller("clerk_unplaced").ingest({
      rows: [
        {
          "Employee ID": "E1",
          "Full Name": "Ada",
          Department: "Engineering",
          "Base Salary": "1000",
          "Expense Reimbursement": "100",
          "Tax Deduction": "200",
          "Gross Salary": "1100",
          "Net Salary": "900",
        },
      ],
      mappings: [
        { ...BASE, sourceColumn: "Employee ID", isEmployeeId: true },
        { ...BASE, sourceColumn: "Full Name", isEmployeeName: true },
        { ...BASE, sourceColumn: "Department", isDepartment: true },
        { ...BASE, sourceColumn: "Gross Salary", isGrossSalary: true },
        { ...BASE, sourceColumn: "Net Salary", isNetSalary: true },
        { ...BASE, sourceColumn: "Base Salary", mappedComponent: "Base Salary" },
        { ...BASE, sourceColumn: "Expense Reimbursement", mappedComponent: "Expense Reimbursement" },
        { ...BASE, sourceColumn: "Tax Deduction", mappedComponent: "Tax Deduction" },
      ],
      periodType: "monthly",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      currencyCode: "USD",
      filename: "unplaced.csv",
    });

    expect(await periodCount(user.companyId)).toBe(1);
    expect(result.reconciliation?.balanced).toBe(true);
    expect(result.reconciliation?.unplacedColumns.map((c) => c.componentKey)).toEqual([
      "Expense Reimbursement",
    ]);

    // Reported as a warning the admin sees, naming the column.
    const texts = result.warnings.map((w) => w.message);
    expect(texts.some((t) => t.includes("Expense Reimbursement"))).toBe(true);
  });
});

describe("a register with no gross or net column mapped", () => {
  it("imports, because neither identity can be stated without them", async () => {
    const user = await ensureUser(ctx.db, "clerk_no_totals", { email: "no-totals@gate.test" });

    // The gate must not become a requirement to map columns the register does
    // not have; `reconciliation` is null and says so.
    const result = await caller("clerk_no_totals").ingest({
      rows: [{ "Employee ID": "E1", "Full Name": "Ada", "Base Salary": "1000" }],
      mappings: [
        { ...BASE, sourceColumn: "Employee ID", isEmployeeId: true },
        { ...BASE, sourceColumn: "Full Name", isEmployeeName: true },
        { ...BASE, sourceColumn: "Base Salary", mappedComponent: "Base Salary" },
      ],
      periodType: "monthly",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      currencyCode: "USD",
      filename: "no-totals.csv",
    });

    expect(result.reconciliation).toBeNull();
    expect(await periodCount(user.companyId)).toBe(1);
  });
});

describe("the check status on the periods list", () => {
  /**
   * The display half of step 4: history predates the gate, so the list says
   * whether a period already in the database would pass it. Recomputed from
   * `period_component_totals` with the same classifier the annual engine uses,
   * so the list and the annual bridge cannot disagree.
   */
  it("marks a period that reconciles", async () => {
    await ensureUser(ctx.db, "clerk_badge_ok", { email: "badge-ok@gate.test" });

    const result = await caller("clerk_badge_ok").ingest(
      ingestInput("payroll_june_2026.csv", { periodStart: "2026-06-01", periodEnd: "2026-06-30" }),
    );

    const list = await caller("clerk_badge_ok").list({ page: 1, pageSize: 20 });
    expect(list.checks[result.periodId]).toEqual({
      balanced: true,
      earningsBalance: 0,
      balance: 0,
    });
  });

  it("marks a period written before the gate, straight into the tables", async () => {
    const user = await ensureUser(ctx.db, "clerk_badge_old", { email: "badge-old@gate.test" });

    // A period of the kind that already exists: 520.00 of earnings above its
    // own gross, exactly the shape of samples/payroll_july_2026.csv. Written by
    // hand because the gate refuses it — which is the point.
    const period = await ctx.db.execute(sql`
      INSERT INTO payroll_periods
        (company_id, period_type, period_start, period_end, currency_code, status,
         source, total_employees, total_gross, total_net)
      VALUES (${user.companyId}, 'monthly', '2026-05-01', '2026-05-31', 'USD', 'ready',
              'upload', 1, 1000, 800)
      RETURNING id
    `);
    const periodId = (period.rows[0] as { id: string }).id;

    await ctx.db.execute(sql`
      INSERT INTO period_component_totals
        (payroll_period_id, department, component_key, total, pos_rows)
      VALUES (${periodId}, 'Engineering', 'Base Salary', 1300, 1),
             (${periodId}, 'Engineering', 'Income Tax',   200, 1)
    `);

    const list = await caller("clerk_badge_old").list({ page: 1, pageSize: 20 });
    expect(list.checks[periodId]).toEqual({
      balanced: false,
      // Earnings of 1,300 against a gross of 1,000.
      earningsBalance: -300,
      // Gross minus net is 200, and the deductions are 200, so this line ties.
      balance: 0,
    });
  });

  it("says 'not checked' for a period with no aggregates, rather than passing it", async () => {
    const user = await ensureUser(ctx.db, "clerk_badge_none", { email: "badge-none@gate.test" });

    // The pre-step-31 shape: a period with snapshots and no aggregate rows. The
    // annual queries fall back to aggregating snapshots live for these; the
    // badge declines to judge rather than duplicating that path.
    const period = await ctx.db.execute(sql`
      INSERT INTO payroll_periods
        (company_id, period_type, period_start, period_end, currency_code, status,
         source, total_employees, total_gross, total_net)
      VALUES (${user.companyId}, 'monthly', '2026-04-01', '2026-04-30', 'USD', 'ready',
              'upload', 1, 1000, 800)
      RETURNING id
    `);
    const periodId = (period.rows[0] as { id: string }).id;

    const list = await caller("clerk_badge_none").list({ page: 1, pageSize: 20 });
    expect(list.checks[periodId]?.balanced).toBeNull();
  });

  it("costs one extra round trip for a whole page of periods", async () => {
    await ensureUser(ctx.db, "clerk_badge_cost", { email: "badge-cost@gate.test" });
    for (const month of ["01", "02", "03"]) {
      await caller("clerk_badge_cost").ingest(
        ingestInput("payroll_june_2026.csv", {
          periodStart: `2026-${month}-01`,
          periodEnd: `2026-${month}-28`,
        }),
      );
    }

    ctx.resetRoundTrips();
    const list = await caller("clerk_badge_cost").list({ page: 1, pageSize: 20 });

    expect(Object.keys(list.checks)).toHaveLength(3);
    // user lookup, then the page and its count in parallel, then one aggregate
    // query for every period on the page — not one per period.
    expect(ctx.roundTrips()).toBeLessThanOrEqual(4);
  });
});

/**
 * Step 11b: the question is asked at upload, not on the annual dashboard.
 *
 * `AMBIGUOUS_COMPONENT` was raised by `computeSummary` and surfaced afterwards,
 * which is the wrong order — the ambiguity was already in the data, every
 * annual view carried the gap in its balancing lines until somebody answered,
 * and the admin who knew the answer had moved on. These pin that an unanswered
 * column refuses the import, that an answer is accepted and saved, and that a
 * company is asked once.
 */
describe("an ambiguous column must be decided before the register is committed", () => {
  /**
   * A one-row register carrying , which the classifier will not
   * place. It reconciles either way — see the note on the column — so the
   * open question is the only thing standing between it and an import, which
   * is what makes these tests say one thing each.
   */
  function maladieSheet(resolvedCategory?: Category) {
    const componentBase = { ...BASE };
    return {
      rows: [
        {
          "Employee ID": "E1",
          "Full Name": "Ada",
          Department: "Engineering",
          "Base Salary": "3000",
          // Zero on purpose, so the open question is the *only* thing wrong
          // with this register. With a value, an unanswered `Maladie` is read
          // as earnings and gross looks short — a second fault that would make
          // these tests pass for the wrong reason. The interaction itself is
          // covered in `payroll-core/src/reconcile.test.ts`, on a register with
          // a real 100 in it.
          Maladie: "0",
          "Gross Salary": "3000",
          "Net Salary": "3000",
        },
      ],
      mappings: [
        { ...componentBase, sourceColumn: "Employee ID", isEmployeeId: true },
        { ...componentBase, sourceColumn: "Full Name", isEmployeeName: true },
        { ...componentBase, sourceColumn: "Department", isDepartment: true },
        { ...componentBase, sourceColumn: "Gross Salary", isGrossSalary: true },
        { ...componentBase, sourceColumn: "Net Salary", isNetSalary: true },
        { ...componentBase, sourceColumn: "Base Salary", mappedComponent: "Base Salary" },
        {
          ...componentBase,
          sourceColumn: "Maladie",
          mappedComponent: "Maladie",
          ...(resolvedCategory ? { resolvedCategory } : {}),
        },
      ],
      periodType: "monthly" as const,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      currencyCode: "USD",
      filename: "maladie.csv",
    };
  }

  async function savedCategory(companyId: string, key: string): Promise<string | null> {
    const res = await ctx.db.execute(sql`
      SELECT category FROM component_categories
      WHERE company_id = ${companyId} AND component_key = ${key}
    `);
    return (res.rows[0] as { category: string } | undefined)?.category ?? null;
  }

  it("refuses the import, naming the column and the choice", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_refuse", { email: "q-refuse@gate.test" });

    const before = await rowCounts();
    await expect(caller("clerk_q_refuse").ingest(maladieSheet())).rejects.toThrow(
      /stopped the import/i,
    );

    // Nothing written, so the ambiguity never entered the data.
    expect(await rowCounts()).toEqual(before);
    expect(await periodCount(user.companyId)).toBe(0);
  });

  it("puts the question and the candidates, not a code", async () => {
    await ensureUser(ctx.db, "clerk_q_text", { email: "q-text@gate.test" });

    const check = await caller("clerk_q_text").checkData({
      rows: maladieSheet().rows,
      mappings: maladieSheet().mappings,
      currencyCode: "USD",
    });

    expect(check.valid).toBe(false);
    expect(check.openQuestions).toHaveLength(1);
    expect(check.openQuestions[0]).toMatchObject({
      componentKey: "Maladie",
      candidates: ["absence_deduction", "other_deduction"],
    });

    const message = check.errors.find((e) => e.column === "Maladie")?.message ?? "";
    expect(message).toContain("sick-leave");
    expect(message).toContain("Absence or Other deductions");
  });

  it("accepts the import once the admin answers, and saves the answer", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_answer", { email: "q-answer@gate.test" });

    const result = await caller("clerk_q_answer").ingest(maladieSheet("absence_deduction"));

    expect(await periodCount(user.companyId)).toBe(1);
    expect(result.reconciliation?.balanced).toBe(true);

    // Saved to `component_categories` — the table the annual engine reads as
    // `savedCategories`, so the dashboard stops asking too.
    expect(await savedCategory(user.companyId, "Maladie")).toBe("absence_deduction");
  });

  it("does not ask again on the next upload", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_once", { email: "q-once@gate.test" });

    await caller("clerk_q_once").ingest(maladieSheet("other_deduction"));

    // The second upload carries no answer at all, and must still import.
    const second = await caller("clerk_q_once").ingest({
      ...maladieSheet(),
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });

    expect(await periodCount(user.companyId)).toBe(2);
    expect(second.reconciliation?.balanced).toBe(true);

    const check = await caller("clerk_q_once").checkData({
      rows: maladieSheet().rows,
      mappings: maladieSheet().mappings,
      currencyCode: "USD",
    });
    expect(check.openQuestions).toEqual([]);
    expect(check.valid).toBe(true);
  });

  it("records who answered, and that it came from the wizard", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_audit", { email: "q-audit@gate.test" });

    await caller("clerk_q_audit").ingest(maladieSheet("absence_deduction"));

    const res = await ctx.db.execute(sql`
      SELECT entity, entity_key AS "entityKey", new_value AS "newValue", user_id AS "userId"
      FROM annual_audit_log
      WHERE company_id = ${user.companyId}
    `);
    const row = res.rows[0] as {
      entity: string;
      entityKey: string;
      newValue: { category: string; source: string };
      userId: string;
    };

    expect(row.entity).toBe("component_category");
    expect(row.entityKey).toBe("Maladie");
    expect(row.newValue).toEqual({ category: "absence_deduction", source: "upload_wizard" });
    expect(row.userId).toBe(user.id);
  });

  it("saves nothing when the import fails for another reason", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_failed", { email: "q-failed@gate.test" });

    // Answered, but the register is 50 out — the gate refuses it, and an answer
    // about a register nobody accepted must not be kept.
    const sheet = maladieSheet("absence_deduction");
    await expect(
      caller("clerk_q_failed").ingest({
        ...sheet,
        rows: [{ ...sheet.rows[0]!, "Net Salary": "2950" }],
      }),
    ).rejects.toThrow();

    expect(await savedCategory(user.companyId, "Maladie")).toBeNull();
  });

  it("asks nothing about a column that is not a pay component", async () => {
    const user = await ensureUser(ctx.db, "clerk_q_role", { email: "q-role@gate.test" });

    // The same header, recorded as a dimension. A dimension has no category to
    // choose and never reaches the classifier.
    const sheet = maladieSheet();
    const result = await caller("clerk_q_role").ingest({
      ...sheet,
      rows: [{ ...sheet.rows[0]!, Maladie: "Site A" }],
      mappings: sheet.mappings.map((m) =>
        m.sourceColumn === "Maladie"
          ? { ...m, mappedComponent: "Maladie", dimensionName: "Location" }
          : m,
      ),
    });

    expect(await periodCount(user.companyId)).toBe(1);
    expect(result.reconciliation?.balanced).toBe(true);
    expect(await savedCategory(user.companyId, "Maladie")).toBeNull();
  });
});
