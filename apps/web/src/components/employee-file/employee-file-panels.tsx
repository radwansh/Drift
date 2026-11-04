import { AlertCircle, Lock } from "lucide-react";

/**
 * The two panels both Employee File routes can land on (step E1).
 *
 * Shared rather than duplicated per route, because the wording is the point: a
 * redirect from either of these states loses the reason, and two copies drift.
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
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-foreground">Could not open your account</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        You are signed in, but we could not load the company this page belongs to. Reloading
        usually works. If it keeps happening, the account needs attention rather than another
        attempt.
      </p>
    </div>
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
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-muted p-4">
        <Lock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-foreground">Not available for your role</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        The Employee File shows one person&apos;s pay in full, so it is open to admins and
        managers only. Ask an admin in your company if you need access to it.
      </p>
    </div>
  );
}
