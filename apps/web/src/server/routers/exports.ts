import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, sql } from "drizzle-orm";
import { exportHistory, users } from "@saas/db";
import { protectedProcedure, router } from "../trpc";

const ExportFormat = z.enum(["pdf", "xlsx", "csv"]);

export const exportsRouter = router({
  requestExport: protectedProcedure
    .input(z.object({
      comparisonRunId: z.string().uuid(),
      format: ExportFormat,
      includeAllColumns: z.boolean().default(true),
      selectedColumns: z.array(z.string()).optional(),
      includeAiNarrative: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const [exportRecord] = await ctx.db.insert(exportHistory).values({
        companyId: currentUser.companyId,
        comparisonRunId: input.comparisonRunId,
        format: input.format,
        status: "pending",
        requestedById: currentUser.id,
      }).returning();

      return exportRecord;
    }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await ctx.db.query.exportHistory.findFirst({
        where: eq(exportHistory.id, input.id),
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
      return record;
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      const offset = (input.page - 1) * input.pageSize;

      const [data, total] = await Promise.all([
        ctx.db.select().from(exportHistory)
          .where(eq(exportHistory.companyId, currentUser.companyId))
          .orderBy(desc(exportHistory.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(exportHistory)
          .where(eq(exportHistory.companyId, currentUser.companyId)),
      ]);

      return { data, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
    }),
});
