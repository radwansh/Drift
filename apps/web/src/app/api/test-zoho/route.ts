import { NextResponse } from "next/server";

export async function GET() {
  const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
  const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
  const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
  const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";

  const missing = [];
  if (!ZOHO_CLIENT_ID) missing.push("ZOHO_CLIENT_ID");
  if (!ZOHO_CLIENT_SECRET) missing.push("ZOHO_CLIENT_SECRET");
  if (!ZOHO_REFRESH_TOKEN) missing.push("ZOHO_REFRESH_TOKEN");

  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: "Missing env vars", missing });
  }

  try {
    const url = `${ZOHO_ACCOUNTS_URL}/oauth/v2/token`;
    const params = new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    });
    const res = await fetch(url, { method: "POST", body: params });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data.error ?? data, status: res.status });
    }
    return NextResponse.json({ ok: true, access_token: data.access_token?.slice(0, 10) + "..." });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
