import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { trialRequests, requireDb } from "@saas/db";

const ZOHO_WEBHOOK_SECRET = process.env.ZOHO_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  try {
    if (ZOHO_WEBHOOK_SECRET) {
      const signature = req.headers.get("x-zoho-signature") ?? "";
    }

    const body = await req.json();
    const data = body?.data?.[0] || body;

    const leadId = data?.Lead_Id || data?.id;
    const leadStatus = data?.Lead_Status || data?.Status;
    const email = data?.Email;

    if (!leadStatus || (!leadId && !email)) {
      return NextResponse.json({ received: true });
    }

    const db = requireDb();

    if (leadStatus === "Pre-Qualified") {
      const request = await db.query.trialRequests.findFirst({
        where: email
          ? eq(trialRequests.email, email)
          : eq(trialRequests.zohoLeadId, leadId),
      });

      if (request && request.status === "pending") {
        const trialLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/signup?trial=${request.id}`;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const { sendTrialApprovedEmail } = await import("@/lib/resend");
        await sendTrialApprovedEmail({
          firstName: request.firstName,
          email: request.email,
          trialLink,
        });

        await db.update(trialRequests)
          .set({
            status: "approved",
            trialLink,
            trialExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(trialRequests.id, request.id));
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Zoho webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
