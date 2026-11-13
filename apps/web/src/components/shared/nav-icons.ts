import {
  BarChart3,
  CalendarRange,
  Columns3,
  Layers,
  Plug,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The sidebar's icon registry, as component references rather than elements.
 *
 * Icons follow the redesign canvas: Employee File = users, Dashboard = chart,
 * Annual salaries = calendar range, Detailed View = columns, Payroll periods = layers,
 * Integrations = plug, Settings = gear. Lucide, drawn at the design system's 1.75 stroke
 * (globals.css sets `svg.lucide { stroke-width: 1.75 }`), 20px in the menu.
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
  Users,
  BarChart3,
  CalendarRange,
  Columns3,
  Layers,
  Plug,
  Settings,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
