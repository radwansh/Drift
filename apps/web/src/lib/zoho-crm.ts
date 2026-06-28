const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID ?? "";
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET ?? "";
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN ?? "";
const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";
const ZOHO_API_URL = "https://www.zohoapis.com";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token;
  }
  const url = `${ZOHO_ACCOUNTS_URL}/oauth/v2/token`;
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(url, { method: "POST", body: params });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoho token refresh failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000,
  };
  return data.access_token;
}

export interface ZohoLeadInput {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  companySize: string;
}

export async function createZohoLead(input: ZohoLeadInput): Promise<string> {
  if (!ZOHO_CLIENT_ID) {
    console.warn("Zoho CRM not configured — skipping lead creation");
    return "";
  }
  const token = await getAccessToken();
  const res = await fetch(`${ZOHO_API_URL}/crm/v2/Leads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: [
        {
          First_Name: input.firstName,
          Last_Name: input.lastName,
          Email: input.email,
          Company: input.companyName,
          Lead_Source: "Drift Landing Page",
          Description: `Company size: ${input.companySize}`,
          Lead_Status: "New",
        },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Zoho create lead failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body?.data?.[0]?.details?.id ?? "";
}
