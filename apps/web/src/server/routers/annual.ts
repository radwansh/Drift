import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  users,
  componentCategories,
  companies,
  annualBudgets,
  annualInsightCaches,
} from "@saas/db";
import {
  computeSummary,
  classifyComponent,
  type AnnualPeriodInput,
  type AnnualSummary,
  type Category,
  type ForecastMethod,
  type PeriodType,
  type ComponentAggregate,
} from "@saas/payroll-core";
import { generateAnnualInsights, DEFAULT_MODEL, type AnnualInsightPayload } from "@saas/ai";
import { protectedProcedure, router, type ProtectedContext } from "../trpc";

const PeriodTypeSchema = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);
const ForecastMethodSchema = z.enum(["run_rate", "average", "prior_year"]);
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

interface PeriodRow {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  createdAt: string | Date;
}

interface HeadcountRow {
  id: string;
  headcount: number;
  gross: string | number;
  net: string | number;
}

interface ComponentRow {
  id: string;
  key: string;
  total: string | number;
  negRows: number;
  posRows: number;
}

interface EmployeeRow {
  id: string;
  employeeExternalId: string;
}

interface DepartmentTotalsRow {
  department: string;
  key: string;
  total: string | number;
}

interface DepartmentHeadcountRow {
  department: string;
  periodEnd: string;
  headcount: number;
}

interface SetupRow {
  periodType: string;
  currencyCode: string;
}

const numericComponentFilter = sql`(x.value #>> '{}') ~ '^-?[0-9]+(\\.[0-9]+)?$'`;

function validPeriodsCte(companyId: string, periodType: string, currency: string, year: number) {
  return sql`
    valid_periods AS (
      SELECT DISTINCT ON (period_type, period_start, period_end) *
      FROM payroll_periods
      WHERE company_id = ${companyId} AND status = 'ready'
        AND period_type = ${periodType} AND currency_code = ${currency}
        AND period_end >= ${`${year}-01-01`}::date AND period_end < ${`${year + 1}-01-01`}::date
      ORDER BY period_type, period_start, period_end, created_at DESC
    ),
    snaps AS (
      SELECT DISTINCT ON (payroll_period_id, employee_external_id) *
      FROM employee_snapshots
      WHERE payroll_period_id IN (SELECT id FROM valid_periods)
      ORDER BY payroll_period_id, employee_external_id, created_at DESC
    )`;
}

async function getCompany(ctx: ProtectedContext) {
  const currentUser = await ctx.db.query.users.findFirst({
    where: eq(users.clerkUserId, ctx.userId),
  });
  if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });
  return { companyId: currentUser.companyId };
}

async function loadYearQueries(ctx: ProtectedContext, opts: { companyId: string; periodType: string; currency: string; year: number }) {
  const { companyId, periodType, currency, year } = opts;
  const cte = validPeriodsCte(companyId, periodType, currency, year);

  const [periodRes, headcountRes, componentRes, employeeRes] = await Promise.all([
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT id, period_type, period_start, period_end, currency_code, created_at
      FROM valid_periods
      ORDER BY period_end
    `),
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT p.id,
             COUNT(r.id)::int AS headcount,
             COALESCE(SUM(r.gross_salary), 0)::numeric AS gross,
             COALESCE(SUM(r.net_salary), 0)::numeric AS net
      FROM valid_periods p
      LEFT JOIN snaps r ON r.payroll_period_id = p.id
      GROUP BY p.id
    `),
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT p.id, x.key,
             COALESCE(SUM((x.value #>> '{}')::numeric), 0) AS total,
             COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric < 0)::int AS neg_rows,
             COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric > 0)::int AS pos_rows
      FROM valid_periods p
      JOIN snaps r ON r.payroll_period_id = p.id
      CROSS JOIN LATERAL jsonb_each(r.components) x
      WHERE ${numericComponentFilter}
      GROUP BY p.id, x.key
    `),
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT p.id, r.employee_external_id
      FROM valid_periods p
      LEFT JOIN snaps r ON r.payroll_period_id = p.id
      WHERE r.id IS NOT NULL
    `),
  ]);

  const periodRows = periodRes.rows as unknown as PeriodRow[];
  const headcountMap = new Map<string, HeadcountRow>((headcountRes.rows as unknown as HeadcountRow[]).map((r) => [r.id, r]));
  const componentRows = componentRes.rows as unknown as ComponentRow[];
  const employeeRows = employeeRes.rows as unknown as EmployeeRow[];

  const componentsByPeriod = new Map<string, ComponentAggregate[]>();
  for (const c of componentRows) {
    const list = componentsByPeriod.get(c.id) ?? [];
    list.push({ key: c.key, total: Number(c.total), negRows: c.negRows, posRows: c.posRows });
    componentsByPeriod.set(c.id, list);
  }

  const employeeIdsByPeriod = new Map<string, string[]>();
  for (const r of employeeRows) {
    const list = employeeIdsByPeriod.get(r.id) ?? [];
    list.push(r.employeeExternalId);
    employeeIdsByPeriod.set(r.id, list);
  }

  const periods: AnnualPeriodInput[] = periodRows.map((p) => {
    const hc = headcountMap.get(p.id);
    return {
      id: p.id,
      periodType: p.periodType as PeriodType,
      currency: p.currencyCode,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : new Date(p.createdAt).toISOString(),
      headcount: hc ? hc.headcount : 0,
      gross: hc ? Number(hc.gross) : 0,
      net: hc ? Number(hc.net) : 0,
      components: componentsByPeriod.get(p.id) ?? [],
      employeeIds: employeeIdsByPeriod.get(p.id) ?? [],
    };
  });

  return { periods, periodRows };
}

async function loadDepartments(ctx: ProtectedContext, opts: { companyId: string; periodType: string; currency: string; year: number }) {
  const { companyId, periodType, currency, year } = opts;
  const cte = validPeriodsCte(companyId, periodType, currency, year);

  const [totalRes, headcountRes] = await Promise.all([
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT COALESCE(r.department, 'Unassigned') AS department, x.key,
             COALESCE(SUM((x.value #>> '{}')::numeric), 0) AS total
      FROM valid_periods p
      JOIN snaps r ON r.payroll_period_id = p.id
      CROSS JOIN LATERAL jsonb_each(r.components) x
      WHERE ${numericComponentFilter}
      GROUP BY 1, 2
    `),
    ctx.db.execute(sql`
      WITH ${cte}
      SELECT COALESCE(r.department, 'Unassigned') AS department, p.period_end,
             COUNT(DISTINCT r.employee_external_id)::int AS headcount
      FROM valid_periods p
      JOIN snaps r ON r.payroll_period_id = p.id
      GROUP BY 1, 2
    `),
  ]);

  const totals = totalRes.rows as unknown as DepartmentTotalsRow[];
  const headcounts = headcountRes.rows as unknown as DepartmentHeadcountRow[];
  const periodEnds = [...new Set(headcounts.map((h) => h.periodEnd))].sort();

  const headcountsByDepartment = new Map<string, Map<string, number>>();
  for (const h of headcounts) {
    const dept = headcountsByDepartment.get(h.department) ?? new Map<string, number>();
    dept.set(h.periodEnd, h.headcount);
    headcountsByDepartment.set(h.department, dept);
  }

  const componentsByDepartment = new Map<string, Map<string, number>>();
  for (const t of totals) {
    const map = componentsByDepartment.get(t.department) ?? new Map<string, number>();
    map.set(t.key, Number(t.total));
    componentsByDepartment.set(t.department, map);
  }

  const departments = [...new Set([...componentsByDepartment.keys(), ...headcountsByDepartment.keys()])].map((department) => {
    const componentMap = componentsByDepartment.get(department) ?? new Map<string, number>();
    const deptHeadcounts = headcountsByDepartment.get(department) ?? new Map<string, number>();
    return {
      department,
      components: [...componentMap.entries()].map(([key, total]) => ({ key, total })),
      headcounts: periodEnds.map((end) => deptHeadcounts.get(end) ?? 0),
    };
  });

  return departments;
}

interface SummaryContext {
  summary: AnnualSummary;
  periodType: PeriodType;
  currency: string;
  allPeriodTypes: PeriodType[];
  allCurrencies: string[];
}

async function loadSummaryContext(
  ctx: ProtectedContext,
  input: { year: number; periodType?: PeriodType; currency?: string; forecastMethod?: ForecastMethod },
): Promise<SummaryContext> {
  const { companyId } = await getCompany(ctx);

  const setupRes = await ctx.db.execute(sql`
    SELECT period_type, currency_code
    FROM payroll_periods
    WHERE company_id = ${companyId} AND status = 'ready'
      AND period_end >= ${`${input.year}-01-01`}::date AND period_end < ${`${input.year + 1}-01-01`}::date
    GROUP BY 1, 2
    ORDER BY COUNT(*) DESC
  `);
  const setups = setupRes.rows as unknown as SetupRow[];
  const allPeriodTypes = [...new Set(setups.map((s) => s.periodType))] as PeriodType[];
  const allCurrencies = [...new Set(setups.map((s) => s.currencyCode))];

  const periodType = (input.periodType ?? allPeriodTypes[0] ?? "monthly") as PeriodType;
  const currency = input.currency ?? allCurrencies[0] ?? "USD";

  const { periods } = await loadYearQueries(ctx, { companyId, periodType, currency, year: input.year });
  const departments = await loadDepartments(ctx, { companyId, periodType, currency, year: input.year });

  let previousYear: { periods: AnnualPeriodInput[] } | undefined;
  let previousYearLastEmployeeIds: string[] | undefined;
  if (periods.length > 0) {
    const prev = await loadYearQueries(ctx, { companyId, periodType, currency, year: input.year - 1 });
    previousYear = prev.periods.length > 0 ? { periods: prev.periods } : undefined;
    const lastEnd = prev.periodRows.length > 0 ? prev.periodRows[prev.periodRows.length - 1]!.periodEnd : null;
    const lastPeriodIds = lastEnd
      ? prev.periods.find((p) => p.periodEnd === lastEnd)?.employeeIds ?? []
      : [];
    previousYearLastEmployeeIds = lastPeriodIds.length > 0 ? lastPeriodIds : undefined;
  }

  const savedRes = await ctx.db.select().from(componentCategories)
    .where(eq(componentCategories.companyId, companyId));
  const savedCategories: Record<string, Category> = {};
  for (const s of savedRes) savedCategories[s.componentKey] = s.category as Category;

  const summary = computeSummary({
    year: input.year,
    periodType,
    currency,
    allPeriodTypes,
    allCurrencies,
    periods,
    forecastMethod: input.forecastMethod as ForecastMethod | undefined,
    previousYear,
    previousYearLastEmployeeIds,
    savedCategories,
    departments,
  });

  return { summary, periodType, currency, allPeriodTypes, allCurrencies };
}

function buildInsightPayload(summary: AnnualSummary, companyName?: string): AnnualInsightPayload {
  const round = (v: number) => Math.round(v * 100) / 100;
  const byCategory = summary.categories.byCategory;
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
      method: summary.forecastMethod,
      fullYearNet: round(summary.bridge.fullYear.net),
      fullYearGross: round(summary.bridge.fullYear.gross),
      fullYearEmployerCost: round(summary.bridge.fullYear.totalEmploymentCost),
    },
    statutory: {
      incomeTax: round(byCategory.income_tax ?? 0),
      socialSecurityEmployee: round(byCategory.social_security_employee ?? 0),
      employerOnCost: round(summary.statutory.employerOnCostTotal),
    },
    categories: Object.entries(byCategory)
      .slice(0, 10)
      .map(([category, total]) => ({ category, total: round(total ?? 0) })),
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

export const annualRouter = router({
  getYears: protectedProcedure.query(async ({ ctx }) => {
    const { companyId } = await getCompany(ctx);
    const res = await ctx.db.execute(sql`
      SELECT DISTINCT EXTRACT(YEAR FROM period_end)::int AS year
      FROM payroll_periods
      WHERE company_id = ${companyId} AND status = 'ready'
      ORDER BY year DESC
    `);
    return { years: (res.rows as unknown as { year: number }[]).map((r) => r.year) };
  }),

  getSummary: protectedProcedure
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

  listComponentCategories: protectedProcedure.query(async ({ ctx }) => {
    const { companyId } = await getCompany(ctx);

    const [keysRes, yearRes, savedRes] = await Promise.all([
      ctx.db.execute(sql`
        SELECT DISTINCT x.key
        FROM payroll_periods p
        JOIN employee_snapshots r ON r.payroll_period_id = p.id
        CROSS JOIN LATERAL jsonb_each(r.components) x
        WHERE p.company_id = ${companyId} AND p.status = 'ready'
      `),
      ctx.db.execute(sql`
        SELECT MAX(EXTRACT(YEAR FROM period_end)::int) AS year
        FROM payroll_periods
        WHERE company_id = ${companyId} AND status = 'ready'
      `),
      ctx.db.select().from(componentCategories).where(eq(componentCategories.companyId, companyId)),
    ]);

    const latestYear = (yearRes.rows as unknown as { year: number | null }[])[0]?.year ?? null;
    const saved = new Map(savedRes.map((s) => [s.componentKey, s.category as Category]));
    const keys = (keysRes.rows as unknown as { key: string }[]).map((r) => r.key);

    let amounts = new Map<string, number>();
    if (latestYear !== null) {
      const amountRes = await ctx.db.execute(sql`
        SELECT x.key, SUM((x.value #>> '{}')::numeric) AS total
        FROM payroll_periods p
        JOIN employee_snapshots r ON r.payroll_period_id = p.id
        CROSS JOIN LATERAL jsonb_each(r.components) x
        WHERE p.company_id = ${companyId} AND p.status = 'ready'
          AND EXTRACT(YEAR FROM p.period_end) = ${latestYear}
          AND (x.value #>> '{}') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        GROUP BY x.key
      `);
      amounts = new Map((amountRes.rows as unknown as { key: string; total: string | number }[]).map((r) => [r.key, Number(r.total)]));
    }

    return {
      latestYear,
      categories: keys.map((key) => {
        const category = saved.get(key) ?? classifyComponent(key);
        return {
          componentKey: key,
          category,
          source: saved.has(key) ? "saved" : "auto",
          amountToDate: amounts.get(key) ?? 0,
        };
      }),
    };
  }),

  setComponentCategory: protectedProcedure
    .input(z.object({
      componentKey: z.string().min(1).max(200),
      category: CategoryEnum,
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await getCompany(ctx);

      const existing = await ctx.db.query.componentCategories.findFirst({
        where: and(
          eq(componentCategories.companyId, companyId),
          eq(componentCategories.componentKey, input.componentKey),
        ),
      });

      if (existing) {
        const [updated] = await ctx.db.update(componentCategories)
          .set({ category: input.category })
          .where(eq(componentCategories.id, existing.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return { componentKey: updated.componentKey, category: updated.category };
      }

      const [created] = await ctx.db.insert(componentCategories).values({
        companyId,
        componentKey: input.componentKey,
        category: input.category,
      }).returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return { componentKey: created.componentKey, category: created.category };
    }),

  getBudget: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      currency: z.string().length(3),
    }))
    .query(async ({ ctx, input }) => {
      const { companyId } = await getCompany(ctx);
      const row = await ctx.db.query.annualBudgets.findFirst({
        where: and(
          eq(annualBudgets.companyId, companyId),
          eq(annualBudgets.year, input.year),
          eq(annualBudgets.currency, input.currency),
        ),
      });
      return { amount: row ? Number(row.amount) : null };
    }),

  setBudget: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      currency: z.string().length(3),
      amount: z.number().finite().min(0).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { companyId } = await getCompany(ctx);

      if (input.amount === null) {
        await ctx.db.delete(annualBudgets).where(and(
          eq(annualBudgets.companyId, companyId),
          eq(annualBudgets.year, input.year),
          eq(annualBudgets.currency, input.currency),
        ));
        return { amount: null };
      }

      const amount = input.amount.toFixed(2);
      await ctx.db.insert(annualBudgets)
        .values({ companyId, year: input.year, currency: input.currency, amount })
        .onConflictDoUpdate({
          target: [annualBudgets.companyId, annualBudgets.year, annualBudgets.currency],
          set: { amount, updatedAt: new Date() },
        });
      return { amount: input.amount };
    }),

  getInsights: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      periodType: PeriodTypeSchema.optional(),
      currency: z.string().length(3).optional(),
      forecastMethod: ForecastMethodSchema.optional(),
      force: z.boolean().optional(),
      runId: z.number().int().min(0).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { companyId } = await getCompany(ctx);
      const { summary } = await loadSummaryContext(ctx, input);

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });
      const payload = buildInsightPayload(summary, company?.name);
      const dataHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const method = input.forecastMethod ?? summary.forecastMethod;

      if (!input.force) {
        const cached = await ctx.db.query.annualInsightCaches.findFirst({
          where: and(
            eq(annualInsightCaches.companyId, companyId),
            eq(annualInsightCaches.forecastMethod, method),
            eq(annualInsightCaches.dataHash, dataHash),
          ),
        });
        if (cached) {
          return {
            bullets: (cached.bullets as unknown as string[]) ?? [],
            generatedAt: cached.generatedAt,
            model: cached.model || DEFAULT_MODEL,
            fromCache: true,
          };
        }
      }

      const bullets = await generateAnnualInsights(payload);

      await ctx.db.insert(annualInsightCaches)
        .values({ companyId, year: input.year, forecastMethod: method, dataHash, bullets, model: DEFAULT_MODEL })
        .onConflictDoUpdate({
          target: [annualInsightCaches.companyId, annualInsightCaches.forecastMethod, annualInsightCaches.dataHash],
          set: { bullets, model: DEFAULT_MODEL, generatedAt: new Date() },
        });

      return {
        bullets,
        generatedAt: new Date(),
        model: DEFAULT_MODEL,
        fromCache: false,
      };
    }),
});