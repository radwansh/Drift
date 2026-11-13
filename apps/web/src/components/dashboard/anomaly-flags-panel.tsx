"use client";

import {
  Badge,
  EmptyState,
  Panel,
  SEVERITY_ORDER,
  SeverityBadge,
  type Severity,
} from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";

interface AnomalyFlag {
  employeeId: string;
  employeeName: string;
  type: string;
  severity: Severity;
  description: string;
}

interface AnomalyFlagsPanelProps {
  anomalies?: AnomalyFlag[];
}

/** "net_change_beyond_tolerance" -> "Net change beyond tolerance". Sentence case, no caps. */
function typeLabel(type: string): string {
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Anomaly flags for a comparison (redesign canvas: Dashboard, right of the summary).
 *
 * Severity by meaning (see components/cv/severity-badge.tsx): an impossible figure is
 * danger, a change over a threshold is signal ("Review"), a new or removed component is
 * neutral information. Critical first.
 *
 * The rows are not buttons any more: the old ones logged to the console and went
 * nowhere, which is a control that lies. Linking a row to the Employee File is a product
 * decision (that page is limited to admins and managers), so it is left for later.
 */
export function AnomalyFlagsPanel({ anomalies }: AnomalyFlagsPanelProps) {
  const sorted = anomalies
    ? [...anomalies].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : null;

  return (
    <Panel
      headingId="flags-h"
      compact
      title="Anomaly flags"
      actions={
        sorted ? (
          <Badge tone={sorted.length > 0 ? "signal" : "neutral"}>
            {sorted.length} {sorted.length === 1 ? "flag" : "flags"}
          </Badge>
        ) : undefined
      }
      className="flex flex-col"
    >
      {!sorted ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-3/4" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          bare
          title="No changes above your thresholds"
          description="Nothing in this comparison crossed a threshold or produced an impossible figure."
        />
      ) : (
        <ul className="m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0">
          {sorted.map((flag, index) => (
            <li
              key={`${flag.employeeId}-${flag.type}-${index}`}
              className="flex flex-col gap-1 border-b border-cv-line py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={flag.severity} />
                <span className="text-sm font-semibold leading-5 text-cv-ink">
                  {flag.employeeName}
                </span>
                <span className="text-xs leading-4 text-cv-ink-subtle">{typeLabel(flag.type)}</span>
              </div>
              <p className="m-0 text-sm leading-5 text-cv-ink-muted">{flag.description}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
