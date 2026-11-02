import {
  LayoutDashboard,
  Table,
  Calendar,
  CalendarRange,
  Plug,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The sidebar's icon registry, as component references rather than elements.
 *
 * This was an inline `Record<string, React.ReactNode>` inside `sidebar.tsx`,
 * which is the trap the Employee File spec names in section 1.3: the lookup is
 * a literal, so a `NAV_ITEMS` entry whose `icon` string is not a key renders
 * **no icon and no error**. Nothing catches that — not typecheck, not lint, not
 * a reviewer skimming the diff.
 *
 * It is a plain `.ts` module so a test can assert every `NAV_ITEMS` icon is a
 * key of it. `apps/web/tsconfig.json` sets `jsx: "preserve"`, so a test
 * importing JSX from a `.tsx` file would fail to parse at runtime — keeping the
 * registry free of JSX is what makes the check mechanical rather than a
 * convention.
 *
 * `satisfies` rather than an annotation, so `keyof typeof NAV_ICONS` stays the
 * literal key union instead of collapsing to `string`.
 */
export const NAV_ICONS = {
  LayoutDashboard,
  Table,
  Calendar,
  CalendarRange,
  Plug,
  Settings,
  Users,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
