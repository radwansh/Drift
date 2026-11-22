/**
 * Sending a real Clerk invitation.
 *
 * **`auth.inviteUser` used to send nothing.** It inserted a `users` row with a
 * null `clerk_user_id` and returned it, and `ensureUser` claims that row by
 * email when the person signs in — so the plumbing on this side was right and
 * complete, and the invitation itself was never sent. Nobody was ever told they
 * had been invited. An admin who used that screen had no way to find out: the
 * row appeared in the user list, which looks exactly like success.
 *
 * So this is the half that was missing, in one module because two callers need
 * it — `auth.inviteUser` and onboarding's step 5 — and because a function that
 * returns a result instead of throwing is what lets the routers say "the
 * invitation was not sent" in their own words.
 *
 * **It does not degrade.** CLAUDE.md's rule is that an optional service falls
 * back rather than failing, and this is deliberately not one of those: the
 * fallback for "could not send an invitation" is a screen that claims to have
 * sent one. Without a Clerk secret key this reports a failure, the step offers
 * a retry, and "I'll do this later" is still there for anyone who would rather
 * move on.
 */

/** Where the invitation link lands. Clerk appends its own ticket to this. */
const SIGN_UP_PATH = "/sign-up";

/**
 * The absolute URL Clerk redirects an invited person to.
 *
 * Absolute rather than a bare path: Clerk's `redirect_url` is followed from an
 * email, which has no origin to resolve a path against. The default matches
 * `lib/resend.ts` — the production host — so a deployment that forgets the
 * variable sends people to the live app rather than to localhost.
 */
export function invitationRedirectUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://clarivo-app.com";
  return `${base.replace(/\/+$/, "")}${SIGN_UP_PATH}`;
}

export type InvitationResult =
  | { ok: true; invitationId: string }
  /**
   * `reason` separates the two cases a caller words differently: a deployment
   * with no Clerk credentials at all, and Clerk refusing this particular
   * address (already invited, already a member, blocked domain).
   */
  | { ok: false; reason: "not_configured" | "refused"; message: string };

/**
 * Whether this deployment can send an invitation at all.
 *
 * Checked before the call rather than inferred from the failure, so "nobody
 * configured Clerk" does not reach an admin as whatever sentence the SDK throws
 * when it has no key.
 */
export function isClerkConfigured(): boolean {
  const key = process.env.CLERK_SECRET_KEY;
  return typeof key === "string" && key.length > 0;
}

/**
 * Pulls a readable sentence out of whatever Clerk threw.
 *
 * `ClerkAPIResponseError` carries an `errors` array whose entries have `code`,
 * `message` and a fuller `longMessage`; the long one is the sentence written
 * for a person to read. Anything unrecognisable falls back to a sentence of our
 * own rather than to `String(error)`, which would put a stack-shaped string on
 * the screen.
 */
function messageOf(error: unknown): string {
  if (error !== null && typeof error === "object" && "errors" in error) {
    const list = (error as { errors?: unknown }).errors;
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0] as { longMessage?: unknown; message?: unknown };
      const text = first.longMessage ?? first.message;
      if (typeof text === "string" && text.trim().length > 0) return text.trim();
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  return "Clerk did not accept the invitation.";
}

/**
 * Invites `email` to create an account, and returns Clerk's invitation id.
 *
 * `ignoreExisting` so a retry after a half-failure is safe: if the first
 * attempt reached Clerk and the caller's own write then failed, pressing the
 * button again must not be refused for "already invited". That is what makes
 * the retry the step offers a real retry rather than a dead end.
 *
 * The address is not logged. It is returned to the admin who typed it, through
 * the caller's error message, and that is the only place it belongs.
 */
export async function sendClerkInvitation(email: string): Promise<InvitationResult> {
  if (!isClerkConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Clarivo cannot send invitations on this deployment: no Clerk credentials are configured. Nobody has been invited.",
    };
  }

  try {
    // Imported here rather than at module scope so that importing this file —
    // which every test of the two routers does — never reaches into Clerk's
    // server SDK unless an invitation is actually being sent.
    const { clerkClient } = await import("@clerk/nextjs/server");
    const clerk = await clerkClient();
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: invitationRedirectUrl(),
      ignoreExisting: true,
    });
    return { ok: true, invitationId: invitation.id };
  } catch (error) {
    return { ok: false, reason: "refused", message: messageOf(error) };
  }
}
