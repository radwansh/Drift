"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualAbsencesProps {
  summary: AnnualSummary | null;
}

export function AnnualAbsences({ summary }: AnnualAbsencesProps) {
  if (!summary) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Absences</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const amount = summary.categories.byCategory.absence_deduction ?? 0;
  const days = summary.quantities.absence_days ?? null;
  const gross = summary.bridge.actual.gross;
  const pct = gross !== 0 ? formatPct((amount / gross) * 100) : "—";

  const hasAbsenceMapped =
    amount !== 0 ||
    days !== null ||
    summary.departments.some((d) => d.absencesDays > 0 || d.absencesAmount !== 0) ||
    summary.categories.uncategorisedKeys.some((k) => /absence|leave|unpaid|lwop|no pay|lateness|sick/i.test(k));

  const byDepartment = [...summary.departments]
    .filter((d) => d.absencesDays > 0 || d.absencesAmount !== 0)
    .sort((a, b) => b.absencesDays - a.absencesDays || Math.abs(b.absencesAmount) - Math.abs(a.absencesAmount))
    .slice(0, 5);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Absences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAbsenceMapped && amount === 0 && days === null ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No absence columns mapped. Categorise a component such as "Absence Days" or "Unpaid Leave" as an
            absence to see absence cost here.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Absence deductions (to date)</span>
              <span className="tabular-nums text-right whitespace-nowrap">
                {formatMoney(amount, summary.currency)}
                <span className="text-muted-foreground ml-2">{pct} of gross</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Absence days mapped</span>
              <span className="tabular-nums text-right whitespace-nowrap" title={days !== null ? `${days} days` : "Not mapped"}>
                {days !== null ? `${days} days` : "Not mapped"}
              </span>
            </div>
            {byDepartment.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Top departments</p>
                <div className="space-y-2">
                  {byDepartment.map((d) => (
                    <div key={d.department} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-muted-foreground truncate">{d.department}</span>
                      <span className="tabular-nums text-right whitespace-nowrap">
                        {d.absencesDays > 0 ? `${d.absencesDays} days · ` : ""}
                        {formatMoney(d.absencesAmount, summary.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}