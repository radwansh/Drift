"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { APP_RELEASE_LABEL, visibleNavItems } from "@/lib/constants";
import type { PlanId } from "@/lib/plans";
import { useSidebar } from "@/lib/sidebar-context";
import { Icon, Logo } from "@/components/cv";
import { NAV_ICONS, type NavIconName } from "./nav-icons";

export interface SidebarProps {
  /**
   * The caller's role, resolved by the layout. `null` when the lookup failed,
   * which hides every gated item — a failure must hide a link rather than show
   * a broken one.
   */
  role: string | null;
  /**
   * The plan the caller's company is on, from the same lookup. `null` when it
   * failed or holds a value the vocabulary does not recognise, and treated the
   * same way: the plan-gated items are hidden.
   *
   * Required, not optional. `visibleNavItems` has no "do not gate on plan"
   * value — an unknown plan closes the gate — so there is nothing for a
   * default to mean here.
   */
  plan: PlanId | null;
}

/**
 * The Ink side menu (redesign canvas: every app board).
 *
 * - 240px, fixed on desktop; a drawer with a scrim on phones and tablets.
 * - The menu is a dark region inside a light page, so it carries
 *   `data-cv-theme="dark"`: every cv- token inside it resolves to the Dark theme, which
 *   is exactly the menu's palette (ink text #ECEFF2, muted #B7BFC7, hover #1C2229,
 *   active #1A263F with a cobalt icon, hairline #282F36). In the app's dark theme the
 *   menu drops to the sunken ink with a hairline edge, as drawn on "Dashboard: dark".
 * - Lockup in white (`reversed`): the one rust element is the C's drifted segment.
 * - Active item: aria-current="page", accent-soft ground, cobalt icon, 600 weight.
 */
export function Sidebar({ role, plan }: SidebarProps) {
  const pathname = usePathname();
  const section = "/" + (pathname.split("/")[1] ?? "");
  const { isOpen, close } = useSidebar();
  // Active state compares the first path segment, so /employees/E0002 highlights
  // /employees and /settings/users highlights /settings. The plan axis needs no
  // change here either: `visibleNavItems` filters on both.
  const items = visibleNavItems(role, plan);

  // Escape closes the drawer on small screens.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  return (
    <>
      {isOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-cv-scrim lg:hidden"
          onClick={close}
        />
      )}
      <aside
        id="app-sidebar"
        data-cv-theme="dark"
        aria-label="Main"
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-60 flex-col gap-6 bg-cv-surface px-3 py-5 font-cv-sans text-cv-ink",
          "dark:border-r dark:border-cv-line dark:bg-cv-surface-sunken",
          "transition-transform duration-200 lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-cv-lg" : "-translate-x-full",
        )}
      >
        <div className="flex min-h-8 items-center justify-between gap-2">
          <Link
            href="/dashboard"
            onClick={close}
            className="flex min-h-8 items-center rounded-cv-md px-3 focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
          >
            <Logo variant="lockup" tone="reversed" height={26} title="Clarivo" />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-cv-md text-cv-ink-muted hover:bg-cv-surface-raised hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring lg:hidden"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {items.map((item) => {
              const isActive = section === item.href;
              const NavIcon = NAV_ICONS[item.icon as NavIconName] as
                | (typeof NAV_ICONS)[NavIconName]
                | undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-cv-md px-3 text-sm leading-5 no-underline transition-colors",
                      "focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
                      isActive
                        ? "bg-cv-accent-soft font-semibold text-cv-ink"
                        : "font-medium text-cv-ink-muted hover:bg-cv-surface-raised hover:text-cv-ink",
                    )}
                  >
                    {NavIcon ? (
                      <NavIcon
                        className={cn("h-5 w-5 flex-none", isActive && "text-cv-accent")}
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-cv-line px-3 pt-3 text-xs leading-4 text-cv-ink-subtle">
          {APP_RELEASE_LABEL}
        </div>
      </aside>
    </>
  );
}
