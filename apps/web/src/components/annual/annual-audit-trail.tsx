"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * Audit trail (step 46).
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
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Change history
          </CardTitle>
          <CardDescription>
            Category and budget changes, with who made them and when.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been changed yet. Category and budget edits will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    {ENTITY_LABELS[e.entity] ?? e.entity}
                  </Badge>
                  <span className="font-medium">
                    {e.entity === "component_category" ? formatComponentName(e.entityKey) : e.entityKey}
                  </span>
                  <span className="text-muted-foreground">
                    {describe(e.entity, e.oldValue)} → {describe(e.entity, e.newValue)}
                  </span>
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                    {e.userName ?? e.userEmail ?? "unknown user"} ·{" "}
                    {new Date(e.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
