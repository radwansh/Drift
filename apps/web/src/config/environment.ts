import "server-only";

/**
 * Which deployment this build is, from Vercel's own `VERCEL_ENV`. Unset
 * locally, which reads as "development".
 *
 * Deliberately *not* a `NEXT_PUBLIC_` variable. That would depend on Vercel's
 * "automatically expose system environment variables" project setting being
 * on, and a silently-undefined value here would show the sign-in links on
 * production — the one outcome this file exists to prevent. `server-only`
 * turns an accidental client import into a build error rather than a wrong
 * answer at runtime.
 */
export type DeployEnvironment = "production" | "preview" | "development";

export const deployEnvironment: DeployEnvironment =
  process.env.VERCEL_ENV === "production"
    ? "production"
    : process.env.VERCEL_ENV === "preview"
      ? "preview"
      : "development";

/**
 * Whether the public pages advertise the way in — the header's "Sign in"
 * button, its mobile equivalent, and the final CTA's secondary button.
 *
 * Off on production until launch, on everywhere else so preview and local
 * work stay usable.
 *
 * Be clear about what this is: it hides links, so nothing on the landing page
 * invites a visitor to sign in. It is **not** access control — `/sign-in`
 * still resolves if somebody types it, and it has to, or there would be no way
 * into production at all. What stops a stranger getting an account is Clerk's
 * sign-up mode set to Waitlist.
 */
export const authEntryPointsVisible = deployEnvironment !== "production";
