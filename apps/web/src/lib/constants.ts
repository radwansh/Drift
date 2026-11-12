export const APP_NAME = "Clarivo";
export const APP_TAGLINE = "Payroll variance analysis, simplified";
/** Shown at the foot of the side menu. */
export const APP_RELEASE_LABEL = "Clarivo 1.0 · Beta";
export const COMPANY_EMPLOYEE_RANGES = [
  { label: "1-50 employees", value: "1-50" },
  { label: "51-200 employees", value: "51-200" },
  { label: "201-500 employees", value: "201-500" },
  { label: "501-2000 employees", value: "501-2000" },
  { label: "2000+ employees", value: "2000+" },
] as const;

/**
 * The four cadences, in the product's words (design system, Voice and content):
 * Monthly, Bi-monthly, Bi-weekly, Weekly. The explanation of the two "bi-" cadences
 * moves to PERIOD_TYPE_HINTS so a select or segmented control can stay short.
 */
export const PERIOD_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  bi_monthly: "Bi-monthly",
  bi_weekly: "Bi-weekly",
  weekly: "Weekly",
};

export const PERIOD_TYPE_HINTS: Record<string, string> = {
  monthly: "Once a month",
  bi_monthly: "Twice a month",
  bi_weekly: "Every two weeks",
  weekly: "Every week",
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
 * Labels follow the design system: sentence case, with the product's own names kept
 * as names (Employee File, Dashboard, Detailed View).
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
  { label: "Dashboard", href: "/dashboard", icon: "BarChart3" },
  { label: "Annual salaries", href: "/annual-salaries", icon: "CalendarRange" },
  { label: "Detailed View", href: "/detailed", icon: "Columns3" },
  { label: "Payroll periods", href: "/payroll-periods", icon: "Layers" },
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
