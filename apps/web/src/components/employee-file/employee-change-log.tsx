"use client";

import type { ChangeLogEntry, ChangeLogKind } from "@saas/payroll-core";
import { Badge, Panel, Variance } from "@/components/cv";
import { formatComponentName } from "@/components/annual/annual-utils";
import { describeChangeLogValue } from "@/components/employee-file/employee-file-text";

/**
 * The change log (step E5, spec 4.6), on Ink & Signal (canvas board "Employee
 * File: one person").
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
 *
 * The movement itself is a `<Variance>`, which is where the sign, the arrow and
 * the direction colour come from — and its `format` is the **same**
 * kind-aware function, so the FTE case cannot regress into money by taking the
 * design system's default. `Variance` hands `format` the absolute value and
 * adds the sign itself.
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
    <Panel
      headingId="employee-change-log-h"
      title="What changed, and when"
      description="Derived from consecutive uploaded periods. A movement at or below the currency's smallest unit is not a change — an FTE is a ratio, so it is measured against a fixed 0.001 instead — and nothing here states a cause."
    >
      <ol className="m-0 list-none space-y-3 p-0">
        {entries.map((entry, index) => (
          <li
            key={`${entry.kind}-${entry.key ?? ""}-${entry.toIndex}-${index}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-cv-line pb-3 text-sm leading-5 last:border-b-0 last:pb-0"
          >
            <Badge tone="neutral">{KIND_LABELS[entry.kind]}</Badge>
            <span className="font-medium text-cv-ink">
              {entry.fromSlot ? `${entry.fromSlot} → ${entry.toSlot}` : entry.toSlot}
            </span>
            {entry.key && (
              <span className="text-cv-ink-muted">{formatComponentName(entry.key)}</span>
            )}
            <span className="cv-num text-cv-ink">
              {describeChangeLogValue(entry.previous, entry.kind, currency)} →{" "}
              {describeChangeLogValue(entry.current, entry.kind, currency)}
            </span>
            {entry.absolute !== null && (
              <Variance
                value={entry.absolute}
                percent={entry.percentage}
                format={(absolute) => describeChangeLogValue(absolute, entry.kind, currency)}
              />
            )}
            {entry.spansGap && (
              <span className="text-xs leading-4 text-cv-ink-subtle">
                between {entry.fromSlot} and {entry.toSlot} ({entry.gapLabels.join(", ")} not
                uploaded)
              </span>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
