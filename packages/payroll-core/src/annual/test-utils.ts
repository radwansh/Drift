import type { AnnualPeriodInput, ComponentAggregate, PeriodType } from "./types";

export function pos(key: string, amount: number): ComponentAggregate {
  return { key, total: amount, negRows: 0, posRows: 1 };
}

export function neg(key: string, amount: number): ComponentAggregate {
  return { key, total: -amount, negRows: 1, posRows: 0 };
}

export function qty(key: string, count: number): ComponentAggregate {
  return { key, total: count, negRows: 0, posRows: 1 };
}

export function endOfMonth(year: number, month: number): string {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${month < 10 ? `0${month}` : month}-${days < 10 ? `0${days}` : days}`;
}

export function monthStart(year: number, month: number): string {
  return `${year}-${month < 10 ? `0${month}` : month}-01`;
}

export interface PeriodSpec {
  periodType?: PeriodType;
  periodStart: string;
  periodEnd: string;
  gross: number;
  net: number;
  components?: ComponentAggregate[];
  headcount?: number;
  employeeIds?: string[];
  createdAt?: string;
  currency?: string;
}

export function period(spec: PeriodSpec): AnnualPeriodInput {
  return {
    id: `p-${spec.periodStart}-${spec.periodEnd}`,
    periodType: spec.periodType ?? "monthly",
    currency: spec.currency ?? "USD",
    createdAt: spec.createdAt ?? `${spec.periodEnd}T12:00:00Z`,
    headcount: spec.headcount ?? 1,
    components: spec.components ?? [],
    employeeIds: spec.employeeIds ?? [],
    periodStart: spec.periodStart,
    periodEnd: spec.periodEnd,
    gross: spec.gross,
    net: spec.net,
  };
}

/** Build a monthly period for a given year/month with standard components. */
export function monthPeriod(
  year: number,
  month: number,
  overrides: Partial<Omit<PeriodSpec, "periodStart" | "periodEnd">> = {},
): AnnualPeriodInput {
  const start = monthStart(year, month);
  const end = endOfMonth(year, month);
  const base = {
    periodType: "monthly" as const,
    periodStart: start,
    periodEnd: end,
    gross: 1200,
    net: 1000,
    components: [pos("Base Salary", 1100), pos("Housing Allowance", 100), neg("Income Tax", 200)],
    headcount: 10,
  };
  return period({ ...base, ...overrides });
}

export function monthlyYear(year: number, months: number[]): AnnualPeriodInput[] {
  return months.map((m) => monthPeriod(year, m));
}