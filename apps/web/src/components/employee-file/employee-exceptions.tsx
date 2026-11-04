"use client";

import type { EmployeeFileResult } from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/components/annual/annual-utils";
import { KPI_SUPPRESSION_LABELS } from "@/components/employee-file/employee-file-text";

/**
 * The exceptions list (step E5, spec 4.7).
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
 */
export function EmployeeExceptions({ file }: { file: EmployeeFileResult }) {
  const anomalies = file.flags.filter((flag) => flag.source === "anomaly");
  const counts = file.kpis.exceptions;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
        <CardDescription>
          Movements beyond the thresholds in use, computed between every pair of uploaded
          periods in range.{" "}
          {file.tolerancesSource === "company"
            ? "Thresholds come from this company's settings."
            : "Thresholds are the product defaults, because this company has set none."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {counts.ok ? (
            <>
              <Badge variant={counts.value.critical > 0 ? "destructive" : "outline"}>
                {counts.value.critical} critical
              </Badge>
              <Badge variant="outline">{counts.value.warning} warning</Badge>
              <Badge variant="outline">{counts.value.info} info</Badge>
              <span className="text-muted-foreground">
                Reconciliation breaches are counted here too, and listed above with their
                figures.
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {KPI_SUPPRESSION_LABELS[counts.reason]}
            </span>
          )}
        </div>

        {anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No movement beyond those thresholds between the periods uploaded for this range.
            That is a statement about the periods that are here, not about the year.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {anomalies.map((flag, index) => (
              <li
                key={`${flag.type}-${flag.slotIndex}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <Badge
                  variant={flag.severity === "critical" ? "destructive" : "outline"}
                  className="font-normal"
                >
                  {flag.severity}
                </Badge>
                {flag.slotLabel && <span className="font-medium">{flag.slotLabel}</span>}
                <span>{flag.description}</span>
                {flag.difference !== null && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(flag.difference, file.currency)}
                  </span>
                )}
                {flag.spansGap && (
                  <span className="text-xs text-muted-foreground">
                    computed across a period nobody uploaded
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
