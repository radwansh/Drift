import { NextResponse } from "next/server";

export async function GET() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

  if (!RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY is not set" });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: "delivered@resend.dev",
        subject: "Drift - Test Email",
        text: "If you receive this, Resend is configured correctly.",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: data });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
