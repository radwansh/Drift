import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireDb } from "@saas/db";
import { eq } from "drizzle-orm";
import { uploadSessions, users } from "@saas/db";

const db = requireDb();

export async function POST(req: NextRequest) {
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
