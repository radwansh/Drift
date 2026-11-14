export const APP_NAME = "Clarivo";
export const APP_TAGLINE = "Payroll variance analysis, simplified";
/** Shown at the foot of the side menu. */
export const APP_RELEASE_LABEL = "Clarivo 1.0 · Beta";

/**
 * `COMPANY_EMPLOYEE_RANGES` was here, and `(main)/settings/page.tsx` was its
 * only consumer. The dropdown it filled was not persisted anywhere — see that
 * file for why the field was dropped rather than wired — so the list went with
 * it instead of becoming a constant nothing reads.
 *
 * The redesign still carried the list, because it restyled that form while the
 * form was still five `useState` literals. The form is wired now and does not
 * offer the field, so the list stays gone.
 */

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
 *
 * Integrations carries `plans` instead: the connectors are an Enterprise
 * capability, and `INTEGRATION_PLANS` is the same list
 * `(main)/integrations/page.tsx` gates itself with. Nothing in the app sets a
 * company's plan, so in practice this hides the entry from everyone — which is
 * the intent while the page advertises connectors that do not exist.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Employee File", href: "/employees", icon: "Users", roles: PAY_DETAIL_ROLES },
  { label: "Dashboard", href: "/dashboard", icon: "BarChart3" },
  { label: "Annual salaries", href: "/annual-salaries", icon: "CalendarRange" },
  { label: "Detailed View", href: "/detailed", icon: "Columns3" },
  { label: "Payroll periods", href: "/payroll-periods", icon: "Layers" },
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
 * **`plan` is required, and there is no "don't filter" value.** It was briefly
 * optional, with an omitted plan skipping the plan axis entirely, so that four
 * one-argument assertions in `test/employee-file-ui.test.ts` kept passing
 * unedited. That made the default answer for a capability gate "show it" — a
 * caller who forgot the argument got Integrations back in the nav, and the
 * type checker had nothing to say about it. A gate whose default is open to
 * save a test file an edit is the wrong way round, so the argument is required
 * and those assertions name a plan. `null` is the value for "unknown", and it
 * closes the gate like every other unresolved lookup here.
 */
export function visibleNavItems(
  role: string | null | undefined,
  plan: PlanId | null,
): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.roles && !(role !== null && role !== undefined && item.roles.includes(role))) {
      return false;
    }
    if (item.plans && !(plan !== null && item.plans.includes(plan))) {
      return false;
    }
    return true;
  });
}
