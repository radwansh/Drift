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
import { INTEGRATION_PLANS, type PlanId } from "./plans";

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
  /**
   * Absent means every plan includes the item. Present means only these plans
   * do.
   *
   * **A separate axis from `roles`, not an extension of it.** A role is who
   * the person is and a plan is what the company bought: an admin on the free
   * plan and a viewer on Enterprise are each entitled to something the other
   * is not, so one list cannot express both. Overloading `roles` with plan ids
   * would also put them through `canReadPayDetail`, which is a predicate about
   * people.
   */
  plans?: readonly PlanId[];
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
 *
 * Integrations carries `plans` instead: the connectors are an Enterprise
 * capability, and `INTEGRATION_PLANS` is the same list
 * `(main)/integrations/page.tsx` gates itself with. Nothing in the app sets a
 * company's plan, so in practice this hides the entry from everyone — which is
 * the intent while the page advertises connectors that do not exist.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Employee File", href: "/employees", icon: "Users", roles: PAY_DETAIL_ROLES },
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Annual Salaries", href: "/annual-salaries", icon: "CalendarRange" },
  { label: "Detailed View", href: "/detailed", icon: "Table" },
  { label: "Payroll Periods", href: "/payroll-periods", icon: "Calendar" },
  { label: "Integrations", href: "/integrations", icon: "Plug", plans: INTEGRATION_PLANS },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

/**
 * The items a given role, on a given plan, may see.
 *
 * **This filtering is cosmetic.** The real controls are `payDetailProcedure` on
 * every employee-level procedure and the server-side role check on the page
 * itself. Hiding a link stops nobody from typing the URL, so do not later
 * "simplify" the procedure check away on the grounds that the link is hidden.
 * The same goes for the plan axis: `(main)/integrations/page.tsx` gates itself,
 * and direct navigation to it states why rather than 404ing.
 *
 * An unresolved role — `null`, because the lookup failed — sees only the
 * ungated items. A lookup failure must hide the link rather than show a broken
 * one. `null` for the plan means the same thing and does the same.
 *
 * **`plan` omitted is not the same as `null`.** Omitted means the caller knows
 * nothing about plans, and then the plan axis does not filter at all — which
 * is the one-argument contract four assertions in
 * `test/employee-file-ui.test.ts` pin, and is safe because the page is the
 * real gate. Every caller in the app passes a plan: `(main)/layout.tsx`
 * resolves it with the role, from one lookup.
 */
export function visibleNavItems(
  role: string | null | undefined,
  plan?: PlanId | null,
): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.roles && !(role !== null && role !== undefined && item.roles.includes(role))) {
      return false;
    }
    if (item.plans && plan !== undefined && !(plan !== null && item.plans.includes(plan))) {
      return false;
    }
    return true;
  });
}
