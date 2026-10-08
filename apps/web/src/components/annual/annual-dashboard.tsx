"use client";

import { YearSelector } from "@/components/annual/year-selector";

export function AnnualDashboard({
  initialYear,
  availableYears,
}: {
  initialYear: number;
  availableYears: number[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Annual Salaries Dashboard</h2>
          <p className="text-muted-foreground mt-1">Calendar-year payroll totals and forecast</p>
        </div>
        <YearSelector initialYear={initialYear} availableYears={availableYears} />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <p className="text-muted-foreground text-sm">Selected year: {initialYear}</p>
        <p className="text-muted-foreground text-sm">Content arrives in Stage 4</p>
      </div>
    </div>
  );
}