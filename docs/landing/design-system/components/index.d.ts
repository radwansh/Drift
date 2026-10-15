import type * as React from 'react';

export type IconName = 'arrow-up' | 'arrow-down' | 'arrow-right' | 'minus' | 'chevron-down' | 'info' | 'check-circle' | 'alert' | 'x-circle' | 'upload' | 'search' | 'download'
  | 'check' | 'globe' | 'lock' | 'layers' | 'shield-check' | 'users' | 'ban' | 'trash' | 'mail' | 'menu' | 'x' | 'columns' | 'chart';

/** Actions. Ink `primary` at most once per view in the app; `accent` (cobalt) for the website's sign-up CTA; `secondary` and `ghost` for everything else; `danger` only to confirm a destructive step. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** A destination: renders a real <a href> with the same look (sign-up, sign-in, anchors, mailto). */
  href?: string;
  /** Icon before the label (16px). */
  iconLeft?: IconName;
  /** Icon after the label, e.g. 'arrow-right' on a marketing CTA. */
  iconRight?: IconName;
  /** Square icon button: pass `iconLeft` and an `aria-label` (or a string child, used as the label). */
  iconOnly?: boolean;
  /** Replaces the left icon with a scanning drift strip and sets aria-busy. */
  loading?: boolean;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): React.ReactElement;

/** A labelled single-line input. The label is required; hint or error sits below. */
export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Replaces the hint and marks the field invalid. */
  error?: React.ReactNode;
  /** Short affix inside the field, e.g. '€' or 'EMP-'. */
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Geist Mono with tabular figures, for amounts, IDs and codes. */
  mono?: boolean;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface SegmentedOption { value: string; label: React.ReactNode }
/** Two to five mutually exclusive views or settings, e.g. the payroll cadence. */
export interface SegmentedControlProps {
  options: Array<SegmentedOption | string>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  label?: string;
  'aria-label'?: string;
  className?: string;
}
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

/** One or two words of status. Tone carries meaning, never decoration. */
export interface BadgeProps {
  tone?: 'neutral' | 'signal' | 'accent' | 'success' | 'warning' | 'danger';
  /** Square dot before the label; on by default for `signal` without an icon. */
  dot?: boolean;
  /** 12px icon before the label, e.g. severity chips: 'alert' Warning, 'info' Info, 'search' Data check. */
  icon?: IconName;
  className?: string;
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): React.ReactElement;

/** A signed change between two payroll periods: arrow, amount, optional percentage. */
export interface VarianceProps {
  /** The absolute change (current minus previous). Its sign sets the direction. */
  value: number;
  /** The relative change in percent, e.g. 3.2 for +3.2%. */
  percent?: number;
  /** ISO 4217 code, e.g. 'EUR'. Omit for plain numbers. */
  currency?: string;
  locale?: string;
  decimals?: number;
  /** Override the direction (e.g. 'flat' for a change below the noise threshold). */
  direction?: 'up' | 'down' | 'flat';
  /** Marks an unexpected change with the signal tint and square. */
  flagged?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}
export declare function Variance(props: VarianceProps): React.ReactElement;

/** A KPI card: label, hero figure, and how it moved since the previous period. */
export interface StatProps {
  label: React.ReactNode;
  /** Pre-formatted figure, e.g. '€1,284,906'. */
  value: React.ReactNode;
  variance?: VarianceProps;
  /** Context after the variance, e.g. 'vs March 2026'. */
  caption?: React.ReactNode;
  className?: string;
}
export declare function Stat(props: StatProps): React.ReactElement;

/** An inline message about the page or a task. Danger notices are announced as alerts. */
export interface NoticeProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}
export declare function Notice(props: NoticeProps): React.ReactElement;

/** The signature device: a baseline of ticks with one drifted tick in signal rust. */
export interface DriftStripProps {
  count?: number;
  /** Index of the drifted tick; defaults to 70% along. */
  drift?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** 'lift' animates the drifted tick into place once; 'scan' is the loading state. */
  animate?: false | 'lift' | 'scan';
  /** Accessible name; without it the strip is decorative. */
  label?: string;
  className?: string;
}
export declare function DriftStrip(props: DriftStripProps): React.ReactElement;

/** The Clarivo logo as inline SVG. */
export interface LogoProps {
  variant?: 'lockup' | 'mark' | 'wordmark';
  /** auto: follows `ink` and `signal` tokens (flips in Dark). brand: fixed Ink. reversed: white for dark grounds. mono: currentColor only. */
  tone?: 'auto' | 'brand' | 'reversed' | 'mono';
  height?: number;
  title?: string;
  className?: string;
}
export declare function Logo(props: LogoProps): React.ReactElement;

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; title?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

declare global {
  interface Window {
    Clarivo: {
      Button: typeof Button; TextField: typeof TextField; SegmentedControl: typeof SegmentedControl; Badge: typeof Badge;
      Variance: typeof Variance; Stat: typeof Stat; Notice: typeof Notice; DriftStrip: typeof DriftStrip; Logo: typeof Logo; Icon: typeof Icon;
    };
  }
}
