import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { trialRequests, requireDb } from "@saas/db";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { createZohoLead } from "@/lib/zoho-crm";

const COMPANY_SIZE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+",
] as const;

export const trialRouter = router({
  submit: publicProcedure
    .input(z.object({
      firstName: z.string().min(1, "First name is required").max(100),
      lastName: z.string().min(1, "Last name is required").max(100),
      email: z.string().email("Valid email is required"),
      companyName: z.string().min(1, "Company name is required").max(200),
      companySize: z.enum(COMPANY_SIZE_OPTIONS),
    }))
    .mutation(async ({ input }) => {
      const db = requireDb();

      const existing = await db.query.trialRequests.findFirst({
        where: eq(trialRequests.email, input.email),
      });
      if (existing) {
        if (existing.status === "approved") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email already has an approved trial. Check your inbox for the access link.",
          });
        }
        if (existing.status === "pending") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A trial request for this email is already pending review.",
          });
        }
      }

      let zohoLeadId = "";
      try {
        zohoLeadId = await createZohoLead(input);
      } catch (err) {
        console.error("Zoho lead creation failed:", err);
      }

      const [request] = await db.insert(trialRequests).values({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        companyName: input.companyName,
        companySize: input.companySize,
        status: "pending",
        zohoLeadId: zohoLeadId || null,
      }).returning();

      return {
        success: true,
        message: "Your trial request has been submitted. We'll review it and send you access shortly.",
        requestId: request.id,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const requests = await ctx.db.query.trialRequests.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return requests;
  }),

  approve: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const request = await db.query.trialRequests.findFirst({
        where: eq(trialRequests.id, input.id),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request is not pending" });
      }

      const trialLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/signup?trial=${request.id}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const { sendTrialApprovedEmail } = await import("@/lib/resend");
      await sendTrialApprovedEmail({
        firstName: request.firstName,
        email: request.email,
        trialLink,
      });

      const [updated] = await db.update(trialRequests)
        .set({
          status: "approved",
          trialLink,
          trialExpiresAt: expiresAt,
          reviewedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(trialRequests.id, input.id))
        .returning();

      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [updated] = await db.update(trialRequests)
        .set({ status: "rejected", reviewedBy: ctx.userId, updatedAt: new Date() })
        .where(eq(trialRequests.id, input.id))
        .returning();
      return updated;
    }),
});
