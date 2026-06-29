import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = "onboarding@resend.dev";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://drift.money";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Drift";

function getClient(): Resend | null {
  if (!RESEND_API_KEY) return null;
  return new Resend(RESEND_API_KEY);
}

export interface TrialRequestEmailInput {
  firstName: string;
  email: string;
  trialLink: string;
}

export async function sendTrialApprovedEmail(input: TrialRequestEmailInput) {
  const resend = getClient();
  if (!resend) {
    console.warn("Resend not configured — skipping trial approval email");
    return;
  }
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.email,
      subject: `Your 30-Day Drift Trial is Ready!`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f8fafc">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
<tr><td style="padding:40px 40px 0;text-align:center">
<h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 8px">Welcome to Drift, ${input.firstName}!</h1>
<p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">
Your <strong style="color:#3b82f6">30-day free trial</strong> is now active. Click the button below to access Drift and start comparing your payroll periods instantly.
</p>
<a href="${input.trialLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:14px 36px;border-radius:100px;font-size:16px;font-weight:600;text-decoration:none;box-shadow:0 4px 14px rgba(59,130,246,0.3)">
  Access Drift Now
</a>
</td></tr>
<tr><td style="padding:24px 40px 0">
<hr style="border:none;border-top:1px solid #e2e8f0;margin:0">
</td></tr>
<tr><td style="padding:24px 40px 40px">
<h2 style="font-size:16px;font-weight:600;color:#0f172a;margin:0 0 12px">What you get with Drift:</h2>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:6px 0;color:#334155;font-size:14px">+ <strong>Payroll Variance Analysis</strong> &mdash; Compare any two periods side-by-side</td></tr>
<tr><td style="padding:6px 0;color:#334155;font-size:14px">+ <strong>AI-Powered Insights</strong> &mdash; Automated anomaly detection &amp; summaries</td></tr>
<tr><td style="padding:6px 0;color:#334155;font-size:14px">+ <strong>Department Breakdowns</strong> &mdash; See changes by team or location</td></tr>
<tr><td style="padding:6px 0;color:#334155;font-size:14px">+ <strong>Export &amp; Share</strong> &mdash; CSV reports ready for your stakeholders</td></tr>
</table>
</td></tr>
<tr><td style="background:#f1f5f9;padding:24px 40px;text-align:center">
<p style="color:#64748b;font-size:13px;margin:0 0 8px;line-height:1.5">
We'd love to hear your feedback! Reply to this email or reach out anytime.<br>
Your trial expires in <strong>30 days</strong>.
</p>
<p style="color:#94a3b8;font-size:12px;margin:0">
&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,
    });
    if (result.error) {
      console.error("Resend returned error:", result.error);
    } else {
      console.log("Trial approval email sent:", result.data?.id ?? "no id");
    }
  } catch (err) {
    console.error("Failed to send trial approval email:", err);
  }
}

export async function sendTrialRequestNotification(input: {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  companySize: string;
}) {
  const resend = getClient();
  if (!resend) return;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: process.env.ADMIN_EMAIL || "admin@drift.money",
    subject: `New Trial Request: ${input.firstName} ${input.lastName} — ${input.companyName}`,
    html: `<h2>New Trial Request</h2>
<p><strong>Name:</strong> ${input.firstName} ${input.lastName}</p>
<p><strong>Email:</strong> ${input.email}</p>
<p><strong>Company:</strong> ${input.companyName}</p>
<p><strong>Size:</strong> ${input.companySize}</p>
<p>Check Zoho CRM to review and approve this request.</p>`,
  });
}
