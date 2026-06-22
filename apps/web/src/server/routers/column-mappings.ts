import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { companyColumnMappings, users } from "@saas/db";
import { suggestColumnMappings } from "@saas/ai";
import { protectedProcedure, router } from "../trpc";

export const columnMappingsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = await ctx.db.query.users.findFirst({
      where: eq(users.clerkUserId, ctx.userId),
    });
    if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

    const mappings = await ctx.db.select().from(companyColumnMappings)
      .where(eq(companyColumnMappings.companyId, currentUser.companyId))
      .orderBy(companyColumnMappings.sourceColumn);
    return mappings;
  }),

  save: protectedProcedure
    .input(z.object({
      mappings: z.array(z.object({
        sourceColumn: z.string().min(1),
        mappedComponent: z.string().min(1),
        isEmployeeId: z.boolean().default(false),
        isEmployeeName: z.boolean().default(false),
        isDepartment: z.boolean().default(false),
        isGrossSalary: z.boolean().default(false),
        isNetSalary: z.boolean().default(false),
        isAiSuggested: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.clerkUserId, ctx.userId),
      });
      if (!currentUser) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.delete(companyColumnMappings)
        .where(eq(companyColumnMappings.companyId, currentUser.companyId));

      if (input.mappings.length === 0) return [];

      const values = input.mappings.map((m) => ({
        companyId: currentUser.companyId,
        sourceColumn: m.sourceColumn,
        mappedComponent: m.mappedComponent,
        isEmployeeId: m.isEmployeeId,
        isEmployeeName: m.isEmployeeName,
        isDepartment: m.isDepartment,
        isGrossSalary: m.isGrossSalary,
        isNetSalary: m.isNetSalary,
        isAiSuggested: m.isAiSuggested,
      }));

      const saved = await ctx.db.insert(companyColumnMappings).values(values).returning();
      return saved;
    }),

  suggest: protectedProcedure
    .input(z.object({
      headers: z.array(z.string()),
    }))
    .query(async ({ ctx, input }) => {
      const suggestions = await suggestColumnMappings(input.headers);
      return suggestions;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(companyColumnMappings)
        .where(eq(companyColumnMappings.id, input.id))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Mapping not found" });
      return deleted;
    }),
});
