import { Badge, type BadgeTone } from "./badge";
import type { IconName } from "./icon";

/**
 * SeverityBadge — one mapping from the engine's severities to the design system, used by
 * every surface that shows an anomaly or a summary severity (Dashboard flags panel, AI
 * summary, Detailed View rows, Annual warnings).
 *
 * Mapped by MEANING, from packages/payroll-core/src/anomaly-detector.ts:
 *
 *   critical  negative_net, net_exceeds_gross: an impossible figure, i.e. an error.
 *             -> danger (crimson), x-circle, "Critical".
 *   warning   net_change_beyond_tolerance, base_rate_change, employer_contribution_missing:
 *             a change above a threshold, worth a second look.
 *             -> signal (rust, square mark), "Review".
 *   info      new_component_with_value, component_removed_with_value: a fact.
 *             -> neutral, info icon, "Info".
 *
 * The AI summary's severities ride on the same scale: routine -> neutral "Routine",
 * review -> signal "Review", critical -> danger "Critical".
 */

export type Severity = "info" | "warning" | "critical";
export type SummarySeverity = "routine" | "review" | "critical";

const SEVERITY: Record<Severity, { tone: BadgeTone; icon?: IconName; label: string }> = {
  critical: { tone: "danger", icon: "x-circle", label: "Critical" },
  warning: { tone: "signal", label: "Review" },
  info: { tone: "neutral", icon: "info", label: "Info" },
};

const SUMMARY: Record<SummarySeverity, { tone: BadgeTone; icon?: IconName; label: string }> = {
  routine: { tone: "neutral", label: "Routine" },
  review: { tone: "signal", label: "Review" },
  critical: { tone: "danger", icon: "x-circle", label: "Critical" },
};

/** Sort key: critical first, then review, then info. */
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function severityLabel(severity: Severity): string {
  return SEVERITY[severity].label;
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity];
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {s.label}
    </Badge>
  );
}

export function SummarySeverityBadge({
  severity,
  className,
}: {
  severity: SummarySeverity;
  className?: string;
}) {
  const s = SUMMARY[severity];
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {s.label}
    </Badge>
  );
}
