import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { employeeFileAccessLog } from "@saas/db";
import {
  assignSlot,
  buildEmployeeFile,
  type EmployeeSnapshotRow,
} from "@saas/payroll-core";
import { payDetailProcedure, router, type MemberContext } from "../trpc";
import { parseRows, Numeric, IntLike, toIsoDate } from "../parse-rows";
import {
  CurrencyCodeSchema,
  PeriodTypeSchema,
  RANGE_KINDS,
  periodIdBinds,
  resolveEmployeeFileScope,
  type EmployeeFileScope,
  type RangeKind,
} from "../employee-file/scope";

/**
 * `employeeFile.list` and `employeeFile.get` (steps D3, D4 and D5).
 *
 * ## Tenancy
 *
 * `employee_snapshots` carries **no `companyId`**. It reaches tenancy only
 * through `payroll_periods`, so scoping is an ownership check on the period or a
 * join to it, never a filter on the snapshot table.
 *
 * In this design the period ids were already resolved under
 * `company_id = ctx.companyId` in `resolveEmployeeFileScope`, so **the id list
 * itself is the tenant boundary**. That is correct but it is not obvious, hence
 * this note: forgetting to scope by `companyId` is a cross-tenant data leak,
 * not just a bug.
 *
 * An id belonging to another company answers NOT_FOUND, never FORBIDDEN, so the
 * error does not confirm the id exists.
 *
 * ## Round-trip budget: 3 per route
 *
 * The middleware's user lookup, the scope batch, and one data batch. Counted the
 * way `apps/web/test/annual-router.test.ts` counts it — including the
 * middleware — and held by `employee-file-router.test.ts`, so a later
 * sequential `await` fails a test rather than quietly costing a request.
 *
 * ## No DISTINCT ON, anywhere
 *
 * Period de-duplication happens in TypeScript through `dedupePeriods`, and
 * employee rows are summed rather than de-duplicated. The `created_at DESC`
 * tie-break a `DISTINCT ON` would need cannot work on snapshot rows at all:
 * `processUpload` inserts every row of a period in one statement and the column
 * defaults to transaction time, so they share a timestamp and the tie-break
 * picks arbitrarily — possibly differently between runs.
 */

const RangeSchema = z.enum(RANGE_KINDS);

/** Every column aliased as "camelCase", every result through `parseRows`. */
const ListRowSchema = z.object({
  employeeExternalId: z.string(),
  employeeName: z.string().nullable(),
  department: z.string(),
  paidPeriods: IntLike,
  rangeGross: Numeric,
  latestGross: Numeric,
  latestNet: Numeric,
  lastPeriodEnd: z.union([z.string(), z.date()]).transform(toIsoDate),
  netExceedsGrossRows: IntLike,
  negativeNetRows: IntLike,
  hasDuplicateRows: z.boolean(),
  terminationDate: z.union([z.string(), z.date()]).transform(toIsoDate).nullable(),
});

const CountRowSchema = z.object({ total: IntLike });
const DepartmentRowSchema = z.object({ department: z.string() });
const DimensionKeyRowSchema = z.object({ key: z.string() });
const DimensionValueRowSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const SnapshotRowSchema = z.object({
  id: z.string(),
  payrollPeriodId: z.string(),
  employeeExternalId: z.string(),
  employeeName: z.string(),
  department: z.string().nullable(),
  grossSalary: Numeric,
  netSalary: Numeric,
  currencyCode: z.string(),
  components: z.unknown(),
  hireDate: z.union([z.string(), z.date()]).transform(toIsoDate).nullable(),
  terminationDate: z.union([z.string(), z.date()]).transform(toIsoDate).nullable(),
  fte: Numeric.nullable(),
  dimensions: z.unknown(),
});

const ExistenceRowSchema = z.object({ periods: IntLike });

/**
 * `components` and `dimensions` are jsonb, so what comes back is already parsed
 * but untyped. Values may be numbers, numeric strings, or `null` for a blank
 * cell — and a blank cell is **absent, never 0**: coalescing it would read as a
 * removed component and make "received overtime" true for everyone.
 */
function toComponentMap(raw: unknown): Record<string, number | null> {
  if (raw === null || typeof raw !== "object") return {};
  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined || value === "") {
      out[key] = null;
      continue;
    }
    const n = Number(value);
    // A non-numeric cell (a cost-centre code mapped as a component) is absent
    // rather than 0, for the same reason: a real figure in the bridge for every
    // employee is worse than a declared gap.
    out[key] = Number.isFinite(n) ? n : null;
  }
  return out;
}

function toDimensionMap(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/** Dimension values per key, capped so a high-cardinality key degrades. */
const DIMENSION_VALUE_LIMIT = 50;

type LogAction = "view_list" | "view_file";

/**
 * The access-log insert, as a member of the data batch.
 *
 * **It therefore costs zero extra round trips, and it cannot be skipped** by an
 * early return or forgotten on a new code path, because it is a member of the
 * array the procedure is built from.
 *
 * Two consequences, both deliberate:
 *
 *   - It logs the **attempt**, not the successful render. For an id the company
 *     does not have, the queries still succeed and return nothing, so the row
 *     survives — and an attempted read of an unknown id is precisely what an
 *     access review wants to see. Logging only successes would hide probing.
 *   - `db.batch` on neon-http is one transaction, so an error in a later query
 *     rolls the log row back. Every other member of the batch is a read, so
 *     that can only happen on a bug rather than on a data condition. Noted
 *     rather than engineered around: the alternative is a separate awaited
 *     insert, which takes the budget from 3 to 4 on the most-viewed screen in
 *     the feature.
 *
 * `row_count` stays at its default of 0. The insert records that a read of this
 * scope happened; counting the rows returned would need the result first, and a
 * precise count is not worth a round trip. If it matters later it is a follow-up
 * update or a second table, not a fourth request here.
 */
function accessLogInsert(
  ctx: MemberContext,
  scope: EmployeeFileScope,
  opts: { action: LogAction; externalId?: string; range: RangeKind; slotIndex?: number },
) {
  return ctx.db.insert(employeeFileAccessLog).values({
    companyId: ctx.companyId,
    userId: ctx.currentUser.id,
    action: opts.action,
    // Null for a list read, which names no single person.
    employeeExternalId: opts.externalId ?? null,
    periodType: scope.periodType,
    currencyCode: scope.currency,
    fiscalYear: scope.fiscalYear,
    rangeKind: opts.range,
    slotFrom: scope.expected[0]?.index ?? null,
    slotTo: scope.expected[scope.expected.length - 1]?.index ?? null,
  });
}

/** The scope block every response carries, so the UI never infers it. */
function scopeResponse(scope: EmployeeFileScope) {
  return {
    scopeOptions: scope.scopeOptions,
    periodType: scope.periodType,
    currency: scope.currency,
    decimals: scope.decimals,
    fiscalYear: scope.fiscalYear,
    label: scope.label,
    defaultedToLatestData: scope.defaultedToLatestData,
    latestDataLabel: scope.latestDataLabel,
    expected: scope.expected,
    slotsPerYear: scope.slotsPerYear,
    coveredSlotIndexes: scope.coveredSlotIndexes,
    supersededCount: scope.supersededCount,
  };
}

export const employeeFileRouter = router({
  list: payDetailProcedure
    .input(
      z.object({
        year: z.number().int().min(2000).max(2100).optional(),
        range: RangeSchema.default("ytd"),
        slotIndex: z.number().int().positive().optional(),
        periodType: PeriodTypeSchema.optional(),
        currency: CurrencyCodeSchema.optional(),
        scope: z
          .enum(["paid_in_range", "currently_employed", "everyone_on_record"])
          .default("paid_in_range"),
        q: z.string().max(200).optional(),
        departments: z.array(z.string().max(200)).max(50).optional(),
        hasFlag: z.enum(["critical", "duplicate"]).optional(),
        sort: z
          .enum(["flags", "name", "range_gross", "latest_gross", "paid_periods"])
          .default("flags"),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveEmployeeFileScope(ctx, input);

      // `IN ()` is a Postgres syntax error, so a scope with no surviving
      // periods returns before any SQL runs.
      if (scope.periodIdsInRange.length === 0) {
        return {
          scope: scopeResponse(scope),
          employees: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          departments: [],
          dimensions: [],
          excludedByScope: 0,
        };
      }

      const ids = periodIdBinds(scope.periodIdsInRange);
      const offset = (input.page - 1) * input.pageSize;

      // Free text searches EVERY name the id has carried in range, not only the
      // latest, with ILIKE — a renamed employee is otherwise unfindable under
      // the name the requester knows, and `like` is case-sensitive in Postgres.
      const search = input.q?.trim();
      const searchFilter = search
        ? sql`AND EXISTS (
            SELECT 1 FROM employee_snapshots m
            WHERE m.payroll_period_id IN (${ids})
              AND m.employee_external_id = r.employee_external_id
              AND (m.employee_name ILIKE ${`%${search}%`}
                   OR m.employee_external_id ILIKE ${`%${search}%`})
          )`
        : sql``;

      // Department matching is "in ANY slot in range", because department lives
      // on the snapshot and one employee can hold several across a year.
      // Anything else hides transfers.
      const departmentFilter =
        input.departments && input.departments.length > 0
          ? sql`AND EXISTS (
              SELECT 1 FROM employee_snapshots d
              WHERE d.payroll_period_id IN (${ids})
                AND d.employee_external_id = r.employee_external_id
                AND COALESCE(d.department, 'Unassigned') IN (${sql.join(
                  input.departments.map((department) => sql`${department}`),
                  sql`, `,
                )})
            )`
          : sql``;

      /**
       * The flag predicates that are SQL-expressible for every employee.
       *
       * Narrowed from the spec's full flag set on purpose (finding F5): two of
       * the four reconciliation checks need the TypeScript classifier, so
       * sorting the whole company by worst severity before pagination would
       * mean pulling every employee's every slot's `components` jsonb into Node
       * on every list view — 2,160 rows on samples/2025, 24,000 at a plausible
       * customer size, per page view.
       *
       * These three are pure column arithmetic and they are exactly what
       * acceptance assertion 10 requires visible in the list without opening a
       * file. The identity breaches live on the file page, where the classifier
       * is already running.
       */
      const criticalFlagCount = sql`
        COUNT(*) FILTER (WHERE r.net_salary > r.gross_salary)
        + COUNT(*) FILTER (WHERE r.net_salary < 0)
      `;
      const hasDuplicate = sql`COUNT(*) > COUNT(DISTINCT r.payroll_period_id)`;

      const flagFilter =
        input.hasFlag === "critical"
          ? sql`HAVING (${criticalFlagCount}) > 0`
          : input.hasFlag === "duplicate"
            ? sql`HAVING ${hasDuplicate}`
            : sql``;

      // Default sort is "critical first, then name", and the column header says
      // which flags it counts. Money sorts on the numeric column, never on a
      // formatted string.
      const order =
        input.sort === "name"
          ? sql`ORDER BY 2 ASC`
          : input.sort === "range_gross"
            ? sql`ORDER BY "rangeGross" DESC`
            : input.sort === "latest_gross"
              ? sql`ORDER BY "latestGross" DESC`
              : input.sort === "paid_periods"
                ? sql`ORDER BY "paidPeriods" DESC`
                : sql`ORDER BY ((${criticalFlagCount}) > 0) DESC, 2 ASC`;

      /**
       * Latest name and latest department via `array_agg(... ORDER BY ...)[1]`,
       * **not** `MAX` (finding F10). `annual.ts:1113` uses
       * `MAX(r.employee_name)`, which is the *alphabetical* maximum rather than
       * the latest — wrong for "display the latest name, keep every prior
       * name", and not to be copied. Fixing that line is a separate one-line
       * follow-up.
       */
      const [pageRes, countRes, departmentRes, dimensionKeyRes, dimensionValueRes] =
        await ctx.db.batch([
          ctx.db.execute(sql`
            SELECT r.employee_external_id AS "employeeExternalId",
                   (array_agg(r.employee_name ORDER BY p.period_end DESC, p.created_at DESC))[1]
                     AS "employeeName",
                   (array_agg(COALESCE(r.department, 'Unassigned')
                              ORDER BY p.period_end DESC, p.created_at DESC))[1]
                     AS department,
                   COUNT(DISTINCT p.id)::int AS "paidPeriods",
                   COALESCE(SUM(r.gross_salary), 0)::numeric AS "rangeGross",
                   (array_agg(r.gross_salary ORDER BY p.period_end DESC, p.created_at DESC))[1]
                     AS "latestGross",
                   (array_agg(r.net_salary ORDER BY p.period_end DESC, p.created_at DESC))[1]
                     AS "latestNet",
                   MAX(p.period_end) AS "lastPeriodEnd",
                   COUNT(*) FILTER (WHERE r.net_salary > r.gross_salary)::int
                     AS "netExceedsGrossRows",
                   COUNT(*) FILTER (WHERE r.net_salary < 0)::int AS "negativeNetRows",
                   (COUNT(*) > COUNT(DISTINCT r.payroll_period_id)) AS "hasDuplicateRows",
                   (array_agg(r.termination_date ORDER BY p.period_end DESC, p.created_at DESC))[1]
                     AS "terminationDate"
            FROM employee_snapshots r
            JOIN payroll_periods p ON p.id = r.payroll_period_id
            WHERE r.payroll_period_id IN (${ids})
              ${searchFilter}
              ${departmentFilter}
            GROUP BY r.employee_external_id
            ${flagFilter}
            ${order}
            LIMIT ${input.pageSize} OFFSET ${offset}
          `),
          ctx.db.execute(sql`
            SELECT COUNT(*)::int AS total FROM (
              SELECT r.employee_external_id
              FROM employee_snapshots r
              JOIN payroll_periods p ON p.id = r.payroll_period_id
              WHERE r.payroll_period_id IN (${ids})
                ${searchFilter}
                ${departmentFilter}
              GROUP BY r.employee_external_id
              ${flagFilter}
            ) counted
          `),
          ctx.db.execute(sql`
            SELECT DISTINCT COALESCE(department, 'Unassigned') AS department
            FROM employee_snapshots
            WHERE payroll_period_id IN (${ids})
            ORDER BY 1
          `),
          ctx.db.execute(sql`
            SELECT DISTINCT k AS key
            FROM employee_snapshots r
            CROSS JOIN LATERAL jsonb_object_keys(r.dimensions) k
            WHERE r.payroll_period_id IN (${ids})
            ORDER BY 1
          `),
          // Values per key, with a per-key cap so a high-cardinality key
          // degrades to free text instead of rendering a 4,000-item picker. A
          // key with zero values gets no picker at all rather than an empty one.
          ctx.db.execute(sql`
            SELECT key, value FROM (
              SELECT d.key,
                     d.value,
                     ROW_NUMBER() OVER (PARTITION BY d.key ORDER BY d.value) AS rn
              FROM (
                SELECT DISTINCT k.key, k.value
                FROM employee_snapshots r
                CROSS JOIN LATERAL jsonb_each_text(r.dimensions) k
                WHERE r.payroll_period_id IN (${ids})
              ) d
            ) ranked
            WHERE rn <= ${DIMENSION_VALUE_LIMIT + 1}
            ORDER BY key, value
          `),
          accessLogInsert(ctx, scope, {
            action: "view_list",
            range: input.range,
            slotIndex: input.slotIndex,
          }),
        ]);

      const rows = parseRows(ListRowSchema, pageRes.rows, "employee list");
      const total = parseRows(CountRowSchema, countRes.rows, "employee count")[0]?.total ?? 0;

      // The slot label is resolved here by `assignSlot`, never by comparing end
      // dates: a 26th-to-25th payroll matches no month by equality.
      const employees = rows.map((row) => {
        const slot = assignSlot({ periodEnd: row.lastPeriodEnd }, scope.periodType, scope.expected);
        return {
          externalId: row.employeeExternalId,
          name: row.employeeName,
          department: row.department,
          paidPeriods: row.paidPeriods,
          coveredSlots: scope.coveredSlotIndexes.length,
          rangeGross: row.rangeGross,
          latestGross: row.latestGross,
          latestNet: row.latestNet,
          lastPaidSlotLabel: slot?.label ?? null,
          lastPaidSlotIndex: slot?.index ?? null,
          terminationDate: row.terminationDate,
          criticalFlags: row.netExceedsGrossRows + row.negativeNetRows,
          netExceedsGrossRows: row.netExceedsGrossRows,
          negativeNetRows: row.negativeNetRows,
          hasDuplicateRows: row.hasDuplicateRows,
        };
      });

      const dimensionKeys = parseRows(
        DimensionKeyRowSchema,
        dimensionKeyRes.rows,
        "dimension key",
      ).map((r) => r.key);
      const dimensionValues = parseRows(
        DimensionValueRowSchema,
        dimensionValueRes.rows,
        "dimension value",
      );

      const dimensions = dimensionKeys.map((key) => {
        const values = dimensionValues.filter((v) => v.key === key).map((v) => v.value);
        return {
          key,
          values: values.slice(0, DIMENSION_VALUE_LIMIT),
          truncated: values.length > DIMENSION_VALUE_LIMIT,
        };
      });

      /**
       * `currently_employed` drops rows, so the footer has to state how many —
       * a filter that drops rows without saying how many is how a payroll total
       * gets signed off short.
       *
       * The scope itself is applied here rather than in SQL: "appears in the
       * latest covered slot" needs `assignSlot` to know which slot that is, and
       * the page is already in hand.
       */
      const latestIndex = scope.lastCoveredIndex;
      const filtered =
        input.scope === "currently_employed"
          ? employees.filter(
              (e) =>
                e.lastPaidSlotIndex === latestIndex &&
                (e.terminationDate === null ||
                  e.terminationDate >
                    (scope.expected.find((s) => s.index === latestIndex)?.end ?? "")),
            )
          : employees;

      return {
        scope: scopeResponse(scope),
        employees: filtered,
        total,
        page: input.page,
        pageSize: input.pageSize,
        departments: parseRows(DepartmentRowSchema, departmentRes.rows, "department").map(
          (r) => r.department,
        ),
        dimensions,
        excludedByScope: employees.length - filtered.length,
      };
    }),

  /**
   * One procedure returning the whole assembled file, not one per section.
   *
   * Each procedure costs its own middleware lookup plus its own scope batch, so
   * five sections would be fifteen round trips for one page. The annual router
   * made that mistake once — about thirteen sequential requests per view — and
   * the fix was this shape.
   */
  get: payDetailProcedure
    .input(
      z.object({
        externalId: z.string().min(1).max(100),
        year: z.number().int().min(2000).max(2100).optional(),
        range: RangeSchema.default("ytd"),
        slotIndex: z.number().int().positive().optional(),
        periodType: PeriodTypeSchema.optional(),
        currency: CurrencyCodeSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveEmployeeFileScope(ctx, input);

      /**
       * With no surviving periods in range there is nothing to query, but the
       * id may still be one the company has. The existence probe therefore
       * cannot be skipped — it is what tells NOT_FOUND from a valid, empty
       * file — so it runs on its own here rather than inside the batch.
       *
       * This path is the empty-range case, not the normal one, so it stays
       * within budget: there is no data batch to carry it.
       */
      if (scope.periodIdsInRange.length === 0) {
        const [probeRes] = await ctx.db.batch([
          ctx.db.execute(sql`
            SELECT COUNT(DISTINCT r.payroll_period_id)::int AS periods
            FROM employee_snapshots r
            JOIN payroll_periods p ON p.id = r.payroll_period_id
            WHERE p.company_id = ${ctx.companyId}
              AND p.status = 'ready'
              AND r.employee_external_id = ${input.externalId}
          `),
          accessLogInsert(ctx, scope, {
            action: "view_file",
            externalId: input.externalId,
            range: input.range,
            slotIndex: input.slotIndex,
          }),
        ]);

        const known =
          (parseRows(ExistenceRowSchema, probeRes.rows, "employee existence")[0]?.periods ?? 0) > 0;
        if (!known) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        }

        return {
          scope: scopeResponse(scope),
          file: buildEmployeeFile({
            externalId: input.externalId,
            expected: scope.expected,
            periods: [],
            cadence: scope.periodType,
            currency: scope.currency,
            rows: [],
            savedCategories: scope.savedCategories,
            tolerances: scope.tolerances,
            supersededUploads: scope.supersededCount,
            slotsPerYear: scope.slotsPerYear,
          }),
          knownToCompany: true,
        };
      }

      const ids = periodIdBinds(scope.periodIdsInRange);

      const [rowsRes, probeRes] = await ctx.db.batch([
        // Every snapshot row for this employee across the surviving period ids
        // — not de-duplicated, every row, including duplicates. This is the
        // query 0011's `(employee_external_id, payroll_period_id)` index exists
        // for: 0006's index is led by the period, which this does not constrain.
        ctx.db.execute(sql`
          SELECT r.id,
                 r.payroll_period_id      AS "payrollPeriodId",
                 r.employee_external_id   AS "employeeExternalId",
                 r.employee_name          AS "employeeName",
                 r.department,
                 r.gross_salary           AS "grossSalary",
                 r.net_salary             AS "netSalary",
                 r.currency_code          AS "currencyCode",
                 r.components,
                 r.hire_date              AS "hireDate",
                 r.termination_date       AS "terminationDate",
                 r.fte,
                 r.dimensions
          FROM employee_snapshots r
          WHERE r.employee_external_id = ${input.externalId}
            AND r.payroll_period_id IN (${ids})
        `),
        /**
         * The existence probe, which answers the case the spec never states
         * (finding F6): an id that exists but has nothing in the selected range
         * — a leaver opened in the current year.
         *
         * NOT_FOUND only when the id has no rows in **any** ready period for
         * the company. An id with nothing in *this* range renders a valid,
         * empty file naming the ranges that do have data. Otherwise every
         * bookmark breaks each January.
         *
         * Tenancy here is the explicit `p.company_id` predicate, because this
         * query deliberately looks outside the scope's own period ids.
         */
        ctx.db.execute(sql`
          SELECT COUNT(DISTINCT r.payroll_period_id)::int AS periods
          FROM employee_snapshots r
          JOIN payroll_periods p ON p.id = r.payroll_period_id
          WHERE p.company_id = ${ctx.companyId}
            AND p.status = 'ready'
            AND r.employee_external_id = ${input.externalId}
        `),
        accessLogInsert(ctx, scope, {
          action: "view_file",
          externalId: input.externalId,
          range: input.range,
          slotIndex: input.slotIndex,
        }),
      ]);

      const parsed = parseRows(SnapshotRowSchema, rowsRes.rows, "employee snapshot");
      const known =
        (parseRows(ExistenceRowSchema, probeRes.rows, "employee existence")[0]?.periods ?? 0) > 0;

      // An id the company does not have at all answers NOT_FOUND, never
      // FORBIDDEN, so the error does not confirm that the id exists elsewhere.
      if (!known) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // `Number(string)` happens here, once per value, on the way in. The
      // engine works in `number` throughout; nothing goes back out, because the
      // feature is read-only.
      const rows: EmployeeSnapshotRow[] = parsed.map((row) => ({
        id: row.id,
        payrollPeriodId: row.payrollPeriodId,
        employeeExternalId: row.employeeExternalId,
        employeeName: row.employeeName,
        department: row.department,
        gross: row.grossSalary,
        net: row.netSalary,
        currency: row.currencyCode,
        components: toComponentMap(row.components),
        hireDate: row.hireDate,
        terminationDate: row.terminationDate,
        fte: row.fte,
        dimensions: toDimensionMap(row.dimensions),
      }));

      return {
        scope: scopeResponse(scope),
        file: buildEmployeeFile({
          externalId: input.externalId,
          expected: scope.expected,
          periods: scope.periods,
          cadence: scope.periodType,
          currency: scope.currency,
          rows,
          savedCategories: scope.savedCategories,
          tolerances: scope.tolerances,
          supersededUploads: scope.supersededCount,
          slotsPerYear: scope.slotsPerYear,
        }),
        knownToCompany: true,
      };
    }),
});
