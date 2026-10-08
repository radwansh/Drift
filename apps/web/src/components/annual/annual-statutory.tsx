"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualStatutoryProps {
  summary: AnnualSummary | null;
}

export function AnnualStatutory({ summary }: AnnualStatutoryProps) {
  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Taxes and Social Security</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-36 w-full" />
        </CardContent>
      </Card>
    );
  }

  const cat = summary.categories.byCategory;
  const incomeTax = cat.income_tax ?? 0;
  const employeeSS = cat.social_security_employee ?? 0;
  const employerContributions = summary.statutory.employerOnCostTotal;
  const total = incomeTax + employeeSS + employerContributions;
  const gross = summary.bridge.actual.gross;

  const segments = [
    { label: "Income tax", amount: incomeTax, portion: gross > 0 ? incomeTax / gross : 0 },
    { label: "Employee SS", amount: employeeSS, portion: gross > 0 ? employeeSS / gross : 0 },
    { label: "Employer contributions", amount: employerContributions, portion: gross > 0 ? employerContributions / gross : 0 },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Taxes and Social Security</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground truncate">{s.label}</span>
              <span className="tabular-nums text-right whitespace-nowrap">
                {formatMoney(s.amount, summary.currency)}
                <span className="text-muted-foreground ml-2">{formatPct(s.portion * 100)}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t pt-3 text-sm font-medium">
            <span className="truncate">Total statutory to date</span>
            <span className="tabular-nums text-right whitespace-nowrap">{formatMoney(total, summary.currency)}</span>
          </div>
        </div>

        <div className="flex h-2.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
          {segments.map((s, i) =>
            s.amount !== 0 ? (
              <div
                key={s.label}
                className="h-full"
                style={{
                  width: `${Math.max(s.portion * 100, 1)}%`,
                  backgroundColor:
                    i === 0
                      ? "hsl(var(--primary))"
                      : i === 1
                        ? "hsl(var(--primary)/0.6)"
                        : "hsl(var(--primary)/0.35)",
                }}
              />
            ) : null,
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Effective income tax rate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatPct(summary.statutory.effectiveTaxRate)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Employer on-cost rate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatPct(summary.statutory.employerOnCostRate)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}