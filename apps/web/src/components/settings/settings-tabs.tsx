"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The Settings tab row (canvas boards "Settings: company / column mappings /
 * users / plan and billing", screen 8 of the Ink & Signal rebuild).
 *
 * Four routes that read as one screen. Before this, each of the four pages drew
 * its own `h2` and there was nothing on any of them linking to the other three
 * — the only way to reach column mappings, users or billing was a URL, because
 * the side menu has a single "Settings" entry pointing at `/settings`. Three of
 * the four pages were unreachable by clicking.
 *
 * Links, not `Tabs`: these are four routes, and the design system reserves the
 * segmented control for state within one page. `aria-current="page"` marks the
 * open one, so the underline is not the only thing saying where you are.
 *
 * Exact path matching rather than `startsWith`, since `/settings` is a prefix of
 * all three others and would otherwise light up on every one of them.
 */

const SETTINGS_TABS = [
  { href: "/settings", label: "Company" },
  { href: "/settings/column-mappings", label: "Column mappings" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/billing", label: "Plan and billing" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="border-b border-cv-line">
      <ul className="m-0 flex list-none flex-wrap items-center gap-6 p-0">
        {SETTINGS_TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 text-sm leading-5 no-underline transition-colors",
                  "focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
                  current
                    ? "border-cv-ink font-semibold text-cv-ink"
                    : "border-transparent font-medium text-cv-ink-muted hover:text-cv-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
