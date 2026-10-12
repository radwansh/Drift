"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SCOPE_LABELS, type Scope } from "@/components/annual/annual-utils";

interface AnnualKpiCardProps {
  title: string;
  display: string;
  /** The full, unabbreviated value. Rendered as text, not only a hover title. */
  fullValue?: string;
  /**
   * Which period the headline covers. Required rather than optional: a figure
   * without a scope is what made "Total Employer Cost" read as an actual when it
   * was a full-year forecast (finding U5).
   */
  scope: Scope;
  subtext?: string;
  badge?: string;
  icon?: LucideIcon;
}

export function AnnualKpiCard({
  title,
  display,
  fullValue,
  scope,
  subtext,
  badge,
  icon: Icon,
}: AnnualKpiCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm text-muted-foreground">{title}</p>
              <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                {SCOPE_LABELS[scope]}
              </Badge>
            </div>
            <p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{display}</p>
            {/* The full value is text, because a touch screen cannot open a
                hover title (finding U5). */}
            {fullValue && fullValue !== display && (
              <p className="break-words text-xs tabular-nums text-muted-foreground">{fullValue}</p>
            )}
            {subtext && <p className="break-words text-xs text-muted-foreground">{subtext}</p>}
            {badge && (
              <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
                {badge}
              </Badge>
            )}
          </div>
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnnualKpiCardSkeleton() {
  return (
    <Card className="min-w-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}
