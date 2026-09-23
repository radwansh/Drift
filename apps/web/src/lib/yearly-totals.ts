import type { EmployeeRecord } from "@saas/payroll-core";

export interface YearlyTotalsRow {
  year: number;
  periodCount: number;
  headcount: number;
  netTotal: number;
}

export interface YearlyTotalsInput {
  id: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  employees: EmployeeRecord[];
}

function yearOf(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

export function computeYearlyTotals(periods: YearlyTotalsInput[]): YearlyTotalsRow[] {
  const byYear = new Map<number, YearlyTotalsRow>();

  for (const period of periods) {
    const year = yearOf(period.dateFrom);
    let row = byYear.get(year);
    if (!row) {
      row = { year, periodCount: 0, headcount: 0, netTotal: 0 };
      byYear.set(year, row);
    }
    row.periodCount += 1;
    row.headcount += period.employees.length;

    let net = 0;
    for (const emp of period.employees) {
      net += emp.netSalary ?? 0;
    }
    row.netTotal = Math.round((row.netTotal + net) * 100) / 100;
  }

  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}
