import { Notice } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What stands in for Clerk's sign-in / sign-up card while it is not there.
 *
 * **The right half of the auth screen used to be empty.** `AuthFrame` renders
 * its Ink panel on the server, so the left side paints immediately; the form is
 * `<SignIn>` / `<SignUp>`, which Clerk mounts in the browser after
 * `clerk.browser.js` has downloaded, parsed and initialised. Measured from a
 * cold profile against production: the gap is **~0.9s unthrottled and ~3.4s on
 * fast-3G**. For that whole window a visitor who just clicked "Start 14-day
 * free trial" sees a headline, a paragraph, and nothing at all where the form
 * should be — which reads as a broken page, on the one screen the entire
 * marketing site funnels into.
 *
 * Two states, because they want different answers:
 *
 * - **Loading** is the common one and it is not an error, so it says nothing.
 *   It is a skeleton shaped like the card Clerk is about to mount, which also
 *   holds the height so the page does not jump when the real form arrives.
 * - **Failed** is Clerk's own `<ClerkFailed>`: `clerk.browser.js` did not load.
 *   Before this, that state was indistinguishable from "still loading" —
 *   blank, forever, with no way to tell. An ad blocker, a corporate proxy, a
 *   DNS problem on `clerk.clarivo-app.com` or a Clerk outage all land here, and
 *   a reload is the one thing that might help, so it says so.
 */

/** Roughly the height of Clerk's card: header, OAuth, divider, four fields, button. */
export function AuthFormSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="auth-form-skeleton"
      className="w-full max-w-[25rem] rounded-cv-lg border border-cv-line bg-cv-surface p-8 shadow-cv-md"
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-3 h-4 w-full max-w-[17rem]" />

      <Skeleton className="mt-8 h-10 w-full" />

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-cv-line" />
        <Skeleton className="h-3 w-6" />
        <span className="h-px flex-1 bg-cv-line" />
      </div>

      <div className="mt-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>

      <Skeleton className="mt-8 h-10 w-full" />
      <Skeleton className="mx-auto mt-6 h-4 w-48" />
    </div>
  );
}

/**
 * Shown only by `<ClerkFailed>`, so by the time it renders Clerk has given up.
 *
 * No "try again" button: there is nothing this app can retry — the script is
 * fetched by Clerk's own loader from a host we do not control. A reload is the
 * honest instruction, and naming the host is what lets somebody behind a
 * blocker work out why in one step instead of filing a ticket.
 */
export function AuthFormUnavailable() {
  return (
    <div className="w-full max-w-[25rem]">
      <Notice tone="danger" title="The sign-in form could not load">
        <p className="m-0">
          Clarivo could not reach <code className="font-cv-mono">clerk.clarivo-app.com</code>, which
          serves the sign-in and sign-up form. Reload the page to try again. If it keeps failing, an
          ad blocker, a VPN or a corporate network is the usual cause.
        </p>
      </Notice>
    </div>
  );
}
