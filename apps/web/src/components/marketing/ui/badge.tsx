import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

/**
 * Badge — one or two words of status. Ported from bundle.css (`.cv-badge`).
 *
 * Tone carries meaning, never decoration. The severity chips on the alerts
 * section pair a tone with an icon AND a word, which is what keeps colour from
 * being the only signal.
 */

type Tone = "neutral" | "signal" | "accent" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-cv-surface-sunken text-cv-ink-muted",
  signal: "bg-cv-signal-soft text-cv-signal-ink",
  accent: "bg-cv-accent-soft text-cv-accent",
  success: "bg-cv-success-soft text-cv-success-ink",
  warning: "bg-cv-warning-soft text-cv-warning-ink",
  danger: "bg-cv-danger-soft text-cv-danger-ink",
};

export interface BadgeProps {
  tone?: Tone;
  /** Square dot before the label. On by default for `signal` without an icon. */
  dot?: boolean;
  icon?: IconName;
  className?: string;
  children?: React.ReactNode;
}

export function Badge({ tone = "neutral", dot, icon, className, children }: BadgeProps) {
  const showDot = dot ?? (tone === "signal" && !icon);

  return (
    <span
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
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}
