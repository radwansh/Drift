import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite-neon";
import { ensureUser } from "@/server/ensure-user";
import { payrollPeriodsRouter } from "@/server/routers/payroll-periods";

/**
 * Step 9 part 2, against real Postgres: the columns migration 0009 added have
 * to be populated by an upload, not merely exist.
 *
 * Part 1 widened the schema and nothing wrote to it — `hire_date`,
 * `termination_date`, `fte` and `dimensions` were reachable by a query and
 * empty, because a mapping could only say one of five things about a column
 * and anything else became a pay component. That is what this pins: a mapping
 * carrying `snapshotField` or `dimensionName` lands in the right column, and
 * crucially does **not** land in `components`.
 */

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

interface Row {
  employeeExternalId: string;
  hireDate: string | null;
  terminationDate: string | null;
  fte: string | null;
  dimensions: Record<string, string>;
  components: Record<string, unknown>;
}

async function snapshotsOf(periodId: string): Promise<Row[]> {
  const res = await ctx.db.execute(sql`
    SELECT employee_external_id AS "employeeExternalId",
           hire_date            AS "hireDate",
           termination_date     AS "terminationDate",
           fte                  AS "fte",
           dimensions           AS "dimensions",
           components           AS "components"
    FROM employee_snapshots
    WHERE payroll_period_id = ${periodId}
    ORDER BY employee_external_id
  `);
  return res.rows as unknown as Row[];
}

function identityMappings() {
  const base = {
    mappedComponent: "",
    isEmployeeId: false,
    isEmployeeName: false,
    isDepartment: false,
    isGrossSalary: false,
    isNetSalary: false,
  };
  return [
    { ...base, sourceColumn: "Employee ID", isEmployeeId: true },
    { ...base, sourceColumn: "Employee Name", isEmployeeName: true },
    { ...base, sourceColumn: "Department", isDepartment: true },
    { ...base, sourceColumn: "Gross Salary", isGrossSalary: true },
    { ...base, sourceColumn: "Net Salary", isNetSalary: true },
  ];
}

const COMPONENT_BASE = {
  mappedComponent: "",
  isEmployeeId: false,
  isEmployeeName: false,
  isDepartment: false,
  isGrossSalary: false,
  isNetSalary: false,
};

/** A two-row register carrying the step 9 columns. */
function register(rows: Record<string, unknown>[]) {
  return {
    rows,
    mappings: [
      ...identityMappings(),
      { ...COMPONENT_BASE, sourceColumn: "Basic Salary", mappedComponent: "Basic Salary" },
      { ...COMPONENT_BASE, sourceColumn: "Hire Date", snapshotField: "hire_date" as const },
      { ...COMPONENT_BASE, sourceColumn: "Leaving Date", snapshotField: "termination_date" as const },
      { ...COMPONENT_BASE, sourceColumn: "FTE", snapshotField: "fte" as const },
      { ...COMPONENT_BASE, sourceColumn: "Cost Centre", dimensionName: "Cost Centre" },
      { ...COMPONENT_BASE, sourceColumn: "Site", dimensionName: "Location" },
    ],
    periodType: "monthly" as const,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    currencyCode: "USD",
    filename: "june.csv",
  };
}

function employee(id: string, extra: Record<string, unknown>) {
  return {
    "Employee ID": id,
    "Employee Name": `Person ${id}`,
    Department: "Engineering",
    "Basic Salary": "3000",
    "Gross Salary": "3000",
    "Net Salary": "2400",
    ...extra,
  };
}

describe("an upload writes the step 9 columns", () => {
  it("lands dates, FTE and dimensions in their own columns, not in components", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_ok", { email: "dim-ok@example.test" });
    expect(user.companyId).toBeTruthy();

    const result = await caller("clerk_dim_ok").ingest(
      register([
        employee("E1", {
          "Hire Date": "2024-03-15",
          "Leaving Date": "",
          FTE: "1",
          "Cost Centre": "4100",
          Site: "Beirut",
        }),
        employee("E2", {
          "Hire Date": "2025-11-01",
          "Leaving Date": "2026-06-30",
          FTE: "0.5",
          "Cost Centre": "4200",
          Site: "Paris",
        }),
      ]),
    );

    expect(result.columnIssues).toEqual([]);

    const rows = await snapshotsOf(result.periodId);
    expect(rows).toHaveLength(2);

    const [e1, e2] = rows;
    expect(e1!.hireDate).toBe("2024-03-15");
    expect(e1!.terminationDate).toBeNull();
    // numeric, so neon-http hands it back as a string at the declared scale.
    expect(Number(e1!.fte)).toBe(1);
    expect(e1!.dimensions).toEqual({ "Cost Centre": "4100", Location: "Beirut" });

    expect(e2!.hireDate).toBe("2025-11-01");
    expect(e2!.terminationDate).toBe("2026-06-30");
    expect(Number(e2!.fte)).toBe(0.5);
    expect(e2!.dimensions).toEqual({ "Cost Centre": "4200", Location: "Paris" });

    // The whole point of the mapping roles: a hire date must not become a pay
    // component. Before step 9 part 2 every one of these columns did, and a
    // date string was then summed as money.
    for (const row of rows) {
      expect(Object.keys(row.components)).toEqual(["Basic Salary"]);
    }
  });

  it("infers a day-first column from one unambiguous value in it", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_dmy", { email: "dim-dmy@example.test" });
    expect(user.companyId).toBeTruthy();

    const result = await caller("clerk_dim_dmy").ingest(
      register([
        // 03/04/2024 alone reads either way; 25/12/2023 settles the column.
        employee("E1", { "Hire Date": "03/04/2024", "Leaving Date": "", FTE: "1", "Cost Centre": "", Site: "" }),
        employee("E2", { "Hire Date": "25/12/2023", "Leaving Date": "", FTE: "1", "Cost Centre": "", Site: "" }),
      ]),
    );

    const rows = await snapshotsOf(result.periodId);
    expect(rows[0]!.hireDate).toBe("2024-04-03");
    expect(rows[1]!.hireDate).toBe("2023-12-25");
    expect(result.columnIssues).toEqual([]);

    // A blank dimension cell leaves the key out rather than storing "".
    expect(rows[0]!.dimensions).toEqual({});
  });

  it("imports the register but writes no date when the column's order is ambiguous", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_amb", { email: "dim-amb@example.test" });
    expect(user.companyId).toBeTruthy();

    const result = await caller("clerk_dim_amb").ingest(
      register([
        employee("E1", { "Hire Date": "03/04/2024", "Leaving Date": "", FTE: "1", "Cost Centre": "4100", Site: "" }),
        employee("E2", { "Hire Date": "01/02/2024", "Leaving Date": "", FTE: "1", "Cost Centre": "4100", Site: "" }),
      ]),
    );

    const rows = await snapshotsOf(result.periodId);
    // The pay still imported; only the unreadable column was left out.
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.hireDate)).toEqual([null, null]);
    expect(rows[0]!.dimensions).toEqual({ "Cost Centre": "4100" });

    expect(result.columnIssues).toEqual([
      {
        sourceColumn: "Hire Date",
        target: "hire_date",
        problem: { code: "ambiguous_date_order", samples: ["03/04/2024", "01/02/2024"] },
      },
    ]);
  });

  it("drops a termination before its hire date rather than failing the whole import", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_rev", { email: "dim-rev@example.test" });
    expect(user.companyId).toBeTruthy();

    // employee_snapshots_dates_ordered would reject this row, and the insert is
    // one statement — so without the guard the other employee is lost too.
    const result = await caller("clerk_dim_rev").ingest(
      register([
        employee("E1", {
          "Hire Date": "2025-06-01",
          "Leaving Date": "2024-01-31",
          FTE: "1",
          "Cost Centre": "",
          Site: "",
        }),
        employee("E2", {
          "Hire Date": "2024-01-01",
          "Leaving Date": "2026-06-30",
          FTE: "1",
          "Cost Centre": "",
          Site: "",
        }),
      ]),
    );

    const rows = await snapshotsOf(result.periodId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.hireDate).toBe("2025-06-01");
    expect(rows[0]!.terminationDate).toBeNull();
    expect(rows[1]!.terminationDate).toBe("2026-06-30");

    expect(result.columnIssues).toEqual([
      {
        sourceColumn: "Leaving Date",
        target: "termination_date",
        problem: { code: "unreadable_values", samples: ["2025-06-01 → 2024-01-31"] },
      },
    ]);
  });

  it("keeps working for a mapping that carries neither new field", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_old", { email: "dim-old@example.test" });
    expect(user.companyId).toBeTruthy();

    // Exactly the payload a client built before step 9 sends.
    const result = await caller("clerk_dim_old").ingest({
      rows: [
        {
          "Employee ID": "E1",
          "Employee Name": "Ada",
          Department: "Engineering",
          "Basic Salary": "3000",
          "Gross Salary": "3000",
          "Net Salary": "2400",
        },
      ],
      mappings: [
        ...identityMappings(),
        { ...COMPONENT_BASE, sourceColumn: "Basic Salary", mappedComponent: "Basic Salary" },
      ],
      periodType: "monthly",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      currencyCode: "USD",
      filename: "legacy.csv",
    });

    const rows = await snapshotsOf(result.periodId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hireDate).toBeNull();
    expect(rows[0]!.terminationDate).toBeNull();
    expect(rows[0]!.fte).toBeNull();
    expect(rows[0]!.dimensions).toEqual({});
    expect(Object.keys(rows[0]!.components)).toEqual(["Basic Salary"]);
    expect(result.columnIssues).toEqual([]);
  });

  it("refuses a snapshot field the processor does not know, at the boundary", async () => {
    const user = await ensureUser(ctx.db, "clerk_dim_bad", { email: "dim-bad@example.test" });
    expect(user.companyId).toBeTruthy();

    // A typo must fail loudly rather than silently becoming a pay component.
    await expect(
      caller("clerk_dim_bad").ingest({
        ...register([employee("E1", { "Hire Date": "2024-01-01", "Leaving Date": "", FTE: "1", "Cost Centre": "", Site: "" })]),
        mappings: [
          ...identityMappings(),
          { ...COMPONENT_BASE, sourceColumn: "Hire Date", snapshotField: "hiredate" as never },
        ],
      }),
    ).rejects.toThrow();
  });
});
