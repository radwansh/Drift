import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, like, sql } from "drizzle-orm";
import { employeeSnapshots, payrollPeriods } from "@saas/db";
import { adminProcedure, router } from "../trpc";

/**
 * Employee snapshots are individual pay records, so every procedure here is
 * `adminProcedure`, matching the rule the annual drill-downs already follow:
 * a manager who may edit company settings should not automatically be able to
 * read every salary.
 *
 * All three were `protectedProcedure` with no tenant filter at all, so any
 * signed-in user of any company could pass any period or snapshot UUID and read
 * back names, components, gross and net. CLAUDE.md is explicit that a missing
 * `companyId` is a cross-tenant leak rather than a bug.
 *
 * `employee_snapshots` carries no `companyId` of its own — it reaches tenancy
 * only through `payroll_periods` — so scoping is an ownership check on the
 * period, or a join to it, never a filter on the snapshot table.
 *
 * A row belonging to another company answers NOT_FOUND rather than FORBIDDEN,
 * so the error does not confirm that the id exists.
 */
export const employeesRouter = router({
  listByPeriod: adminProcedure
    .input(z.object({
      payrollPeriodId: z.string().uuid(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // One ownership check, then the period id is known to be in-tenant and
      // the queries below need no further filter.
      const period = await ctx.db.query.payrollPeriods.findFirst({
        where: and(
          eq(payrollPeriods.id, input.payrollPeriodId),
          eq(payrollPeriods.companyId, ctx.companyId),
        ),
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });

      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(employeeSnapshots)
          .where(eq(employeeSnapshots.payrollPeriodId, input.payrollPeriodId))
          .orderBy(employeeSnapshots.employeeName)
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(employeeSnapshots)
          .where(eq(employeeSnapshots.payrollPeriodId, input.payrollPeriodId)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // The input names a snapshot rather than a period, so tenancy comes from
      // joining to the period that owns it.
      const rows = await ctx.db
        .select({ snapshot: employeeSnapshots })
        .from(employeeSnapshots)
        .innerJoin(payrollPeriods, eq(employeeSnapshots.payrollPeriodId, payrollPeriods.id))
        .where(and(
          eq(employeeSnapshots.id, input.id),
          eq(payrollPeriods.companyId, ctx.companyId),
        ))
        .limit(1);

      const snapshot = rows[0]?.snapshot;
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Employee snapshot not found" });
      return snapshot;
    }),

  search: adminProcedure
    .input(z.object({
      payrollPeriodId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const period = await ctx.db.query.payrollPeriods.findFirst({
        where: and(
          eq(payrollPeriods.id, input.payrollPeriodId),
          eq(payrollPeriods.companyId, ctx.companyId),
        ),
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });

      const results = await ctx.db.select().from(employeeSnapshots)
        .where(and(
          eq(employeeSnapshots.payrollPeriodId, input.payrollPeriodId),
          or(
            like(employeeSnapshots.employeeName, `%${input.query}%`),
            like(employeeSnapshots.employeeExternalId, `%${input.query}%`),
          ),
        ))
        .limit(input.limit);

      return results;
    }),
});
