import { Badge, type BadgeProps } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

const statusVariantMap: Record<string, BadgeProps["variant"]> = {
  processing: "info",
  pending: "info",
  ready: "success",
  completed: "success",
  connected: "success",
  active: "success",
  error: "destructive",
  failed: "destructive",
  disconnected: "warning",
  inactive: "warning",
  paused: "warning",
};

const statusLabelMap: Record<string, string> = {
  processing: "Processing",
  pending: "Pending",
  ready: "Ready",
  completed: "Completed",
  connected: "Connected",
  active: "Active",
  error: "Error",
  failed: "Failed",
  disconnected: "Disconnected",
  inactive: "Inactive",
  paused: "Paused",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const variant = statusVariantMap[normalized] ?? "outline";
  const label = statusLabelMap[normalized] ?? status;

  return <Badge variant={variant}>{label}</Badge>;
}
