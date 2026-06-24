"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { useSidebar } from "@/lib/sidebar-context";
import {
  LayoutDashboard,
  Table,
  Calendar,
  Plug,
  Settings,
  BarChart3,
  X,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-5 w-5" />,
  Table: <Table className="h-5 w-5" />,
  Calendar: <Calendar className="h-5 w-5" />,
  Plug: <Plug className="h-5 w-5" />,
  Settings: <Settings className="h-5 w-5" />,
};

export function Sidebar() {
  const pathname = usePathname();
  const section = "/" + (pathname.split("/")[1] ?? "");
  const { isOpen, close } = useSidebar();

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
                <h2 className="text-lg font-bold">Drift</h2>
                <p className="text-xs text-white/60">Payroll Variance Analysis</p>
              </div>
            </div>
            <button onClick={close} className="rounded p-1 text-white/60 hover:text-white lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = section === item.href;
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
                  {iconMap[item.icon]}
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
