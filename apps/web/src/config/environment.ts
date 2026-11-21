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
 * `authEntryPointsVisible` is gone, and this note is here so nobody adds it
 * back by accident.
 *
 * It was `deployEnvironment !== "production"`, and it hid the header's "Sign
 * in" button, its mobile equivalent and the final CTA's secondary button on
 * production — correct while the beta was closed, sign-up was by invitation and
 * the landing page's only action was a lead form. Sign-up is open now, so the
 * three links it hid are the product's conversion path and its way back in for
 * an existing customer. They render on every deployment.
 *
 * It was never access control: `/sign-in` resolved whether or not anything
 * linked to it. What governs who may get an account is Clerk's sign-up mode in
 * the dashboard, not this file.
 *
 * `deployEnvironment` stays — it is the honest reading of `VERCEL_ENV` and the
 * next environment-shaped decision should build on it rather than on
 * `process.env` read at the point of use.
 */
