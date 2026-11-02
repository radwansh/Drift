/**
 * Role sets, in a module with no dependencies.
 *
 * `PAY_DETAIL_ROLES` is the authority for both halves of the Employee File's
 * access rule: `payDetailProcedure` in `server/trpc.ts` enforces it, and
 * `NAV_ITEMS` in `lib/constants.ts` hides the link from anyone it excludes.
 * Those two have to agree, so there is one array rather than two literals that
 * drift.
 *
 * It lives here rather than in `server/trpc.ts` because `lib/constants.ts` is
 * imported by `components/shared/sidebar.tsx`, which is a client component.
 * Importing `trpc.ts` from there would pull `@clerk/nextjs/server` and
 * `@neondatabase/serverless` into the client bundle. `trpc.ts` re-exports the
 * constant, so every server-side import path is unchanged.
 */

/** Roles that may change company-wide settings. Viewers are read-only. */
export const EDITOR_ROLES = ["admin", "manager"] as const;

/**
 * Roles that may read an individual's pay detail.
 *
 * Deliberately NOT EDITOR_ROLES, even though the two lists are identical today.
 * EDITOR_ROLES means "may change company-wide settings"; this means "may read
 * every salary in the company". Sharing the constant would make a later change
 * to who may set the budget silently change who may read every salary.
 */
export const PAY_DETAIL_ROLES = ["admin", "manager"] as const;

export type PayDetailRole = (typeof PAY_DETAIL_ROLES)[number];

/** Whether a role string — or an unresolved role — may read pay detail. */
export function canReadPayDetail(role: string | null | undefined): boolean {
  if (!role) return false;
  return PAY_DETAIL_ROLES.includes(role as PayDetailRole);
}
