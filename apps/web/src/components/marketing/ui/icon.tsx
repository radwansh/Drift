/**
 * Clarivo design-system Icon.
 *
 * The paths are copied verbatim from
 * docs/landing/design-system/components/bundle.js (`ICONS`). The README is
 * explicit about porting them rather than substituting another icon set: the
 * 20x20 grid, 1.75 stroke and round caps are what make them sit correctly
 * against the type, and lucide's 24x24 geometry does not match.
 *
 * Server component — no state, no effects, so it renders statically.
 */

/** Shared circle for the icons drawn inside a ring. */
const RING = "M10 1.75a8.25 8.25 0 1 1 0 16.5a8.25 8.25 0 1 1 0-16.5z";

export const ICONS = {
  "arrow-up": ["M10 16V4", "M5 9l5-5 5 5"],
  "arrow-down": ["M10 4v12", "M5 11l5 5 5-5"],
  "arrow-right": ["M4 10h12", "M11 5l5 5-5 5"],
  minus: ["M4.5 10h11"],
  "chevron-down": ["M5 7.5l5 5 5-5"],
  info: [RING, "M10 9v5", "M10 6.25v.01"],
  "check-circle": [RING, "M6.5 10.25l2.4 2.4 4.6-5.1"],
  alert: ["M10 2.75 1.75 17.25h16.5z", "M10 8v4.25", "M10 14.75v.01"],
  "x-circle": [RING, "M7.25 7.25l5.5 5.5", "M12.75 7.25l-5.5 5.5"],
  upload: [
    "M10 13V3.5",
    "M6 7.5l4-4 4 4",
    "M3.5 13v2.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V13",
  ],
  search: ["M8.75 2.5a6.25 6.25 0 1 1 0 12.5a6.25 6.25 0 1 1 0-12.5z", "M13.25 13.25 17.5 17.5"],
  download: [
    "M10 3.5V13",
    "M6 9l4 4 4-4",
    "M3.5 13v2.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V13",
  ],
  check: ["M4.5 10.5l3.5 3.5 7.5-8"],
  globe: [
    RING,
    "M1.75 10h16.5",
    "M10 1.75c2.4 2.3 3.6 5.05 3.6 8.25s-1.2 5.95-3.6 8.25c-2.4-2.3-3.6-5.05-3.6-8.25s1.2-5.95 3.6-8.25z",
  ],
  lock: [
    "M5 9h10a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z",
    "M6.75 9V6.5a3.25 3.25 0 0 1 6.5 0V9",
  ],
  layers: [
    "M10 2.5 2.5 6.25 10 10l7.5-3.75z",
    "M2.5 10 10 13.75 17.5 10",
    "M2.5 13.75 10 17.5l7.5-3.75",
  ],
  "shield-check": [
    "M10 2.25 3.75 4.75v4.6c0 4.1 2.65 7 6.25 8.4 3.6-1.4 6.25-4.3 6.25-8.4v-4.6z",
    "M7.25 10.25l1.9 1.9 3.6-4",
  ],
  users: [
    "M7.5 9.25a3 3 0 1 0 0-6a3 3 0 1 0 0 6z",
    "M2.25 17c.4-2.9 2.55-4.75 5.25-4.75s4.85 1.85 5.25 4.75",
    "M13 3.4a3 3 0 0 1 0 5.7",
    "M14.5 12.4c1.8.5 3 2.1 3.25 4.6",
  ],
  ban: [RING, "M4.2 4.2l11.6 11.6"],
  trash: ["M3.5 5.5h13", "M8 5.5V3.75h4V5.5", "M5 5.5l.75 11h8.5L15 5.5", "M8.5 8.75v5", "M11.5 8.75v5"],
  mail: [
    "M3 4.75h14a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75v-9A.75.75 0 0 1 3 4.75z",
    "M2.5 5.5 10 11l7.5-5.5",
  ],
  menu: ["M3 6h14", "M3 10h14", "M3 14h14"],
  x: ["M5 5l10 10", "M15 5 5 15"],
  columns: ["M3.25 3.25h13.5v13.5H3.25z", "M8 3.25v13.5", "M12.75 3.25v13.5"],
  chart: ["M3.25 16.75h13.5", "M6 13.5V9.5", "M10 13.5V5.5", "M14 13.5v-6"],
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Accessible name. Without it the icon is aria-hidden, which is the default. */
  title?: string;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.75, title, className }: IconProps) {
  const paths = ICONS[name] ?? ICONS.info;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
