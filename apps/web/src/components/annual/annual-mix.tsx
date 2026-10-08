"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualMixProps {
  summary: AnnualSummary | null;
}

export function AnnualMix({ summary }: AnnualMixProps) {
  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Fixed vs Variable Pay</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    );
  }

  const mix = summary.mix;
  const gross = summary.bridge.actual.gross;
  const fixedShare = gross !== 0 ? (mix.fixed / gross) * 100 : null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Fixed vs Variable Pay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground truncate">Fixed (base + allowance + other earnings)</span>
            <span className="tabular-nums text-right whitespace-nowrap">{[formatPct(fixedShare)]}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground truncate">Variable (bonus + commission + overtime)</span>
            <span className="tabular-nums text-right whitespace-nowrap">{formatPct(mix.variablePayShare)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground truncate">Overtime as % of base salary</span>
            <span className="tabular-nums text-right whitespace-nowrap">{formatPct(mix.overtimePctOfBase)}</span>
          </div>
        </div>
        <div className="flex h-2.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
          {gross !== 0 && mix.fixed !== 0 && (
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max((mix.fixed / gross) * 100, 1)}%` }}
            />
          )}
          {gross !== 0 && mix.variable !== 0 && (
            <div
              className="h-full bg-primary/40"
              style={{ width: `${Math.max((mix.variable / gross) * 100, 1)}%` }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Fixed {formatMoney(mix.fixed, summary.currency)} · Variable {formatMoney(mix.variable, summary.currency)} ·
          Gross to date {formatMoney(gross, summary.currency)}
        </p>
      </CardContent>
    </Card>
  );
}