"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Whether the page is currently dark, once mounted.
 *
 * Reads `resolvedTheme`, not `theme`: with the default "system" theme, `theme` is
 * "system". Returns false until mounted, because the server cannot know the visitor's
 * theme and the first client render must match it.
 */
export function useIsDark(): boolean {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && resolvedTheme === "dark";
}

/**
 * Light / dark switch for the top bar.
 *
 * The old toggle compared `theme === "dark"`, so on a machine already dark (theme
 * "system") the first click set "dark" and appeared to do nothing.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();
  const isDark = useIsDark();
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-cv-md text-cv-ink-muted transition-colors",
        "hover:bg-cv-surface-sunken hover:text-cv-ink focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
