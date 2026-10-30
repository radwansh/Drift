/**
 * Launch switches for the public marketing pages.
 *
 * One typed file so turning something on is a one-line, reviewable change.
 * Deliberately not environment variables: these are editorial decisions about
 * what the page may claim, and they belong in the diff where a reviewer sees
 * them (docs/landing/README.md, "Launch switches").
 *
 * The signed-in state is NOT here. It is decided per visitor by Clerk's
 * client-side components so the pages stay static.
 */

export interface LaunchSwitches {
  /**
   * The six Annual Salaries KPI tiles, the Data check alert card, and the
   * "Annual Salaries Dashboard" line under "Every plan includes".
   *
   * Off. The annual work is merged to main (PR #1, commit c63a707), but
   * docs/ANNUAL_PAGE_FIX_PLAN.md does not show every step done: step 8, the
   * browser walkthrough, is still outstanding — the signed-in annual pages
   * have never been looked at in a browser. Turn on once that is confirmed.
   */
  annualSalariesLive: boolean;

  /**
   * Four of the seven security points, one flag each. Each stays off until
   * its check is genuinely true; the other three (Encrypted, Kept separate,
   * No AI training) are unconditional and are not switched.
   */
  securityPoints: {
    /**
     * Vercel functions run in Frankfurt (fra1) AND the Neon database is in an
     * EU region.
     *
     * Both halves are pinned in the repo, because the copy this gates —
     * "stored and processed in the European Union" — is a data-protection
     * claim and a reader should be able to check it without a dashboard:
     *
     * - processed: `regions: ["fra1"]` in `vercel.json` at the repo root.
     *   Vercel's Root Directory is `.`, so that is the file it reads.
     * - stored: the Neon host in `DATABASE_URL` carries its region, and today
     *   it is `…c-4.eu-central-1.aws.neon.tech` — Frankfurt, the same AWS
     *   region as fra1.
     *
     * It was off while the functions ran in `iad1` (Washington D.C.) against
     * that EU database: the data was stored in the EU but processed in the US,
     * so half the sentence was false. Turning it on without pinning the region
     * would have published that claim to the page *and* to `/llms.txt`, where
     * an assistant repeats it to a buyer who never visits the site.
     *
     * If the region is ever unpinned, turn this off in the same commit.
     */
    hostedInTheEu: boolean;
    /** The Registration Form at /sign-up (Step 7) is live. */
    verifiedSignIn: boolean;
    /** The role checks from the annual-dashboard review have shipped. */
    accessByRole: boolean;
    /** Who handles deletion requests, and how fast, has been decided. */
    deletedOnRequest: boolean;
  };

  /** "Built by Radwan Sheb, …" above the final buttons. Approved. */
  founderLine: boolean;

  /**
   * On. The beta is closed, so every "Get early access" button opens the lead
   * form (`EarlyAccessButton`) instead of linking to /sign-up.
   *
   * A submission writes three places: a trial_requests row, a Zoho lead, and a
   * Clerk waitlist entry so the approval is one click. Clerk's own waitlist
   * holds an email and nothing else, which is why the lead fields need the
   * table and the CRM.
   *
   * Sign-up mode must be set to "Waitlist" in the Clerk dashboard
   * (Configure → Restrictions) for an invitation to be the only way in.
   *
   * Turn off the day the beta opens; all four buttons become /sign-up links
   * and the modal stops being mounted.
   */
  waitlistMode: boolean;
}

export const launch: LaunchSwitches = {
  annualSalariesLive: false,
  securityPoints: {
    hostedInTheEu: true,
    verifiedSignIn: false,
    accessByRole: false,
    deletedOnRequest: false,
  },
  founderLine: true,
  waitlistMode: true,
};
