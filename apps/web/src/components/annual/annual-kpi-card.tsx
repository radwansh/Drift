"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AnnualKpiCardProps {
  title: string;
  display: string;
  titleAttr: string;
  subtext?: string;
  icon?: LucideIcon;
}

export function AnnualKpiCard({ title, display, titleAttr, subtext, icon: Icon }: AnnualKpiCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p
              className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums truncate"
              title={titleAttr}
            >
              {display}
            </p>
            {subtext && (
              <p className="text-xs text-muted-foreground truncate" title={subtext}>
                {subtext}
              </p>
            )}
          </div>
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
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