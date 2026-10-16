/**
 * The Clarivo design-system components the landing page uses, ported to React
 * on the existing Tailwind setup.
 *
 * Only what the page needs: the hand-off's reference bundle also ships
 * TextField and Notice, which no marketing section uses, so they are left
 * unported rather than added speculatively.
 */
export { Badge, type BadgeProps } from "./badge";
export { Button, type ButtonProps } from "./button";
export { DriftStrip, type DriftStripProps } from "./drift-strip";
export { Icon, ICONS, type IconName, type IconProps } from "./icon";
export { Logo, type LogoProps } from "./logo";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./segmented-control";
export { Stat, type StatProps } from "./stat";
export { Variance, type VarianceProps } from "./variance";
