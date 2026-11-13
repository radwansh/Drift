import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

/**
 * Badge — a small label with a tone.
 *
 * - neutral: facts with no judgement ("Actual", "Active", "Routine", "0 flags").
 * - signal: a flagged change above the customer's threshold. Square rust mark, rust ink.
 * - accent: selection or a link-like state. Rare.
 * - success / warning / danger: system status (Ready, Reconciled; a data warning; an
 *   error or an impossible figure). Always with a word, and an icon where it helps.
 *
 * Danger is crimson and kept far from rust: a change is not an error.
 */

export type BadgeTone = "neutral" | "signal" | "accent" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-cv-surface-sunken text-cv-ink-muted",
  signal: "bg-cv-signal-soft text-cv-signal-ink",
  accent: "bg-cv-accent-soft text-cv-accent",
  success: "bg-cv-success-soft text-cv-success-ink",
  warning: "bg-cv-warning-soft text-cv-warning-ink",
  danger: "bg-cv-danger-soft text-cv-danger-ink",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** The square mark. On by default for `signal` without an icon. */
  dot?: boolean;
  icon?: IconName;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function Badge({ tone = "neutral", dot, icon, className, title, children }: BadgeProps) {
  const showDot = dot ?? (tone === "signal" && !icon);
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-cv-sm px-2 font-cv-sans text-xs font-semibold leading-4 tracking-[0.01em]",
        TONES[tone],
        className,
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 flex-none", tone === "signal" ? "bg-cv-signal" : "bg-current")}
        />
      )}
      {icon && <Icon name={icon} size={12} strokeWidth={2} />}
      {children}
    </span>
  );
}
