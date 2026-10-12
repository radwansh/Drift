"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDays, formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualAbsencesProps {
  summary: AnnualSummary | null;
  onCategorise?: () => void;
}

export function AnnualAbsences({ summary, onCategorise }: AnnualAbsencesProps) {
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
  const pctOfGross = gross !== 0 ? (amount / gross) * 100 : null;

  const hasAbsenceMapped =
    amount !== 0 ||
    days !== null ||
    summary.departments.some((d) => d.absencesDays > 0 || d.absencesAmount !== 0);

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
        {!hasAbsenceMapped ? (
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p>
              No absence columns are mapped. Categorise a component such as
              &quot;Absence Days&quot; or &quot;Unpaid Leave&quot; as an absence to see absence cost here.
            </p>
            {/* The message was shown but the button to act on it was missing
                (spec item 4d, finding U-table). */}
            {onCategorise && (
              <Button size="sm" variant="outline" onClick={onCategorise}>
                Categorise components
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Absence deductions</span>
              <span className="whitespace-nowrap text-right tabular-nums">
                {formatMoney(amount, summary.currency)}
                <span className="ml-2 text-muted-foreground">{formatPct(pctOfGross)} of gross</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Absence days mapped</span>
              {/* One shared formatter, at most one decimal: the raw sum printed
                  as "44.540000000000006 days" (finding U3). */}
              <span className="whitespace-nowrap text-right tabular-nums">
                {days !== null ? formatDays(days) : "Not mapped"}
              </span>
            </div>
            {byDepartment.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Top departments</p>
                <div className="space-y-2">
                  {byDepartment.map((d) => (
                    <div key={d.department} className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate text-muted-foreground">{d.department}</span>
                      <span className="whitespace-nowrap text-right tabular-nums">
                        {d.absencesDays > 0 ? `${formatDays(d.absencesDays)} · ` : ""}
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
