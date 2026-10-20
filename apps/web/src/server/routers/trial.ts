import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { trialRequests, requireDb } from "@saas/db";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { createZohoLead } from "@/lib/zoho-crm";
import { limitEarlyAccessRequests } from "../rate-limit";

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

      // Read the caller's IP here rather than from the tRPC context:
      // `createContext()` takes no request, and next/headers is request-scoped
      // inside a route handler, so this needs no change to the shared context.
      // The first entry of x-forwarded-for is the client; the rest are proxies.
      const forwardedFor = (await headers()).get("x-forwarded-for");
      const callerIp = forwardedFor?.split(",")[0]?.trim() || "unknown";

      const limit = await limitEarlyAccessRequests(callerIp);
      if (!limit.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please try again later.",
        });
      }

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
        console.log("trial.submit: calling createZohoLead for", input.email);
        zohoLeadId = await createZohoLead(input);
        console.log("trial.submit: createZohoLead returned:", zohoLeadId);
      } catch (err) {
        console.error("trial.submit: Zoho lead creation failed:", err);
      }

      // Clerk is the access gate: an entry on its waiting list is what lets an
      // approval be one click (Dashboard -> Waitlist -> Invite) instead of a
      // hand-made invitation.
      //
      // It holds the email and nothing else — `waitlistEntries.create` accepts
      // only `{ emailAddress, notify }`, with no custom fields or metadata — so
      // the lead details stay in trial_requests and in Zoho, and this is the
      // thinnest of the three writes on purpose.
      //
      // `notify: false` because this flow sends its own approval mail from
      // `trial.approve`; letting Clerk also mail the person would mean two
      // different "you're in" messages.
      try {
        const clerk = await clerkClient();
        const entry = await clerk.waitlistEntries.create({
          emailAddress: input.email,
          notify: false,
        });
        console.log("trial.submit: Clerk waitlist entry created", entry.id);
      } catch (err) {
        // Unconfigured or failing Clerk must not lose the lead — the row and
        // the CRM record are the parts that matter, and an entry can be added
        // by hand from either.
        console.error("trial.submit: Clerk waitlist entry failed:", err);
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

      console.log("trial.submit: DB record created", request.id, "zohoLeadId:", zohoLeadId);

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
