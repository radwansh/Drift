export const APP_NAME = "Clarivo";
export const APP_TAGLINE = "Payroll variance analysis, simplified";
/**
 * `COMPANY_EMPLOYEE_RANGES` was here, and `(main)/settings/page.tsx` was its
 * only consumer. The dropdown it filled was not persisted anywhere — see that
 * file for why the field was dropped rather than wired — so the list went with
 * it instead of becoming a constant nothing reads.
 */

export const PERIOD_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  bi_monthly: "Bi-Monthly (Twice a Month)",
  bi_weekly: "Bi-Weekly (Every 2 Weeks)",
};

import { PAY_DETAIL_ROLES } from "./roles";

export interface NavItem {
  label: string;
  href: string;
  /** Must be a key of `NAV_ICONS` in `components/shared/nav-icons.ts`. */
  icon: string;
  /**
   * Absent means every signed-in user sees the item. Present means only these
   * roles do.
   */
  roles?: readonly string[];
}

/**
 * Sidebar navigation. Employee File is first, above Dashboard.
 *
 * `NAV_ITEMS` had no gating at all, so every item rendered for every signed-in
 * user. That was harmless while no screen was role-restricted; a viewer who
 * sees an Employee File link gets a FORBIDDEN error on click, so gating has to
 * be introduced as part of that work.
 *
 * The other six entries deliberately gain no `roles`. Their current behaviour
 * is unchanged, and narrowing any of them is a separate product decision.
 *
 * `roles` on the Employee File entry comes from the same `PAY_DETAIL_ROLES` the
 * procedure enforces, so the link and the gate cannot disagree.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Employee File", href: "/employees", icon: "Users", roles: PAY_DETAIL_ROLES },
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Annual Salaries", href: "/annual-salaries", icon: "CalendarRange" },
  { label: "Detailed View", href: "/detailed", icon: "Table" },
  { label: "Payroll Periods", href: "/payroll-periods", icon: "Calendar" },
  { label: "Integrations", href: "/integrations", icon: "Plug" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

/**
 * The items a given role may see.
 *
 * **This filtering is cosmetic.** The real controls are `payDetailProcedure` on
 * every employee-level procedure and the server-side role check on the page
 * itself. Hiding a link stops nobody from typing the URL, so do not later
 * "simplify" the procedure check away on the grounds that the link is hidden.
 *
 * An unresolved role — `null`, because the lookup failed — sees only the
 * ungated items. A lookup failure must hide the link rather than show a broken
 * one.
 */
export function visibleNavItems(role: string | null | undefined): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return role !== null && role !== undefined && item.roles.includes(role);
  });
}
