import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { eq } from "drizzle-orm";
import { companies, uploadSessions, users } from "@saas/db";
import { entitlementOf, type CompanySettings } from "@/lib/entitlement";

export async function POST(req: NextRequest) {
  const db = requireDb();
  try {
    const authResult = await auth();
    if (!authResult.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const periodType = formData.get("periodType") as string | null;
    const periodStart = formData.get("periodStart") as string | null;
    const periodEnd = formData.get("periodEnd") as string | null;
    const currencyCode = formData.get("currencyCode") as string | null;

    const user = await db.query.users.findFirst({
      where: eq(users.clerkUserId, authResult.userId),
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    /**
     * The entitlement gate, here as well as on `memberProcedure`.
     *
     * This route is not tRPC, so the middleware that refuses every data
     * procedure does not cover it — and it is the one endpoint that would
     * otherwise let a company whose trial has ended keep putting payroll into
     * Clarivo. It reads the same `entitlementOf()` the paywall and the
     * procedures read, so the three cannot disagree.
     *
     * `402` rather than `403`: the cause is payment, the caller is who they
     * say they are, and the upload wizard keys its paywall on this.
     *
     * Only `trial_ended` and `subscription_ended` refuse, matching the tRPC
     * gate — a company that never onboarded is a pre-release company, and
     * blocking its uploads would lock out every existing customer on release
     * day. The settings come from the company row rather than a second
     * entitlement query, so this costs one read it was already going to make.
     */
    const [company] = await db
      .select({ settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);
    const { access, reason } = entitlementOf(company?.settings as CompanySettings, new Date());
    if (!access && (reason === "trial_ended" || reason === "subscription_ended")) {
      return NextResponse.json(
        {
          error:
            reason === "trial_ended"
              ? "Your free trial has ended. Choose a plan to keep using Clarivo."
              : "Your subscription has ended. Choose a plan to keep using Clarivo.",
          cause: "PAYMENT_REQUIRED",
        },
        { status: 402 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileKey = `${user.companyId}/${Date.now()}-${file.name}`;

    const [session] = await db.insert(uploadSessions).values({
      companyId: user.companyId,
      filename: file.name,
      fileKey,
      status: "processing",
      periodType: periodType ?? null,
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      currencyCode: currencyCode ?? null,
    }).returning();

    const content = buffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const rawHeaders = lines.length > 0 ? lines[0].split(",").map((h) => h.trim()) : [];

    return NextResponse.json({
      uploadSessionId: session.id,
      fileKey,
      filename: file.name,
      totalRows: Math.max(0, lines.length - 1),
      headers: rawHeaders,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
