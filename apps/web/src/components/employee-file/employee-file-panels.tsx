import { EmptyState } from "@/components/cv";

/**
 * The two panels both Employee File routes can land on (step E1), on Ink &
 * Signal.
 *
 * Shared rather than duplicated per route, because the wording is the point: a
 * redirect from either of these states loses the reason, and two copies drift.
 *
 * Both are `EmptyState visual={null}`: the design system's empty state is a
 * calm baseline, and the drift strip is for "nothing here yet" rather than for
 * a refusal, so neither of these gets one. The old big icon in a tinted circle
 * is gone with it — a dead end is not an alarm.
 */

/**
 * Shown when the caller is signed in but has no usable account row.
 *
 * Deliberately not a `redirect("/login")`. `/login` is a public route, so Clerk
 * does not challenge an already-signed-in visitor and instead honours
 * `afterSignInUrl="/dashboard"` — a failed lookup then presents as the page
 * quietly throwing the user back to the dashboard with the reason lost. That is
 * the bug `AccountUnavailable` on the annual page was written to fix.
 */
export function AccountUnavailable() {
  return (
    <section aria-label="Could not open your account">
      <EmptyState
        visual={null}
        title="Could not open your account"
        description="You are signed in, but we could not load the company this page belongs to. Reloading usually works. If it keeps happening, the account needs attention rather than another attempt."
        className="py-24"
      />
    </section>
  );
}

/**
 * The server-side role gate's panel.
 *
 * **This is the real control.** The sidebar's role filtering is cosmetic — it
 * hides a link, which stops nobody from typing the URL — and so is this panel
 * on its own: `payDetailProcedure` refuses the data either way. What this adds
 * is that a viewer who navigates directly to `/employees` reads a sentence
 * rather than watching a tRPC error toast fire on an empty page.
 */
export function NotAvailableForRole() {
  return (
    <section aria-label="Not available for your role">
      <EmptyState
        visual={null}
        title="Not available for your role"
        description="The Employee File shows one person's pay in full, so it is open to admins and managers only. Ask an admin in your company if you need access to it."
        className="py-24"
      />
    </section>
  );
}
