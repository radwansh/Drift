"use client";

import type { EmployeeFileResult } from "@saas/payroll-core";
import { Badge, Panel, SeverityBadge } from "@/components/cv";
import { formatMoney } from "@/components/annual/annual-utils";
import { KPI_SUPPRESSION_LABELS } from "@/components/employee-file/employee-file-text";

/**
 * The exceptions list (step E5, spec 4.7), on Ink & Signal (canvas board
 * "Employee File: one person").
 *
 * The anomaly flags for **every** consecutive covered-slot pair in range, not
 * only the latest pair — a breach that happened in March is what somebody is
 * investigating in November.
 *
 * Two absences are deliberate. There is **no "no anomalies — all clear"
 * badge**: on a file where half the periods were never uploaded, "all clear" is
 * false, and the coverage line at the top is the honest label. And the
 * zero-valued-component rule is not here: it produced 3,166 flags across the
 * twelve `samples/2025` registers, all one rule, none actionable.
 *
 * Severity goes through `SeverityBadge`, the one mapping the whole app uses:
 * critical is danger (an impossible figure), warning is signal and reads
 * "Review" (a movement worth a look), info is neutral.
 */
export function EmployeeExceptions({ file }: { file: EmployeeFileResult }) {
  const anomalies = file.flags.filter((flag) => flag.source === "anomaly");
  const counts = file.kpis.exceptions;

  return (
    <Panel
      headingId="employee-exceptions-h"
      title="Exceptions"
      description={
        <>
          Movements beyond the thresholds in use, computed between every pair of uploaded periods in
          range.{" "}
          {file.tolerancesSource === "company"
            ? "Thresholds come from this company's settings."
            : "Thresholds are the product defaults, because this company has set none."}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm leading-5">
          {counts.ok ? (
            <>
              <Badge
                tone={counts.value.critical > 0 ? "danger" : "neutral"}
                icon={counts.value.critical > 0 ? "x-circle" : undefined}
              >
                {counts.value.critical} critical
              </Badge>
              <Badge tone={counts.value.warning > 0 ? "signal" : "neutral"}>
                {counts.value.warning} warning
              </Badge>
              <Badge tone="neutral">{counts.value.info} info</Badge>
              <span className="text-cv-ink-muted">
                Reconciliation breaches are counted here too, and listed above with their figures.
              </span>
            </>
          ) : (
            <span className="text-cv-ink-muted">{KPI_SUPPRESSION_LABELS[counts.reason]}</span>
          )}
        </div>

        {anomalies.length === 0 ? (
          <p className="m-0 text-sm leading-5 text-cv-ink-muted">
            No movement beyond those thresholds between the periods uploaded for this range. That is
            a statement about the periods that are here, not about the year.
          </p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0 text-sm leading-5">
            {anomalies.map((flag, index) => (
              <li
                key={`${flag.type}-${flag.slotIndex}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-cv-line pb-2 last:border-b-0 last:pb-0"
              >
                <SeverityBadge severity={flag.severity} />
                {flag.slotLabel && (
                  <span className="font-medium text-cv-ink">{flag.slotLabel}</span>
                )}
                <span className="text-cv-ink">{flag.description}</span>
                {flag.difference !== null && (
                  <span className="cv-num text-cv-ink-muted">
                    {formatMoney(flag.difference, file.currency)}
                  </span>
                )}
                {flag.spansGap && (
                  <span className="text-xs leading-4 text-cv-ink-subtle">
                    computed across a period nobody uploaded
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
