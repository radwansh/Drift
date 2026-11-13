"use client";

import { UserButton } from "@clerk/nextjs";
import { Bell } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSidebar } from "@/lib/sidebar-context";
import { getClerkAppearance } from "@/lib/clerk-appearance";
import { Icon } from "@/components/cv";
import { ThemeToggle, useIsDark } from "./theme-toggle";

/**
 * The app's top bar (redesign canvas: every app board).
 *
 * 64px, `surface` with a `line` hairline below. Left: the menu button (phones and
 * tablets) and the company's name. Right: theme, notifications, the account menu.
 * The page's own title lives in its PageHeader, not here — the bar used to say
 * "Welcome, <name>", which repeated on every page and named nothing on screen.
 *
 * The company name comes from `settings.getCompany`. This bar is the only caller: the
 * Settings page looks like it would run the same query, but every field there is
 * `useState` seeded with a literal and it has never called the router at all. So the
 * staleTime below is what keeps this to one request per session, not a cache entry shared
 * with another page. If the query fails (no company yet), the bar simply shows no name.
 */
export function Navbar() {
  const { toggle, isOpen } = useSidebar();
  const isDark = useIsDark();
  const company = trpc.settings.getCompany.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const companyName = company.data?.name ?? null;

  return (
    <header className="sticky top-0 z-20 flex h-16 flex-none items-center gap-2 border-b border-cv-line bg-cv-surface px-4 font-cv-sans lg:px-8">
      <button
        type="button"
        onClick={toggle}
        aria-label="Open menu"
        aria-controls="app-sidebar"
        aria-expanded={isOpen}
        className="inline-flex h-10 w-10 items-center justify-center rounded-cv-md text-cv-ink-muted hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      {companyName && (
        <span className="truncate text-sm font-semibold leading-5 text-cv-ink">{companyName}</span>
      )}

      <span className="flex-1" />

      <ThemeToggle />
      <button
        type="button"
        aria-label="Notifications"
        className="inline-flex h-10 w-10 items-center justify-center rounded-cv-md text-cv-ink-muted hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="ml-1 flex items-center">
        <UserButton afterSignOutUrl="/login" appearance={getClerkAppearance(isDark)} />
      </div>
    </header>
  );
}
