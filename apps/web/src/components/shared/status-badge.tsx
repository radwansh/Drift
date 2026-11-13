import { Badge, DriftStrip, type BadgeTone } from "@/components/cv";
import type { IconName } from "@/components/cv";

/**
 * Status of a payroll period, an upload or an integration, as a design-system badge:
 * always a word, with an icon where it helps (status colours never stand alone).
 *
 *   processing, pending  -> neutral, with a small scanning drift strip
 *   ready, completed, connected, active, reconciled -> success
 *   disconnected, inactive, paused, not_reconciled  -> warning
 *   error, failed        -> danger
 */
interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS: Record<string, { tone: BadgeTone; label: string; icon?: IconName; busy?: boolean }> =
  {
    processing: { tone: "neutral", label: "Processing", busy: true },
    pending: { tone: "neutral", label: "Pending", busy: true },
    ready: { tone: "success", label: "Ready", icon: "check" },
    completed: { tone: "success", label: "Completed", icon: "check" },
    connected: { tone: "success", label: "Connected", icon: "check" },
    active: { tone: "success", label: "Active", icon: "check" },
    reconciled: { tone: "success", label: "Reconciled", icon: "check-circle" },
    not_reconciled: { tone: "warning", label: "Does not reconcile", icon: "alert" },
    error: { tone: "danger", label: "Error", icon: "x-circle" },
    failed: { tone: "danger", label: "Failed", icon: "x-circle" },
    disconnected: { tone: "warning", label: "Disconnected", icon: "alert" },
    inactive: { tone: "warning", label: "Inactive" },
    paused: { tone: "warning", label: "Paused" },
  };

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const s = STATUS[normalized];
  if (!s) {
    return (
      <Badge tone="neutral" className={className}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {s.busy && <DriftStrip count={4} size="xs" animate="scan" />}
      {s.label}
    </Badge>
  );
}
