import { Resend } from "resend";

/**
 * Resend, read from the environment at call time, with the sender configurable.
 *
 * **The sender was a real bug, not a placeholder.** This module hard-coded
 * `from: "onboarding@resend.dev"`, which is Resend's shared test address: it
 * delivers **only to the Resend account owner's own inbox** and is dropped for
 * every other recipient. So every customer email this app has ever sent — the
 * trial approval above all — went nowhere, silently, with a 200 and an id in
 * the log. The address now comes from `EMAIL_FROM` and nothing is sent without
 * it; `clarivo-app.com` has to be verified as a sending domain in Resend for
 * deliveries to that sender to leave at all.
 *
 * **Everything here is read inside a function rather than at module scope**, the
 * way `server/polar.ts` reads its own variables. Two reasons: a value captured
 * at import is fixed for the life of the process, so a test that sets the key
 * cannot be made to see it; and a blank variable — a Vercel environment
 * variable created and left empty, which is the common way one of these arrives
 * — must read as unset rather than be sent as an empty `from`.
 *
 * Missing either variable logs a warning and skips the email. Per CLAUDE.md's
 * "optional services degrade, never break", email is optional: onboarding, the
 * paywall and the Polar webhook must all complete without it.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clarivo-app.com";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Clarivo";

/** A trimmed environment variable, or null for unset-or-blank. */
function env(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The address every email is sent from, or null when it is not configured.
 *
 * No default and no fallback: `onboarding@resend.dev` is what this replaced, and
 * falling back to it would restore a sender that delivers to one inbox while
 * reporting success for every other recipient.
 */
export function emailFrom(): string | null {
  return env("EMAIL_FROM");
}

/** Whether an email can be sent at all: a key to send with and an address to send from. */
export function isEmailConfigured(): boolean {
  return env("RESEND_API_KEY") !== null && emailFrom() !== null;
}

/**
 * A Resend client, or null when `RESEND_API_KEY` is unset.
 *
 * Exported so `server/trial-email.ts` shares one place that decides whether
 * email is configured. The key being read here rather than at import is what
 * lets a test stub it.
 */
export function resendClient(): Resend | null {
  const key = env("RESEND_API_KEY");
  if (key === null) return null;
  return new Resend(key);
}

/**
 * The client and the sender together, or null with a warning naming the missing
 * variable. Every caller in this repo starts here.
 */
export function emailSender(purpose: string): { resend: Resend; from: string } | null {
  const from = emailFrom();
  const resend = resendClient();
  if (resend === null || from === null) {
    console.warn(
      `[email] ${purpose} skipped: ${resend === null ? "RESEND_API_KEY" : "EMAIL_FROM"} is not set.`,
    );
    return null;
  }
  return { resend, from };
}

export interface TrialRequestEmailInput {
  firstName: string;
  email: string;
  trialLink: string;
}

export async function sendTrialApprovedEmail(input: TrialRequestEmailInput) {
  const sender = emailSender("the trial approval email");
  if (!sender) return;
  const { resend, from } = sender;
  try {
    const result = await resend.emails.send({
      from,
      to: input.email,
      subject: `Your 30-Day Clarivo Trial is Ready!`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f8fafc">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
<tr><td style="padding:40px 40px 0;text-align:center">
<h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 8px">Welcome to Clarivo, ${input.firstName}!</h1>
<p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">
Your <strong style="color:#3b82f6">30-day free trial</strong> is now active. Click the button below to access Clarivo and start comparing your payroll periods instantly.
</p>
<a href="${input.trialLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:14px 36px;border-radius:100px;font-size:16px;font-weight:600;text-decoration:none;box-shadow:0 4px 14px rgba(59,130,246,0.3)">
  Access Clarivo Now
</a>
</td></tr>
<tr><td style="padding:24px 40px 0">
<hr style="border:none;border-top:1px solid #e2e8f0;margin:0">
</td></tr>
<tr><td style="padding:24px 40px 40px">
<h2 style="font-size:16px;font-weight:600;color:#0f172a;margin:0 0 12px">What you get with Clarivo:</h2>
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
  const sender = emailSender("the trial request notification");
  if (!sender) return;
  const { resend, from } = sender;
  await resend.emails.send({
    from,
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
