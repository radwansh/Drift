import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { trialRequests, requireDb } from "@saas/db";

export async function POST(req: NextRequest) {
  try {
    let leadId: string | null = null;
    let leadStatus: string | null = null;
    let email: string | null = null;

    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("application/json")) {
      const body = await req.json();
      const data = body?.data?.[0] || body;
      leadId = data?.Lead_Id || data?.id || null;
      leadStatus = data?.Lead_Status || data?.Status || null;
      email = data?.Email || null;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      leadId = params.get("Lead_Id") || params.get("id") || null;
      leadStatus = params.get("Lead_Status") || params.get("Status") || null;
      email = params.get("Email") || null;
    }

    if (!leadStatus) {
      console.log("zoho-webhook: no leadStatus, skipping");
      return NextResponse.json({ received: true });
    }

    if (leadStatus !== "Pre-Qualified") {
      console.log("zoho-webhook: leadStatus is", leadStatus, "- not Pre-Qualified, skipping");
      return NextResponse.json({ received: true });
    }

    console.log("zoho-webhook: received Pre-Qualified for email:", email, "leadId:", leadId);

    const db = requireDb();

    const request = await db.query.trialRequests.findFirst({
      where: email
        ? eq(trialRequests.email, email)
        : leadId
          ? eq(trialRequests.zohoLeadId, leadId)
          : undefined,
    });

    console.log("zoho-webhook: found request?", !!request, "status:", request?.status);

    if (!request || request.status !== "pending") {
      console.log("zoho-webhook: request not found or not pending, skipping");
      return NextResponse.json({ received: true });
    }

    const trialLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/signup?trial=${request.id}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    console.log("zoho-webhook: sending email to", request.email, "with link", trialLink);

    const { sendTrialApprovedEmail } = await import("@/lib/resend");
    await sendTrialApprovedEmail({
      firstName: request.firstName,
      email: request.email,
      trialLink,
    });

    console.log("zoho-webhook: email sent, updating DB...");

    await db.update(trialRequests)
      .set({
        status: "approved",
        trialLink,
        trialExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(trialRequests.id, request.id));

    console.log("zoho-webhook: done");
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Zoho webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
