"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge, Button, Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { formatComponentName } from "@/components/annual/annual-utils";

const ENTITY_LABELS: Record<string, string> = {
  component_category: "Category",
  annual_budget: "Budget",
};

function describe(entity: string, value: unknown): string {
  if (value === null || value === undefined) return "removed";
  if (typeof value === "object") {
    const v = value as { category?: string; amount?: number; basis?: string };
    if (entity === "component_category") return v.category ?? "—";
    if (entity === "annual_budget") {
      return v.amount !== undefined ? `${v.amount}${v.basis ? ` (${v.basis})` : ""}` : "—";
    }
  }
  return String(value);
}

/**
 * Audit trail (step 46), on Ink & Signal.
 *
 * Company-wide settings are editable by any admin or manager, and a
 * recategorisation moves money between every bucket on the dashboard, so the
 * changes have to be attributable after the fact.
 */
export function AnnualAuditTrail() {
  const [open, setOpen] = useState(false);
  const query = trpc.annual.auditTrail.useQuery({ limit: 50 }, { enabled: open });
  const entries = query.data?.entries ?? [];

  return (
    <Panel
      compact
      headingId="annual-audit-h"
      title={
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-cv-ink-subtle" aria-hidden="true" />
          Change history
        </span>
      }
      description="Category and budget changes, with who made them and when."
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      {open &&
        (query.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="m-0 text-sm leading-5 text-cv-ink-muted">
            Nothing has been changed yet. Category and budget edits will appear here.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-cv-line p-0">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-sm leading-5"
              >
                <Badge tone="neutral" className="shrink-0">
                  {ENTITY_LABELS[e.entity] ?? e.entity}
                </Badge>
                <span className="font-medium text-cv-ink">
                  {e.entity === "component_category"
                    ? formatComponentName(e.entityKey)
                    : e.entityKey}
                </span>
                <span className="text-cv-ink-muted">
                  {describe(e.entity, e.oldValue)} → {describe(e.entity, e.newValue)}
                </span>
                <span className="ml-auto whitespace-nowrap text-xs leading-4 text-cv-ink-subtle">
                  {e.userName ?? e.userEmail ?? "unknown user"} ·{" "}
                  {new Date(e.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Panel>
  );
}
