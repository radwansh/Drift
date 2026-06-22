import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, like, sql } from "drizzle-orm";
import { employeeSnapshots, payrollPeriods, users } from "@saas/db";
import { protectedProcedure, router } from "../trpc";

export const employeesRouter = router({
  listByPeriod: protectedProcedure
    .input(z.object({
      payrollPeriodId: z.string().uuid(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
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

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await ctx.db.query.employeeSnapshots.findFirst({
        where: eq(employeeSnapshots.id, input.id),
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Employee snapshot not found" });
      return snapshot;
    }),

  search: protectedProcedure
    .input(z.object({
      payrollPeriodId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
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
