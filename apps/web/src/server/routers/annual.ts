import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, desc } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  componentCategories,
  companies,
  annualBudgets,
  annualBudgetPhasing,
  annualInsightCaches,
  annualAuditLog,
} from "@saas/db";
import {
  computeSummary,
  classifyComponentWithReason,
  MONEY_CATEGORIES,
  type AnnualPeriodInput,
  type AnnualSummary,
  type Category,
  type ForecastMethod,
  type PeriodType,
  type ComponentAggregate,
  type DepartmentTotalsInput,
  fiscalYearInterval,
  fiscalYearOf,
  normaliseFiscalStartMonth,
} from "@saas/payroll-core";
import { generateAnnualInsights, DEFAULT_MODEL, isAiAvailable, type AnnualInsightPayload } from "@saas/ai";
import { memberProcedure, editorProcedure, adminProcedure, router, type MemberContext } from "../trpc";
import { buildAnnualWorkbook, annualWorkbookSheets } from "../export/annual-workbook";
import { limitInsightGeneration } from "../rate-limit";

const PeriodTypeSchema = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);
const ForecastMethodSchema = z.enum(["run_rate", "average", "prior_year"]);
const BudgetBasisSchema = z.enum(["gross", "employer_cost", "net"]);
const CategoryEnum = z.enum([
  "base_salary",
  "allowance",
  "bonus_commission",
  "overtime",
  "other_earning",
  "income_tax",
  "social_security_employee",
  "other_deduction",
  "absence_deduction",
  "social_security_employer",
  "other_employer_cost",
  "absence_days",
  "other_quantity",
  "ignore",
  "uncategorised",
]);

/**
 * ISO 4217 is three upper-case letters. The budget endpoint accepted "lbp" and
 * stored it as a distinct currency from "LBP" (finding C15/R7).
 */
const CurrencyCodeSchema = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), { message: "Currency must be a 3-letter ISO code" });

// Raw rows come back from db.execute untyped. Postgres returns the column name as
// written, so every query below aliases snake_case to camelCase and parses the
// result with one of these schemas. Never cast a raw row with `as unknown as`: the
// keys and the declared type drift apart silently, which is finding C1.
const Numeric = z.union([z.string(), z.number()]).transform(Number);
const IntLike = z.union([z.string(), z.number()]).transform((v) => Math.trunc(Number(v)));

const PeriodRowSchema = z.object({
  id: z.string(),
  periodType: z.string(),
  periodStart: z.union([z.string(), z.date()]).transform(toIsoDate),
  periodEnd: z.union([z.string(), z.date()]).transform(toIsoDate),
  currencyCode: z.string(),
  createdAt: z.union([z.string(), z.date()]).transform(toIsoTimestamp),
});

const HeadcountRowSchema = z.object({
  id: z.string(),
  headcount: IntLike,
  gross: Numeric,
  net: Numeric,
});

const ComponentRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  total: Numeric,
  negRows: IntLike,
  posRows: IntLike,
});

const EmployeeRowSchema = z.object({
  id: z.string(),
  employeeExternalId: z.string(),
});

const DepartmentTotalsRowSchema = z.object({
  department: z.string(),
  key: z.string(),
  total: Numeric,
});

const DepartmentHeadcountRowSchema = z.object({
  department: z.string(),
  periodEnd: z.union([z.string(), z.date()]).transform(toIsoDate),
  headcount: IntLike,
  // Department gross/net straight from SQL (step 15): the engine needs real gross
  // to cost a department, rather than reconstructing it from components.
  gross: Numeric,
  net: Numeric,
});

const SetupRowSchema = z.object({
  periodType: z.string(),
  currencyCode: z.string(),
  periodEnd: z.union([z.string(), z.date()]).transform(toIsoDate),
});

function toIsoDate(v: string | Date): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Postgres `date` arrives as "YYYY-MM-DD"; keep it verbatim rather than passing
  // it through Date, which would shift it by the local timezone offset.
  return v.length >= 10 ? v.slice(0, 10) : v;
}

function toIsoTimestamp(v: string | Date): string {
  if (v instanceof Date) return v.toISOString();
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unparseable timestamp from database: ${JSON.stringify(v)}`,
    });
  }
  return parsed.toISOString();
}

function parseRows<T extends z.ZodTypeAny>(schema: T, rows: unknown[], label: string): z.infer<T>[] {
  const parsed = schema.array().safeParse(rows);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Unexpected ${label} row shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    });
  }
  return parsed.data;
}

const numericComponentFilter = sql`(x.value #>> '{}') ~ '^-?[0-9]+(\\.[0-9]+)?$'`;

/**
 * The valid-periods CTE, selecting only the columns the annual queries use.
 *
 * `SELECT *` previously carried the whole components JSON through both CTEs on
 * every query that did not need it (finding B6).
 */
function validPeriodsCte(
  companyId: string,
  periodType: string,
  currency: string,
  year: number,
  fiscalStartMonth = 1,
) {
  // The year boundary comes from fiscal.ts rather than being written inline, so
  // SQL and the engine cannot disagree about where a year starts (step 45).
  const interval = fiscalYearInterval(year, fiscalStartMonth);
  return sql`
    valid_periods AS (
      SELECT DISTINCT ON (period_type, period_start, period_end)
             id, period_type, period_start, period_end, currency_code, created_at
      FROM payroll_periods
      WHERE company_id = ${companyId} AND status = 'ready'
        AND period_type = ${periodType} AND currency_code = ${currency}
        AND period_end >= ${interval.start}::date AND period_end < ${interval.endExclusive}::date
      ORDER BY period_type, period_start, period_end, created_at DESC
    ),
    snaps AS (
      SELECT DISTINCT ON (payroll_period_id, employee_external_id)
             id, payroll_period_id, employee_external_id, employee_name, department,
             gross_salary, net_salary, components, created_at
      FROM employee_snapshots
      WHERE payroll_period_id IN (SELECT id FROM valid_periods)
      ORDER BY payroll_period_id, employee_external_id, created_at DESC
    )`;
}

// ---------------------------------------------------------------------------
// Loaders (step 26, finding A5)
//
// A page view ran about 13 sequential SQL round trips. These two functions make
// it two: one to resolve which cadence/currency/company we are looking at, and
// one batched call for everything else. `db.batch` on neon-http sends the whole
// array in a single HTTP request.
// ---------------------------------------------------------------------------

function yearQueries(ctx: MemberContext, opts: { companyId: string; periodType: string; currency: string; year: number; fiscalStartMonth: number }) {
  const { companyId, periodType, currency, year, fiscalStartMonth } = opts;
  const cte = validPeriodsCte(companyId, periodType, currency, year, fiscalStartMonth);

  return {
    periods: ctx.db.execute(sql`
      WITH ${cte}
      SELECT id,
             period_type   AS "periodType",
             period_start  AS "periodStart",
             period_end    AS "periodEnd",
             currency_code AS "currencyCode",
             created_at    AS "createdAt"
      FROM valid_periods
      ORDER BY period_end
    `),
    headcount: ctx.db.execute(sql`
      WITH ${cte}
      SELECT p.id,
             COUNT(r.id)::int AS headcount,
             COALESCE(SUM(r.gross_salary), 0)::numeric AS gross,
             COALESCE(SUM(r.net_salary), 0)::numeric AS net
      FROM valid_periods p
      LEFT JOIN snaps r ON r.payroll_period_id = p.id
      GROUP BY p.id
    `),
    /**
     * Step 31 (finding B7): read the pre-computed aggregates, and fall back to
     * the live unnest only for periods that have none yet.
     *
     * The fallback is what makes this safe to deploy before the backfill has
     * run — and keeps a period uploaded by an older build correct. Both halves
     * aggregate identically, so which one answers is invisible to the caller.
     */
    components: ctx.db.execute(sql`
      WITH ${cte},
      aggregated AS (
        SELECT t.payroll_period_id AS id,
               t.component_key     AS key,
               SUM(t.total)        AS total,
               SUM(t.neg_rows)::int AS neg_rows,
               SUM(t.pos_rows)::int AS pos_rows
        FROM period_component_totals t
        WHERE t.payroll_period_id IN (SELECT id FROM valid_periods)
        GROUP BY t.payroll_period_id, t.component_key
      ),
      live AS (
        SELECT p.id, x.key,
               COALESCE(SUM((x.value #>> '{}')::numeric), 0) AS total,
               COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric < 0)::int AS neg_rows,
               COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric > 0)::int AS pos_rows
        FROM valid_periods p
        JOIN snaps r ON r.payroll_period_id = p.id
        CROSS JOIN LATERAL jsonb_each(r.components) x
        WHERE ${numericComponentFilter}
          AND p.id NOT IN (SELECT DISTINCT payroll_period_id FROM period_component_totals)
        GROUP BY p.id, x.key
      )
      SELECT id, key, total, neg_rows AS "negRows", pos_rows AS "posRows" FROM aggregated
      UNION ALL
      SELECT id, key, total, neg_rows AS "negRows", pos_rows AS "posRows" FROM live
    `),
    employees: ctx.db.execute(sql`
      WITH ${cte}
      SELECT p.id, r.employee_external_id AS "employeeExternalId"
      FROM valid_periods p
      LEFT JOIN snaps r ON r.payroll_period_id = p.id
      WHERE r.id IS NOT NULL
    `),
  };
}

function departmentQueries(ctx: MemberContext, opts: { companyId: string; periodType: string; currency: string; year: number; fiscalStartMonth: number }) {
  const { companyId, periodType, currency, year, fiscalStartMonth } = opts;
  const cte = validPeriodsCte(companyId, periodType, currency, year, fiscalStartMonth);

  return {
    /** Same aggregate-first-with-fallback shape as the period components (step 31). */
    totals: ctx.db.execute(sql`
      WITH ${cte},
      aggregated AS (
        SELECT t.department, t.component_key AS key, SUM(t.total) AS total
        FROM period_component_totals t
        WHERE t.payroll_period_id IN (SELECT id FROM valid_periods)
        GROUP BY t.department, t.component_key
      ),
      live AS (
        SELECT COALESCE(r.department, 'Unassigned') AS department, x.key,
               COALESCE(SUM((x.value #>> '{}')::numeric), 0) AS total
        FROM valid_periods p
        JOIN snaps r ON r.payroll_period_id = p.id
        CROSS JOIN LATERAL jsonb_each(r.components) x
        WHERE ${numericComponentFilter}
          AND p.id NOT IN (SELECT DISTINCT payroll_period_id FROM period_component_totals)
        GROUP BY 1, 2
      )
      SELECT department, key, SUM(total) AS total
      FROM (SELECT * FROM aggregated UNION ALL SELECT * FROM live) u
      GROUP BY department, key
    `),
    headcounts: ctx.db.execute(sql`
      WITH ${cte}
      SELECT COALESCE(r.department, 'Unassigned') AS department,
             p.period_end AS "periodEnd",
             COUNT(DISTINCT r.employee_external_id)::int AS headcount,
             COALESCE(SUM(r.gross_salary), 0)::numeric AS gross,
             COALESCE(SUM(r.net_salary), 0)::numeric   AS net
      FROM valid_periods p
      JOIN snaps r ON r.payroll_period_id = p.id
      GROUP BY 1, 2
    `),
  };
}

function assemblePeriods(
  periodRows: z.infer<typeof PeriodRowSchema>[],
  headcountRows: z.infer<typeof HeadcountRowSchema>[],
  componentRows: z.infer<typeof ComponentRowSchema>[],
  employeeRows: z.infer<typeof EmployeeRowSchema>[],
): AnnualPeriodInput[] {
  const headcountMap = new Map(headcountRows.map((r) => [r.id, r]));

  const componentsByPeriod = new Map<string, ComponentAggregate[]>();
  for (const c of componentRows) {
    const list = componentsByPeriod.get(c.id) ?? [];
    list.push({ key: c.key, total: c.total, negRows: c.negRows, posRows: c.posRows });
    componentsByPeriod.set(c.id, list);
  }

  const employeeIdsByPeriod = new Map<string, string[]>();
  for (const r of employeeRows) {
    const list = employeeIdsByPeriod.get(r.id) ?? [];
    list.push(r.employeeExternalId);
    employeeIdsByPeriod.set(r.id, list);
  }

  return periodRows.map((p) => {
    const hc = headcountMap.get(p.id);
    return {
      id: p.id,
      periodType: p.periodType as PeriodType,
      currency: p.currencyCode,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      createdAt: p.createdAt,
      headcount: hc ? hc.headcount : 0,
      gross: hc ? hc.gross : 0,
      net: hc ? hc.net : 0,
      components: componentsByPeriod.get(p.id) ?? [],
      employeeIds: employeeIdsByPeriod.get(p.id) ?? [],
    };
  });
}

function assembleDepartments(
  totals: z.infer<typeof DepartmentTotalsRowSchema>[],
  headcounts: z.infer<typeof DepartmentHeadcountRowSchema>[],
): DepartmentTotalsInput[] {
  const periodEnds = [...new Set(headcounts.map((h) => h.periodEnd))].sort();

  const headcountsByDepartment = new Map<string, Map<string, number>>();
  const grossByDepartment = new Map<string, number>();
  const netByDepartment = new Map<string, number>();
  for (const h of headcounts) {
    const dept = headcountsByDepartment.get(h.department) ?? new Map<string, number>();
    dept.set(h.periodEnd, h.headcount);
    headcountsByDepartment.set(h.department, dept);
    grossByDepartment.set(h.department, (grossByDepartment.get(h.department) ?? 0) + h.gross);
    netByDepartment.set(h.department, (netByDepartment.get(h.department) ?? 0) + h.net);
  }

  const componentsByDepartment = new Map<string, Map<string, number>>();
  for (const t of totals) {
    const map = componentsByDepartment.get(t.department) ?? new Map<string, number>();
    map.set(t.key, t.total);
    componentsByDepartment.set(t.department, map);
  }

  return [...new Set([...componentsByDepartment.keys(), ...headcountsByDepartment.keys()])].map((department) => {
    const componentMap = componentsByDepartment.get(department) ?? new Map<string, number>();
    const deptHeadcounts = headcountsByDepartment.get(department) ?? new Map<string, number>();
    return {
      department,
      components: [...componentMap.entries()].map(([key, total]) => ({ key, total })),
      headcounts: periodEnds.map((end) => deptHeadcounts.get(end) ?? 0),
      gross: grossByDepartment.get(department) ?? 0,
      net: netByDepartment.get(department) ?? 0,
    };
  });
}

interface SummaryContext {
  summary: AnnualSummary;
  periodType: PeriodType;
  currency: string;
  allPeriodTypes: PeriodType[];
  allCurrencies: string[];
  companyName: string | undefined;
}

export interface SummaryInput {
  year: number;
  periodType?: PeriodType;
  currency?: string;
  forecastMethod?: ForecastMethod;
}

/**
 * Short-lived per-instance memo (step 26).
 *
 * `getSummary` and `generateInsights` resolve the same summary from the same
 * inputs; a refetch triggered by the client repeats it again. The key includes
 * companyId, so no tenant can read another's entry.
 */
const SUMMARY_TTL_MS = 30_000;
const summaryMemo = new Map<string, { at: number; value: SummaryContext }>();

function memoKey(companyId: string, input: SummaryInput): string {
  return [companyId, input.year, input.periodType ?? "", input.currency ?? "", input.forecastMethod ?? ""].join("|");
}

async function loadSummaryContext(ctx: MemberContext, input: SummaryInput): Promise<SummaryContext> {
  const key = memoKey(ctx.companyId, input);
  const hit = summaryMemo.get(key);
  if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) return hit.value;

  const value = await buildSummaryContext(ctx, input);
  summaryMemo.set(key, { at: Date.now(), value });
  // Keep the map from growing without bound in a long-lived instance.
  if (summaryMemo.size > 64) {
    for (const [k, v] of summaryMemo) {
      if (Date.now() - v.at >= SUMMARY_TTL_MS) summaryMemo.delete(k);
    }
  }
  return value;
}

async function buildSummaryContext(ctx: MemberContext, input: SummaryInput): Promise<SummaryContext> {
  const { companyId } = ctx;

  // ---- round trip 1: what are we looking at? ----
  const [setupRes, companyRows, savedRows] = await ctx.db.batch([
    ctx.db.execute(sql`
      -- One row per ready period, carrying its end date. The fiscal-year filter
      -- and the frequency ordering are applied below, once the company's fiscal
      -- start month is known: it arrives in this same batch, so it cannot be
      -- used to build this query's SQL (step 45). The window spans two calendar
      -- years so any fiscal year starting in the requested one is fully covered.
      --
      -- Never interpolate a value into a comment in one of these templates:
      -- drizzle turns every substitution into a bind parameter, and because the
      -- parser strips comments the parameter is sent but never referenced, which
      -- Postgres rejects with "could not determine data type of parameter"
      -- (42P18). Keep interpolation in the WHERE clause only.
      SELECT period_type   AS "periodType",
             currency_code AS "currencyCode",
             period_end    AS "periodEnd"
      FROM payroll_periods
      WHERE company_id = ${companyId} AND status = 'ready'
        AND period_end >= ${`${input.year}-01-01`}::date
        AND period_end < ${`${input.year + 2}-01-01`}::date
    `),
    ctx.db.select({ name: companies.name, currencyCode: companies.currencyCode, settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, companyId)),
    ctx.db.select({ componentKey: componentCategories.componentKey, category: componentCategories.category })
      .from(componentCategories)
      .where(eq(componentCategories.companyId, companyId)),
  ]);

  const companyRow = companyRows[0];
  const companyCurrency = companyRow?.currencyCode;
  const companySettings = (companyRow?.settings ?? {}) as { fiscalStartMonth?: number };
  const fiscalStartMonth = normaliseFiscalStartMonth(companySettings.fiscalStartMonth);

  // Keep only the periods that fall in this fiscal year, then order cadences and
  // currencies by how often they appear, so index 0 is the most frequent.
  const allRows = parseRows(SetupRowSchema, setupRes.rows, "setup").filter(
    (r) => fiscalYearOf(r.periodEnd, fiscalStartMonth) === input.year,
  );
  const countBy = <T extends string>(values: T[]): T[] => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  };
  const allPeriodTypes = countBy(allRows.map((r) => r.periodType)) as PeriodType[];
  const allCurrencies = countBy(allRows.map((r) => r.currencyCode));

  // Step 8 (A6): the organization's own currency wins when the year actually has
  // data in it; otherwise fall back to the most frequent, and only then to USD.
  const periodType = (input.periodType ?? allPeriodTypes[0] ?? "monthly") as PeriodType;
  const currency =
    input.currency ??
    (companyCurrency && allCurrencies.includes(companyCurrency)
      ? companyCurrency
      : allCurrencies[0] ?? companyCurrency ?? "USD");

  const savedCategories: Record<string, Category> = {};
  for (const s of savedRows) savedCategories[s.componentKey] = s.category as Category;

  // ---- round trip 2: everything else, in one batch ----
  const current = yearQueries(ctx, { companyId, periodType, currency, year: input.year, fiscalStartMonth });
  const departments = departmentQueries(ctx, { companyId, periodType, currency, year: input.year, fiscalStartMonth });
  const prevOpts = { companyId, periodType, currency, year: input.year - 1, fiscalStartMonth };
  const prevCte = validPeriodsCte(prevOpts.companyId, prevOpts.periodType, prevOpts.currency, prevOpts.year, fiscalStartMonth);

  const [
    periodRes,
    headcountRes,
    componentRes,
    employeeRes,
    deptTotalRes,
    deptHeadcountRes,
    prevPeriodRes,
    prevHeadcountRes,
    prevComponentRes,
    prevLastEmployeeRes,
  ] = await ctx.db.batch([
    current.periods,
    current.headcount,
    current.components,
    current.employees,
    departments.totals,
    departments.headcounts,
    ctx.db.execute(sql`
      WITH ${prevCte}
      SELECT id,
             period_type   AS "periodType",
             period_start  AS "periodStart",
             period_end    AS "periodEnd",
             currency_code AS "currencyCode",
             created_at    AS "createdAt"
      FROM valid_periods
      ORDER BY period_end
    `),
    ctx.db.execute(sql`
      WITH ${prevCte}
      SELECT p.id,
             COUNT(r.id)::int AS headcount,
             COALESCE(SUM(r.gross_salary), 0)::numeric AS gross,
             COALESCE(SUM(r.net_salary), 0)::numeric AS net
      FROM valid_periods p
      LEFT JOIN snaps r ON r.payroll_period_id = p.id
      GROUP BY p.id
    `),
    ctx.db.execute(sql`
      WITH ${prevCte}
      SELECT p.id, x.key,
             COALESCE(SUM((x.value #>> '{}')::numeric), 0) AS total,
             COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric < 0)::int AS "negRows",
             COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric > 0)::int AS "posRows"
      FROM valid_periods p
      JOIN snaps r ON r.payroll_period_id = p.id
      CROSS JOIN LATERAL jsonb_each(r.components) x
      WHERE ${numericComponentFilter}
      GROUP BY p.id, x.key
    `),
    // Only the LAST prior-year period's roster is needed, for joiners/leavers
    // across the year boundary — not every snapshot of last year.
    ctx.db.execute(sql`
      WITH ${prevCte},
      last_period AS (SELECT id FROM valid_periods ORDER BY period_end DESC LIMIT 1)
      SELECT lp.id, r.employee_external_id AS "employeeExternalId"
      FROM last_period lp
      JOIN snaps r ON r.payroll_period_id = lp.id
    `),
  ]);

  const periods = assemblePeriods(
    parseRows(PeriodRowSchema, periodRes.rows, "period"),
    parseRows(HeadcountRowSchema, headcountRes.rows, "headcount"),
    parseRows(ComponentRowSchema, componentRes.rows, "component"),
    parseRows(EmployeeRowSchema, employeeRes.rows, "employee"),
  );

  const departmentInputs = assembleDepartments(
    parseRows(DepartmentTotalsRowSchema, deptTotalRes.rows, "department total"),
    parseRows(DepartmentHeadcountRowSchema, deptHeadcountRes.rows, "department headcount"),
  );

  const prevPeriods = assemblePeriods(
    parseRows(PeriodRowSchema, prevPeriodRes.rows, "previous period"),
    parseRows(HeadcountRowSchema, prevHeadcountRes.rows, "previous headcount"),
    parseRows(ComponentRowSchema, prevComponentRes.rows, "previous component"),
    [],
  );

  const prevLastIds = parseRows(EmployeeRowSchema, prevLastEmployeeRes.rows, "previous roster").map(
    (r) => r.employeeExternalId,
  );

  const summary = computeSummary({
    year: input.year,
    periodType,
    currency,
    allPeriodTypes,
    allCurrencies,
    periods,
    forecastMethod: input.forecastMethod,
    previousYear: prevPeriods.length > 0 ? { periods: prevPeriods } : undefined,
    previousYearLastEmployeeIds: prevLastIds.length > 0 ? prevLastIds : undefined,
    savedCategories,
    departments: departmentInputs,
    fiscalStartMonth,
  });

  return {
    summary,
    periodType,
    currency,
    allPeriodTypes,
    allCurrencies,
    companyName: companyRow?.name,
  };
}

const METHOD_LABELS: Record<ForecastMethod, string> = {
  run_rate: "run rate",
  average: "average of the last 3 periods",
  prior_year: "prior-year trend",
};

/**
 * Build the model payload from an already-computed summary (step 23).
 *
 * Two fixes over v1 (finding C11): absence *day counts* were being sent in the
 * money categories list, so the model described days as currency; and the top 10
 * was an unsorted slice of an object's keys, so which categories reached the
 * model depended on insertion order.
 */
export function buildInsightPayload(summary: AnnualSummary, companyName?: string): AnnualInsightPayload {
  const round = (v: number) => Math.round(v * 100) / 100;
  const byCategory = summary.categories.byCategory;

  const moneyCategories = MONEY_CATEGORIES.map((category) => ({
    category,
    total: round(byCategory[category] ?? 0),
  }))
    .filter((c) => c.total !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, 10);

  return {
    year: summary.year,
    periodType: summary.periodType,
    currency: summary.currency,
    companyName,
    coverage: {
      uploaded: summary.coverage.uploaded,
      expected: summary.coverage.expected,
      missingLabels: summary.missingLabels,
    },
    totals: {
      grossToDate: round(summary.bridge.actual.gross),
      netToDate: round(summary.bridge.actual.net),
      employerCostToDate: round(summary.bridge.actual.totalEmploymentCost),
      headcountLatest: summary.periods.length > 0 ? round(summary.periods[summary.periods.length - 1]!.headcount ?? 0) : 0,
      headcountAvgYtd: round(summary.avgHeadcountYtd),
    },
    forecast: {
      // A human-readable method name, not the raw `run_rate` enum, which the
      // model echoed verbatim into user-facing text.
      method: METHOD_LABELS[summary.forecastMethod],
      fullYearNet: round(summary.bridge.fullYear.net),
      fullYearGross: round(summary.bridge.fullYear.gross),
      fullYearEmployerCost: round(summary.bridge.fullYear.totalEmploymentCost),
    },
    statutory: {
      incomeTax: round(byCategory.income_tax ?? 0),
      socialSecurityEmployee: round(byCategory.social_security_employee ?? 0),
      employerOnCost: round(summary.statutory.employerOnCostTotal),
    },
    categories: moneyCategories,
    departments: summary.departments
      .slice(0, 8)
      .map((d) => ({ department: d.department, total: round(d.actual) })),
    mix: {
      fixed: round(summary.mix.fixed),
      variable: round(summary.mix.variable),
      overtime: round(byCategory.overtime ?? 0),
    },
    yoy: {
      changePctGross: summary.yoy.changePct.gross,
      changePctNet: summary.yoy.changePct.net,
      likeForLikePeriods: summary.yoy.available ? summary.yoy.comparablePeriods : null,
    },
  };
}

function insightCacheKey(payload: AnnualInsightPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const PROMPT_VERSION = "v1";

/** Company-level AI switch (step 41). Defaults to on when never set. */
async function isAiEnabledForCompany(ctx: MemberContext): Promise<boolean> {
  const company = await ctx.db.query.companies.findFirst({
    where: eq(companies.id, ctx.companyId),
    columns: { settings: true },
  });
  const settings = (company?.settings ?? {}) as { aiEnabled?: boolean };
  return settings.aiEnabled !== false;
}

async function writeAudit(
  ctx: MemberContext,
  entry: { entity: string; entityKey: string; oldValue: unknown; newValue: unknown },
) {
  await ctx.db.insert(annualAuditLog).values({
    companyId: ctx.companyId,
    userId: ctx.currentUser.id,
    entity: entry.entity,
    entityKey: entry.entityKey,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
  });
}

export const annualRouter = router({
  // `getYears` was removed in step 21 (finding C17): it was never called, because
  // the annual page is a server component that queries the years itself.

  getSummary: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { summary } = await loadSummaryContext(ctx, input);
      return summary;
    }),

  /**
   * Step 24 (finding C13): amounts now come from the same valid-periods CTE as
   * the dashboard, scoped to the selected year and currency. v1 summed every
   * ready upload of the latest year in every currency, so a company with two
   * currencies saw inflated totals (38,000 where 28,000 was correct).
   */
  listComponentCategories: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100).optional(),
      currency: z.string().length(3).optional(),
      periodType: PeriodTypeSchema.optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { companyId } = ctx;

      const yearRes = await ctx.db.execute(sql`
        SELECT MAX(EXTRACT(YEAR FROM period_end)::int) AS year
        FROM payroll_periods
        WHERE company_id = ${companyId} AND status = 'ready'
      `);
      const latestYear =
        parseRows(z.object({ year: IntLike.nullable() }), yearRes.rows, "latest year")[0]?.year ?? null;

      const year = input?.year ?? latestYear;
      if (year === null) {
        return { latestYear: null, year: null, currency: null, categories: [] };
      }

      const [setupRes, savedRows, companyRows] = await ctx.db.batch([
        ctx.db.execute(sql`
          SELECT period_type   AS "periodType",
                 currency_code AS "currencyCode",
                 period_end    AS "periodEnd"
          FROM payroll_periods
          WHERE company_id = ${companyId} AND status = 'ready'
            AND period_end >= ${`${year}-01-01`}::date
            AND period_end < ${`${year + 2}-01-01`}::date
        `),
        ctx.db.select().from(componentCategories).where(eq(componentCategories.companyId, companyId)),
        ctx.db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)),
      ]);

      const settings = (companyRows[0]?.settings ?? {}) as { fiscalStartMonth?: number };
      const fiscalStartMonth = normaliseFiscalStartMonth(settings.fiscalStartMonth);

      const setups = parseRows(SetupRowSchema, setupRes.rows, "setup").filter(
        (r) => fiscalYearOf(r.periodEnd, fiscalStartMonth) === year,
      );
      const periodType = input?.periodType ?? (setups[0]?.periodType as PeriodType | undefined) ?? "monthly";
      const currency = input?.currency?.toUpperCase() ?? setups[0]?.currencyCode ?? "USD";

      const cte = validPeriodsCte(companyId, periodType, currency, year, fiscalStartMonth);
      const [keysRes, amountRes] = await ctx.db.batch([
        ctx.db.execute(sql`
          WITH ${cte}
          SELECT DISTINCT x.key
          FROM snaps r
          CROSS JOIN LATERAL jsonb_each(r.components) x
        `),
        ctx.db.execute(sql`
          WITH ${cte}
          SELECT x.key, SUM((x.value #>> '{}')::numeric) AS total
          FROM snaps r
          CROSS JOIN LATERAL jsonb_each(r.components) x
          WHERE ${numericComponentFilter}
          GROUP BY x.key
        `),
      ]);

      const saved = new Map(savedRows.map((s) => [s.componentKey, s]));
      const keys = parseRows(z.object({ key: z.string() }), keysRes.rows, "component key").map((r) => r.key);
      const amounts = new Map(
        parseRows(z.object({ key: z.string(), total: Numeric }), amountRes.rows, "component amount").map(
          (r) => [r.key, r.total] as const,
        ),
      );

      return {
        latestYear,
        year,
        currency,
        categories: keys.map((key) => {
          const savedRow = saved.get(key);
          const auto = classifyComponentWithReason(key);
          return {
            componentKey: key,
            category: (savedRow?.category as Category | undefined) ?? auto.category,
            source: savedRow ? ("saved" as const) : ("auto" as const),
            // The rule that fired, so the category manager can explain itself
            // instead of leaving the user to guess (step 40).
            autoRule: auto.rule,
            autoCategory: auto.category,
            amountToDate: amounts.get(key) ?? 0,
          };
        }),
      };
    }),

  /**
   * Step 24 (finding C14): one bulk upsert.
   *
   * v1 exposed a single-key `setComponentCategory` that read-then-inserted (a
   * race, despite the unique constraint being available for an upsert) and never
   * moved `updated_at`. The dialog called it once per key, so categorising 20
   * components sent 20 sequential requests.
   */
  setComponentCategories: editorProcedure
    .input(z.object({
      entries: z.array(z.object({
        componentKey: z.string().min(1).max(200),
        category: CategoryEnum,
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = ctx;

      const existing = await ctx.db.select()
        .from(componentCategories)
        .where(eq(componentCategories.companyId, companyId));
      const before = new Map(existing.map((e) => [e.componentKey, e.category]));

      const now = new Date();
      await ctx.db.insert(componentCategories)
        .values(input.entries.map((e) => ({
          companyId,
          componentKey: e.componentKey,
          category: e.category,
          updatedBy: ctx.currentUser.id,
          updatedAt: now,
        })))
        .onConflictDoUpdate({
          target: [componentCategories.companyId, componentCategories.componentKey],
          set: {
            category: sql`excluded.category`,
            updatedBy: sql`excluded.updated_by`,
            updatedAt: now,
          },
        });

      const changed = input.entries.filter((e) => before.get(e.componentKey) !== e.category);
      if (changed.length > 0) {
        await ctx.db.insert(annualAuditLog).values(
          changed.map((e) => ({
            companyId,
            userId: ctx.currentUser.id,
            entity: "component_category",
            entityKey: e.componentKey,
            oldValue: { category: before.get(e.componentKey) ?? null },
            newValue: { category: e.category },
          })),
        );
      }

      return { updated: input.entries.length, changed: changed.length };
    }),

  /** Drop a saved override so the component falls back to the classifier. */
  resetComponentCategory: editorProcedure
    .input(z.object({ componentKey: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db.delete(componentCategories)
        .where(and(
          eq(componentCategories.companyId, ctx.companyId),
          eq(componentCategories.componentKey, input.componentKey),
        ))
        .returning();

      if (removed) {
        await writeAudit(ctx, {
          entity: "component_category",
          entityKey: input.componentKey,
          oldValue: { category: removed.category },
          newValue: null,
        });
      }

      return {
        componentKey: input.componentKey,
        category: classifyComponentWithReason(input.componentKey).category,
      };
    }),

  getBudget: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      currency: CurrencyCodeSchema,
    }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.annualBudgets.findFirst({
        where: and(
          eq(annualBudgets.companyId, ctx.companyId),
          eq(annualBudgets.year, input.year),
          eq(annualBudgets.currency, input.currency),
        ),
      });
      if (!row) return { amount: null, basis: "gross" as const, phasing: [] };

      const phasing = await ctx.db.select()
        .from(annualBudgetPhasing)
        .where(eq(annualBudgetPhasing.budgetId, row.id));

      return {
        amount: Number(row.amount),
        basis: row.basis as z.infer<typeof BudgetBasisSchema>,
        phasing: phasing
          .map((p) => ({ month: p.month, amount: Number(p.amount) }))
          .sort((a, b) => a.month - b.month),
      };
    }),

  /**
   * Step 25 (findings C15, B4): the currency is upper-cased and ISO-checked, the
   * amount column is wide enough for an LBP-scale budget, and the budget carries
   * a basis plus optional monthly phasing.
   */
  setBudget: editorProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      currency: CurrencyCodeSchema,
      // 1e18 stays inside numeric(20,2); an LBP annual payroll is ~1.2e12.
      amount: z.number().finite().min(0).max(1e18).nullable(),
      basis: BudgetBasisSchema.default("gross"),
      phasing: z.array(z.object({
        month: z.number().int().min(1).max(12),
        amount: z.number().finite().min(0).max(1e18),
      })).max(12).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = ctx;
      const where = and(
        eq(annualBudgets.companyId, companyId),
        eq(annualBudgets.year, input.year),
        eq(annualBudgets.currency, input.currency),
      );

      const previous = await ctx.db.query.annualBudgets.findFirst({ where });

      if (input.amount === null) {
        await ctx.db.delete(annualBudgets).where(where);
        if (previous) {
          await writeAudit(ctx, {
            entity: "annual_budget",
            entityKey: `${input.year}:${input.currency}`,
            oldValue: { amount: Number(previous.amount), basis: previous.basis },
            newValue: null,
          });
        }
        return { amount: null, basis: input.basis, phasing: [] };
      }

      const amount = input.amount.toFixed(2);
      const [saved] = await ctx.db.insert(annualBudgets)
        .values({ companyId, year: input.year, currency: input.currency, amount, basis: input.basis })
        .onConflictDoUpdate({
          target: [annualBudgets.companyId, annualBudgets.year, annualBudgets.currency],
          set: { amount, basis: input.basis, updatedAt: new Date() },
        })
        .returning();
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.phasing) {
        await ctx.db.delete(annualBudgetPhasing).where(eq(annualBudgetPhasing.budgetId, saved.id));
        if (input.phasing.length > 0) {
          await ctx.db.insert(annualBudgetPhasing).values(
            input.phasing.map((p) => ({
              budgetId: saved.id,
              month: p.month,
              amount: p.amount.toFixed(2),
            })),
          );
        }
      }

      await writeAudit(ctx, {
        entity: "annual_budget",
        entityKey: `${input.year}:${input.currency}`,
        oldValue: previous ? { amount: Number(previous.amount), basis: previous.basis } : null,
        newValue: { amount: input.amount, basis: input.basis },
      });

      return { amount: input.amount, basis: input.basis, phasing: input.phasing ?? [] };
    }),

  /**
   * Step 23 (finding A3): a cache READ only.
   *
   * This was a query that called the model and wrote the cache. React Query
   * refetches queries on mount and on window focus, so simply alt-tabbing back to
   * the dashboard spent tokens. It is now side-effect free; generation is the
   * mutation below.
   */
  /** Step 42: the workbook, built from the same summary the page renders. */
  exportWorkbook: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { summary, companyName } = await loadSummaryContext(ctx, input);
      const base64 = buildAnnualWorkbook(summary, {
        companyName: companyName ?? "Company",
        generatedAt: new Date(),
        generatedBy: ctx.currentUser.id,
      });
      const safeName = (companyName ?? "company").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
      return {
        filename: `${safeName}-annual-${summary.year}-${summary.currency}.xlsx`,
        base64,
        sheets: annualWorkbookSheets(summary),
      };
    }),

  /**
   * Step 44: the periods behind one bar or department.
   *
   * Available to any member — these are the same aggregates already on the page,
   * just filtered. Employee-level rows are a separate, admin-only procedure.
   */
  drillDown: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
      department: z.string().max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { summary } = await loadSummaryContext(ctx, input);

      if (!input.department) {
        return {
          scope: "year" as const,
          department: null,
          periods: summary.periods,
          total: summary.bridge.fullYear.totalEmploymentCost,
        };
      }

      const dept = summary.departments.find((d) => d.department === input.department);
      if (!dept) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });

      return {
        scope: "department" as const,
        department: dept,
        periods: summary.periods,
        total: dept.forecast,
      };
    }),

  /**
   * Step 44: employee rows, admins only.
   *
   * This is the only place the annual feature exposes individual pay, so it is
   * gated on the admin role rather than the editor roles — a manager can change
   * company settings without being able to read every salary.
   */
  drillDownEmployees: adminProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema,
      currency: CurrencyCodeSchema,
      department: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const cte = validPeriodsCte(ctx.companyId, input.periodType, input.currency, input.year);
      const res = await ctx.db.execute(sql`
        WITH ${cte}
        SELECT r.employee_external_id AS "employeeExternalId",
               MAX(r.employee_name)   AS "employeeName",
               COALESCE(r.department, 'Unassigned') AS department,
               COUNT(*)::int          AS "periodCount",
               COALESCE(SUM(r.gross_salary), 0)::numeric AS gross,
               COALESCE(SUM(r.net_salary), 0)::numeric   AS net
        FROM valid_periods p
        JOIN snaps r ON r.payroll_period_id = p.id
        ${input.department ? sql`WHERE COALESCE(r.department, 'Unassigned') = ${input.department}` : sql``}
        GROUP BY r.employee_external_id, COALESCE(r.department, 'Unassigned')
        ORDER BY 5 DESC
        LIMIT ${input.limit}
      `);

      return {
        employees: parseRows(
          z.object({
            employeeExternalId: z.string(),
            employeeName: z.string().nullable(),
            department: z.string(),
            periodCount: IntLike,
            gross: Numeric,
            net: Numeric,
          }),
          res.rows,
          "employee drill-down",
        ),
      };
    }),

  /**
   * Step 46: who changed which category or budget, and when.
   *
   * Company-wide settings are editable by any admin or manager, so a change that
   * moves money between buckets has to be attributable after the fact.
   */
  auditTrail: memberProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      entity: z.enum(["component_category", "annual_budget"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const res = await ctx.db.execute(sql`
        SELECT a.id,
               a.entity,
               a.entity_key  AS "entityKey",
               a.old_value   AS "oldValue",
               a.new_value   AS "newValue",
               a.created_at  AS "createdAt",
               u.name        AS "userName",
               u.email       AS "userEmail"
        FROM annual_audit_log a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.company_id = ${ctx.companyId}
          ${input.entity ? sql`AND a.entity = ${input.entity}` : sql``}
        ORDER BY a.created_at DESC
        LIMIT ${input.limit}
      `);

      return {
        entries: parseRows(
          z.object({
            id: z.string(),
            entity: z.string(),
            entityKey: z.string(),
            oldValue: z.unknown().nullable(),
            newValue: z.unknown().nullable(),
            createdAt: z.union([z.string(), z.date()]).transform(toIsoTimestamp),
            userName: z.string().nullable(),
            userEmail: z.string().nullable(),
          }),
          res.rows,
          "audit entry",
        ),
      };
    }),

  /** Step 45: the company's fiscal-year start month. */
  setFiscalStartMonth: editorProcedure
    .input(z.object({ month: z.number().int().min(1).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { settings: true },
      });
      const settings = (company?.settings ?? {}) as Record<string, unknown>;
      await ctx.db.update(companies)
        .set({ settings: { ...settings, fiscalStartMonth: input.month }, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));
      // The memo keys on inputs, not on settings, so it must be dropped when a
      // setting that changes every boundary is edited.
      summaryMemo.clear();
      return { month: input.month };
    }),

  /**
   * Step 41: a company-level switch that turns AI off entirely.
   *
   * Stored on `companies.settings`, so an organization that does not want its
   * payroll aggregates sent to a model can say so once rather than relying on
   * nobody pressing Generate.
   */
  setAiEnabled: editorProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { settings: true },
      });
      const settings = (company?.settings ?? {}) as Record<string, unknown>;
      await ctx.db.update(companies)
        .set({ settings: { ...settings, aiEnabled: input.enabled }, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));
      return { enabled: input.enabled };
    }),

  getInsights: memberProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { summary, companyName } = await loadSummaryContext(ctx, input);
      const aiEnabled = await isAiEnabledForCompany(ctx);
      const payload = buildInsightPayload(summary, companyName);
      const dataHash = insightCacheKey(payload);
      const method = input.forecastMethod ?? summary.forecastMethod;

      const cached = await ctx.db.query.annualInsightCaches.findFirst({
        where: and(
          eq(annualInsightCaches.companyId, ctx.companyId),
          eq(annualInsightCaches.forecastMethod, method),
          eq(annualInsightCaches.dataHash, dataHash),
        ),
        orderBy: [desc(annualInsightCaches.generatedAt)],
      });

      if (!cached) {
        return {
          bullets: [] as string[],
          generatedAt: null,
          model: null,
          source: null,
          promptVersion: null,
          stale: true,
          canGenerate: isAiAvailable && aiEnabled,
          aiEnabled,
        };
      }

      return {
        bullets: Array.isArray(cached.bullets) ? (cached.bullets as string[]) : [],
        generatedAt: cached.generatedAt,
        model: cached.model || null,
        // The UI must not label rule-based text with a model name (finding U7).
        source: cached.source as "ai" | "rules",
        promptVersion: cached.promptVersion,
        stale: false,
        canGenerate: isAiAvailable && aiEnabled,
        aiEnabled,
      };
    }),

  /**
   * Step 23: generation is an editor-only, rate-limited mutation.
   *
   * A failure is never cached, so a transient model error cannot be served for an
   * hour as though it were an answer (finding A2).
   */
  generateInsights: editorProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // The company-level switch is checked server-side, not only hidden in the
      // UI (step 41).
      const aiEnabled = await isAiEnabledForCompany(ctx);
      if (!aiEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "AI is switched off for this company.",
        });
      }

      const limit = await limitInsightGeneration(ctx.companyId);
      if (!limit.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: limit.reset
            ? `Insight generation is limited to 5 per hour. Try again after ${new Date(limit.reset).toISOString()}.`
            : "Insight generation is limited to 5 per hour.",
        });
      }

      const { summary, companyName } = await loadSummaryContext(ctx, input);
      const payload = buildInsightPayload(summary, companyName);
      const dataHash = insightCacheKey(payload);
      const method = input.forecastMethod ?? summary.forecastMethod;

      const result = await generateAnnualInsights(payload);
      const source = result.source;
      const bullets = result.bullets;

      // Only a real model answer is cached under a model name. A rule-based
      // fallback is cached as such, so the UI can label it honestly.
      await ctx.db.insert(annualInsightCaches)
        .values({
          companyId: ctx.companyId,
          year: input.year,
          forecastMethod: method,
          dataHash,
          bullets,
          model: source === "ai" ? DEFAULT_MODEL : "",
          source,
          promptVersion: PROMPT_VERSION,
        })
        .onConflictDoUpdate({
          target: [annualInsightCaches.companyId, annualInsightCaches.forecastMethod, annualInsightCaches.dataHash],
          set: {
            bullets,
            model: source === "ai" ? DEFAULT_MODEL : "",
            source,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date(),
          },
        });

      return {
        bullets,
        generatedAt: new Date(),
        model: source === "ai" ? DEFAULT_MODEL : null,
        source,
        promptVersion: PROMPT_VERSION,
        stale: false,
        canGenerate: isAiAvailable && aiEnabled,
        aiEnabled,
        remaining: limit.remaining,
      };
    }),
});
