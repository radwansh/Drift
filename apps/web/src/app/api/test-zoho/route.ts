import { NextResponse } from "next/server";

const DATA_CENTERS = [
  "https://accounts.zoho.com",
  "https://accounts.zoho.eu",
  "https://accounts.zoho.in",
  "https://accounts.zoho.com.au",
  "https://accounts.zoho.jp",
];

export async function GET() {
  const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID ?? "";
  const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET ?? "";
  const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN ?? "";
  const configuredUrl = (process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com").replace(/\/+$/, "");

  const missing = [];
  if (!ZOHO_CLIENT_ID) missing.push("ZOHO_CLIENT_ID");
  if (!ZOHO_CLIENT_SECRET) missing.push("ZOHO_CLIENT_SECRET");
  if (!ZOHO_REFRESH_TOKEN) missing.push("ZOHO_REFRESH_TOKEN");

  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: "Missing env vars", missing });
  }

  const results: Record<string, unknown> = {};

  const urlsToTry = [configuredUrl, ...DATA_CENTERS.filter((u) => u !== configuredUrl)];

  for (const baseUrl of urlsToTry) {
    const url = `${baseUrl}/oauth/v2/token`;
    const params = new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const text = await res.text();
      if (res.ok) {
        const data = JSON.parse(text);
        return NextResponse.json({
          ok: true,
          data_center: baseUrl,
          access_token: data.access_token?.slice(0, 10) + "...",
          api_domain: data.api_domain,
        });
      }
      results[baseUrl] = { status: res.status, body: text.slice(0, 300) };
    } catch (err) {
      results[baseUrl] = { error: String(err) };
    }
  }

  return NextResponse.json({ ok: false, tried: results });
}
