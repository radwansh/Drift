"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import {
  LayoutDashboard,
  Table,
  Calendar,
  Plug,
  Settings,
  BarChart3,
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

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar text-sidebar-foreground">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-white/10">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold">Drift</h2>
            <p className="text-xs text-white/60">Payroll Variance Analysis</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = section === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
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
  );
}
