"use client";

import type { ChangeLogEntry, ChangeLogKind } from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatComponentName,
  formatSignedPct,
} from "@/components/annual/annual-utils";
import { describeChangeLogValue } from "@/components/employee-file/employee-file-text";

/**
 * The change log (step E5, spec 4.6).
 *
 * Derived, never stored. Every entry states **what moved, never why**: Clarivo
 * holds no reason codes, so "promotion", "merit review" and "cost-of-living
 * adjustment" are not in this vocabulary at all. A reader who needs the reason
 * has to ask a person, which is the honest outcome.
 *
 * An entry computed across a period nobody uploaded says so — "between Mar and
 * May (Apr not uploaded)" — because the movement is real but it is not one
 * period's movement.
 */

const KIND_LABELS: Record<ChangeLogKind, string> = {
  base_rate: "Base rate",
  allowance: "Allowance",
  component_added: "Component added",
  component_removed: "Component removed",
  department: "Department",
  dimension: "Dimension",
  name: "Name",
  fte: "FTE",
  currency: "Currency",
  cadence: "Cadence",
  first_appearance: "First appearance",
  last_appearance: "Last appearance",
};

/**
 * Values are formatted by **kind**, in `employee-file-text.ts`.
 *
 * Every numeric value used to go through `formatMoney`, and `fte` entries carry
 * ratios, so a part-time conversion printed as
 * `USD 1.00 → USD 0.50 (USD -0.50, -50.0%)`. The `absolute` in the
 * parenthetical was formatted unconditionally, so it was wrong even on an entry
 * whose two sides were not.
 */

export function EmployeeChangeLog({
  entries,
  currency,
}: {
  entries: readonly ChangeLogEntry[];
  currency: string;
}) {
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">What changed, and when</CardTitle>
        <CardDescription>
          Derived from consecutive uploaded periods. A movement at or below the
          currency&apos;s smallest unit is not a change — an FTE is a ratio, so it is
          measured against a fixed 0.001 instead — and nothing here states a cause.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {entries.map((entry, index) => (
            <li
              key={`${entry.kind}-${entry.key ?? ""}-${entry.toIndex}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-3 text-sm last:border-b-0 last:pb-0"
            >
              <Badge variant="outline" className="font-normal">
                {KIND_LABELS[entry.kind]}
              </Badge>
              <span className="font-medium">
                {entry.fromSlot ? `${entry.fromSlot} → ${entry.toSlot}` : entry.toSlot}
              </span>
              {entry.key && (
                <span className="text-muted-foreground">{formatComponentName(entry.key)}</span>
              )}
              <span className="tabular-nums">
                {describeChangeLogValue(entry.previous, entry.kind, currency)} →{" "}
                {describeChangeLogValue(entry.current, entry.kind, currency)}
              </span>
              {entry.absolute !== null && (
                <span className="tabular-nums text-muted-foreground">
                  ({describeChangeLogValue(entry.absolute, entry.kind, currency)}
                  {entry.percentage !== null && `, ${formatSignedPct(entry.percentage)}`})
                </span>
              )}
              {entry.spansGap && (
                <span className="text-xs text-muted-foreground">
                  between {entry.fromSlot} and {entry.toSlot} ({entry.gapLabels.join(", ")} not
                  uploaded)
                </span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
