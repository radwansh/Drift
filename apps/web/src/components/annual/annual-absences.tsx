"use client";

import type { AnnualSummary } from "@saas/payroll-core";
import { Button, EmptyState, Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDays, formatMoney, formatPct } from "@/components/annual/annual-utils";

interface AnnualAbsencesProps {
  summary: AnnualSummary | null;
  onCategorise?: () => void;
}

export function AnnualAbsences({ summary, onCategorise }: AnnualAbsencesProps) {
  if (!summary) {
    return (
      <Panel compact headingId="annual-absences-h" title="Absences">
        <Skeleton className="h-40 w-full" />
      </Panel>
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
    .sort(
      (a, b) =>
        b.absencesDays - a.absencesDays || Math.abs(b.absencesAmount) - Math.abs(a.absencesAmount),
    )
    .slice(0, 5);

  return (
    <Panel compact headingId="annual-absences-h" title="Absences">
      {!hasAbsenceMapped ? (
        <EmptyState
          bare
          title="No absence columns are mapped"
          description={
            'Categorise a component such as "Absence Days" or "Unpaid Leave" as an absence to see absence cost here.'
          }
          /* The message was shown but the button to act on it was missing
             (spec item 4d, finding U-table). */
          action={
            onCategorise ? (
              <Button size="sm" variant="secondary" onClick={onCategorise}>
                Categorise components
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm leading-5 text-cv-ink-muted">Absence deductions</span>
            <span className="whitespace-nowrap text-right">
              <span className="cv-num text-cv-ink">{formatMoney(amount, summary.currency)}</span>
              <span className="ml-2 text-xs leading-4 text-cv-ink-subtle">
                {formatPct(pctOfGross)} of gross
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm leading-5 text-cv-ink-muted">Absence days mapped</span>
            {/* One shared formatter, at most one decimal: the raw sum printed
                as "44.540000000000006 days" (finding U3). Days are not money,
                so they never go through formatMoney. */}
            <span className="cv-num text-cv-ink">
              {days !== null ? formatDays(days) : "Not mapped"}
            </span>
          </div>
          {byDepartment.length > 0 && (
            <div>
              <p className="m-0 mb-2 text-xs leading-4 text-cv-ink-subtle">Top departments</p>
              <div className="flex flex-col gap-2">
                {byDepartment.map((d) => (
                  <div
                    key={d.department}
                    className="flex items-center justify-between gap-4 text-sm leading-5"
                  >
                    <span className="truncate text-cv-ink-muted">{d.department}</span>
                    <span className="cv-num text-cv-ink">
                      {d.absencesDays > 0 ? `${formatDays(d.absencesDays)} · ` : ""}
                      {formatMoney(d.absencesAmount, summary.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
