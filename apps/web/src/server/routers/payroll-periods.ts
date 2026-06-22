import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { payrollPeriods, employeeSnapshots, uploadSessions, users } from "@saas/db";
import { protectedProcedure, router } from "../trpc";

const PeriodType = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);
const PeriodStatus = z.enum(["processing", "ready", "error"]);
const DataSource = z.enum(["upload", "integration"]);

export const payrollPeriodsRouter = router({
  list: protectedProcedure
    .input(z.object({
      periodType: PeriodType.optional(),
      status: PeriodStatus.optional(),
      search: z.string().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const filters = [eq(payrollPeriods.companyId, currentUser.companyId)];
      if (input.periodType) filters.push(eq(payrollPeriods.periodType, input.periodType));
      if (input.status) filters.push(eq(payrollPeriods.status, input.status));
      if (input.search) filters.push(like(payrollPeriods.sourceFilename, `%${input.search}%`));

      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(payrollPeriods)
          .where(and(...filters))
          .orderBy(desc(payrollPeriods.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(payrollPeriods)
          .where(and(...filters)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const period = await ctx.db.query.payrollPeriods.findFirst({
        where: eq(payrollPeriods.id, input.id),
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });
      return period;
    }),

  create: protectedProcedure
    .input(z.object({
      periodType: PeriodType,
      periodStart: z.string(),
      periodEnd: z.string(),
      source: DataSource.default("upload"),
      sourceFilename: z.string().optional(),
      currencyCode: z.string().length(3).default("USD"),
      totalEmployees: z.number().int().nonnegative(),
      totalGross: z.number().nonnegative(),
      totalNet: z.number().nonnegative(),
      rawFileKey: z.string().optional(),
      uploadSessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const [period] = await ctx.db.insert(payrollPeriods).values({
        companyId: currentUser.companyId,
        periodType: input.periodType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        source: input.source,
        sourceFilename: input.sourceFilename ?? null,
        currencyCode: input.currencyCode,
        status: "ready",
        totalEmployees: input.totalEmployees,
        totalGross: String(input.totalGross),
        totalNet: String(input.totalNet),
        rawFileKey: input.rawFileKey ?? null,
      }).returning();

      if (input.uploadSessionId) {
        await ctx.db.update(uploadSessions)
          .set({ status: "ready" })
          .where(eq(uploadSessions.id, input.uploadSessionId));
      }

      return period;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(payrollPeriods)
        .where(eq(payrollPeriods.id, input.id))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll period not found" });
      return deleted;
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      filename: z.string().min(1),
      contentType: z.string().default("application/octet-stream"),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const fileKey = `${currentUser.companyId}/${Date.now()}-${input.filename}`;

      const [session] = await ctx.db.insert(uploadSessions).values({
        companyId: currentUser.companyId,
        filename: input.filename,
        fileKey,
        status: "processing",
      }).returning();

      return { uploadSessionId: session.id, fileKey };
    }),
});
