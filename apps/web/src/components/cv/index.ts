/**
 * The Clarivo design-system library (Ink & Signal), for the app AND the marketing site.
 *
 * Import from "@/components/cv" in new code. components/marketing/ui re-exports this
 * module so the landing page keeps working unchanged.
 *
 * Core components (the design system's own ten, ported from its bundle):
 *   Button, TextField, SegmentedControl, Badge, Variance, Stat, Notice, DriftStrip,
 *   Logo, Icon
 * App building blocks (drawn on the redesign canvas, built from the core):
 *   PageHeader, Panel (+ PanelBar, PanelFoot), EmptyState, SeverityBadge
 *
 * shadcn/ui primitives stay in components/ui (Dialog, Select, DropdownMenu, Popover,
 * Tooltip, Tabs, Table, Checkbox...). They are re-skinned onto the same tokens, so use
 * them for behaviour the design system does not ship.
 */
export { Badge, type BadgeProps, type BadgeTone } from "./badge";
export { Button, buttonClasses, type ButtonProps } from "./button";
export { DriftStrip, type DriftStripProps } from "./drift-strip";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export { Icon, ICONS, type IconName, type IconProps } from "./icon";
export { Logo, type LogoProps } from "./logo";
export { Notice, type NoticeProps, type NoticeTone } from "./notice";
export { PageHeader, type PageHeaderProps } from "./page-header";
export { Panel, PanelBar, PanelFoot, type PanelProps } from "./panel";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./segmented-control";
export {
  SeverityBadge,
  SummarySeverityBadge,
  SEVERITY_ORDER,
  severityLabel,
  type Severity,
  type SummarySeverity,
} from "./severity-badge";
export { Stat, type StatProps } from "./stat";
export { TextField, type TextFieldProps } from "./text-field";
export { Variance, type VarianceProps } from "./variance";
