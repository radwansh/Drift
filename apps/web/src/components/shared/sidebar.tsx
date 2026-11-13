"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/constants";
import type { PlanId } from "@/lib/plans";
import { useSidebar } from "@/lib/sidebar-context";
import { NAV_ICONS, type NavIconName } from "./nav-icons";
import { BarChart3, X } from "lucide-react";

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
   * Passed explicitly rather than defaulted, because omitting it means "do not
   * gate on plan" — see `visibleNavItems`.
   */
  plan: PlanId | null;
}

export function Sidebar({ role, plan }: SidebarProps) {
  const pathname = usePathname();
  const section = "/" + (pathname.split("/")[1] ?? "");
  const { isOpen, close } = useSidebar();
  // Active state needs no change for the new entry: this compares the first
  // path segment, so /employees/E0002 highlights /employees.
  const items = visibleNavItems(role, plan);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={close}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground transition-transform duration-200",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              <div>
                <h2 className="text-lg font-bold">Clarivo</h2>
                <p className="text-xs text-white/60">Payroll Variance Analysis</p>
              </div>
            </div>
            <button onClick={close} className="rounded p-1 text-white/60 hover:text-white lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {items.map((item) => {
              const isActive = section === item.href;
              const Icon = NAV_ICONS[item.icon as NavIconName] as
                | (typeof NAV_ICONS)[NavIconName]
                | undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/20 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 px-6 py-4">
            <p className="text-xs text-white/40">v1.0.0</p>
          </div>
        </div>
      </aside>
    </>
  );
}
