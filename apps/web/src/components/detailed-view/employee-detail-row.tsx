"use client";

import type { ComparisonOutput } from "@saas/payroll-core";
import { formatCurrency, formatPercentage, formatComponentName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface EmployeeDetailRowProps {
  data: ComparisonOutput;
}

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const severityColor = {
  info: "text-blue-500",
  warning: "text-amber-500",
  critical: "text-red-500",
};

export function EmployeeDetailRow({ data }: EmployeeDetailRowProps) {
  const grossTotalPrev = Object.values(data.previousComponents).reduce(
    (s: number, v) => s + (v ?? 0),
    0,
  );
  const grossTotalCurr = Object.values(data.currentComponents).reduce(
    (s: number, v) => s + (v ?? 0),
    0,
  );

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Component
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Previous
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Current
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Absolute &Delta;
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                % &Delta;
              </th>
            </tr>
          </thead>
          <tbody>
            {data.componentDeltas.map((delta) => (
              <tr key={delta.component} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{formatComponentName(delta.component)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {delta.previousValue !== null
                    ? formatCurrency(delta.previousValue)
                    : "\u2014"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {delta.currentValue !== null
                    ? formatCurrency(delta.currentValue)
                    : "\u2014"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    delta.absoluteDiff !== null
                      ? delta.absoluteDiff > 0
                        ? "text-green-600"
                        : delta.absoluteDiff < 0
                          ? "text-red-600"
                          : ""
                      : ""
                  }`}
                >
                  {delta.absoluteDiff !== null
                    ? `${delta.absoluteDiff > 0 ? "+" : ""}${formatCurrency(Math.abs(delta.absoluteDiff))}`
                    : "\u2014"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    delta.percentageDiff !== null
                      ? delta.percentageDiff > 0
                        ? "text-green-600"
                        : delta.percentageDiff < 0
                          ? "text-red-600"
                          : ""
                      : ""
                  }`}
                >
                  {delta.percentageDiff !== null
                    ? formatPercentage(delta.percentageDiff)
                    : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2">Components Total</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(grossTotalPrev ?? 0)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(grossTotalCurr ?? 0)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  data.grossDelta !== null
                    ? data.grossDelta > 0
                      ? "text-green-600"
                      : data.grossDelta < 0
                        ? "text-red-600"
                        : ""
                    : ""
                }`}
              >
                {data.grossDelta !== null
                  ? `${data.grossDelta > 0 ? "+" : ""}${formatCurrency(Math.abs(data.grossDelta))}`
                  : "\u2014"}
              </td>
              <td className="px-3 py-2 text-right"></td>
            </tr>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2">Net Salary &Delta;</td>
              <td className="px-3 py-2 text-right tabular-nums" colSpan={2}>
                {data.netDelta !== null
                  ? `${data.netDelta > 0 ? "+" : ""}${formatCurrency(data.netDelta)}`
                  : "\u2014"}
              </td>
              <td className="px-3 py-2 text-right"></td>
              <td className="px-3 py-2 text-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data.anomalyFlags && data.anomalyFlags.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            AI Anomaly Flags
          </h4>
          <div className="space-y-1.5">
            {data.anomalyFlags.map((flag, idx) => {
              const Icon = severityIcon[flag.severity];
              return (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${severityColor[flag.severity]}`}
                  />
                  <div>
                    <span className="font-medium capitalize">{flag.type.replace(/_/g, " ")}</span>
                    <p className="text-muted-foreground">{flag.description}</p>
                  </div>
                  <Badge
                    variant={
                      flag.severity === "critical"
                        ? "destructive"
                        : flag.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                    className="ml-auto shrink-0 capitalize"
                  >
                    {flag.severity}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
