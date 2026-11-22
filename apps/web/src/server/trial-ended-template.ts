/**
 * The trial-ended email, as an HTML part and a plain-text part.
 *
 * **Literal colours, on purpose, and this file is exempt from
 * `test/design-system.test.ts` for the same reason `lib/clerk-appearance.ts`
 * is.** An email client is not a browser: Gmail's web client strips `<style>`
 * and every CSS custom property with it, so `var(--cv-ink)` renders as nothing
 * and the text comes out as whatever the client's default is — black on black in
 * a dark-mode inbox. The hex values below **mirror the Light theme of
 * `src/app/clarivo-tokens.css`** and are listed beside the token each one
 * stands for, so a token change is findable from here rather than invisible.
 *
 * Why a table layout and inline styles: the same reason the existing trial
 * approval email in `lib/resend.ts` uses them. Outlook on Windows renders
 * through Word, which supports neither flexbox nor grid, and several clients
 * discard a `<head>` entirely.
 *
 * **Both parts are sent, always.** Resend takes `html` and `text` together, and
 * a message with no text part scores badly with spam filters and is unreadable
 * in a plain-text client. The two say the same thing in the same order rather
 * than the text part being an afterthought.
 *
 * The wording is fixed by the brief and is deliberately calm: the subject says
 * what happened, the body says the data is safe, and the one action is choosing
 * a plan. Nothing in it is a deadline, a warning or a threat — the account is
 * not at risk and the email must not imply it is.
 */

/**
 * The Light theme, as literal values. Each line names the token it mirrors.
 * Light only: an email carries no theme, and `print-color-adjust` has no
 * equivalent here — a dark palette would be wrong in a light inbox and vice
 * versa, so the one that reads on white wins.
 */
const COLOURS = {
  /** --cv-bg (slate-25) */
  page: "#f7f8f9",
  /** --cv-surface */
  surface: "#ffffff",
  /** --cv-line (slate-100) */
  line: "#e6eaed",
  /** --cv-ink (slate-900) */
  ink: "#121a22",
  /** --cv-ink-muted (slate-700) */
  inkMuted: "#4e5862",
  /** --cv-ink-subtle (slate-600) */
  inkSubtle: "#677079",
  /** --cv-primary (slate-900) — the Ink button, not rust and not cobalt */
  primary: "#121a22",
  /** --cv-on-primary */
  onPrimary: "#ffffff",
} as const;

/** Instrument Sans is self-hosted, so an email falls back to the system stack. */
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Where "Choose a plan" goes. The in-app billing page, on the live host. */
export const CHOOSE_A_PLAN_URL = "https://www.clarivo-app.com/settings/billing";

/** The support address the email offers, matching the paywall's. */
export const SUPPORT_EMAIL = "hello@clarivo-app.com";

/** Fixed by the brief, and the one place it is written. */
export const TRIAL_ENDED_SUBJECT = "Your Clarivo free trial has ended";

export interface TrialEndedEmailInput {
  companyName: string;
  /** When the trial ended — rendered as "14 Oct 2026", the house date format. */
  trialEndsAt: Date;
  /** The trial length in days, from `TRIAL_DAYS`; never retyped here. */
  trialDays: number;
}

/**
 * "14 Oct 2026", in UTC.
 *
 * UTC rather than a locale guess: this runs on a server with no idea where the
 * reader is, and a date rendered in the server's zone can be a day out. The
 * trial boundary is a timestamp, so the day either side of midnight is a real
 * ambiguity and the honest answer is the one the stored value states.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The five characters that change meaning inside HTML.
 *
 * The company name comes from a text field a customer filled in, so it reaches
 * this template as arbitrary text. `&` first, or the escapes escape each other.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The body sentence, in one place so the HTML and the text cannot drift apart. */
function bodyLine(input: TrialEndedEmailInput): string {
  return (
    `Your ${input.trialDays}-day free trial of Clarivo for ${input.companyName} ended on ` +
    `${formatDate(input.trialEndsAt)}. Your data is safe. Choose a plan to keep using Clarivo.`
  );
}

export function trialEndedEmailText(input: TrialEndedEmailInput): string {
  return [
    TRIAL_ENDED_SUBJECT,
    "",
    bodyLine(input),
    "",
    `Choose a plan: ${CHOOSE_A_PLAN_URL}`,
    "",
    `Any question about this, write to ${SUPPORT_EMAIL}.`,
    "",
    "Clarivo",
  ].join("\n");
}

export function trialEndedEmailHtml(input: TrialEndedEmailInput): string {
  const company = escapeHtml(input.companyName);
  const ended = escapeHtml(formatDate(input.trialEndsAt));
  const days = String(input.trialDays);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(TRIAL_ENDED_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOURS.page};font-family:${SANS};color:${COLOURS.ink}">
<!-- Repeated in the preheader so an inbox list shows the sentence, not the first link. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your data is safe. Choose a plan to keep using Clarivo.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOURS.page}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:${COLOURS.surface};border:1px solid ${COLOURS.line};border-radius:12px">
<tr><td style="padding:32px 32px 0">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:${COLOURS.ink}">${escapeHtml(TRIAL_ENDED_SUBJECT)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:24px;color:${COLOURS.inkMuted}">
Your ${days}-day free trial of Clarivo for <strong style="color:${COLOURS.ink}">${company}</strong> ended on ${ended}. Your data is safe. Choose a plan to keep using Clarivo.
</p>
</td></tr>
<tr><td style="padding:0 32px 28px">
<!-- A table-wrapped anchor: Outlook ignores padding on an inline-block <a>. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:${COLOURS.primary};border-radius:8px">
<a href="${CHOOSE_A_PLAN_URL}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;font-weight:600;color:${COLOURS.onPrimary};text-decoration:none">Choose a plan</a>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:0 32px"><div style="height:1px;background:${COLOURS.line}"></div></td></tr>
<tr><td style="padding:20px 32px 28px">
<p style="margin:0;font-size:13px;line-height:20px;color:${COLOURS.inkSubtle}">
Nothing has been deleted, and no payment method is held. Any question about this, write to
<a href="mailto:${SUPPORT_EMAIL}" style="color:${COLOURS.ink}">${SUPPORT_EMAIL}</a>.
</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${COLOURS.inkSubtle}">Clarivo &middot; payroll comparison</p>
</td></tr>
</table>
</body>
</html>`;
}
