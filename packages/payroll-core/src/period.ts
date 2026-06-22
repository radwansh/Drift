import type { PeriodBoundaries } from "./types";

export function getPeriodBoundaries(
  periodType: "monthly" | "weekly" | "bi_monthly" | "bi_weekly",
  year: number,
  month: number,
  weekNumber?: number,
): PeriodBoundaries {
  switch (periodType) {
    case "monthly":
      return getMonthlyBoundaries(year, month);
    case "weekly":
      if (weekNumber === undefined) throw new Error("weekNumber is required for weekly period type");
      return getWeeklyBoundaries(year, weekNumber);
    case "bi_monthly":
      return getBiMonthlyBoundaries(year, month, weekNumber ?? 1);
    case "bi_weekly":
      if (weekNumber === undefined) throw new Error("weekNumber is required for bi_weekly period type");
      return getBiWeeklyBoundaries(year, weekNumber);
  }
}

function getMonthlyBoundaries(year: number, month: number): PeriodBoundaries {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const label = formatDateLabel(start, end, "monthly");
  return { periodType: "monthly", start, end, label };
}

function getWeeklyBoundaries(year: number, weekNumber: number): PeriodBoundaries {
  const firstJan = new Date(year, 0, 1);
  const daysOffset = (weekNumber - 1) * 7;
  const firstJanDay = firstJan.getDay();
  const mondayOffset = firstJanDay === 0 ? -6 : 1 - firstJanDay;
  const monday = new Date(year, 0, 1 + mondayOffset + daysOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  if (monday.getFullYear() > year) {
    monday.setFullYear(year);
  }

  const label = formatDateLabel(monday, sunday, "weekly");
  return { periodType: "weekly", start: monday, end: sunday, label };
}

function getBiMonthlyBoundaries(year: number, month: number, half: number): PeriodBoundaries {
  if (half === 1) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month - 1, 15, 23, 59, 59, 999);
    const label = formatDateLabel(start, end, "bi_monthly");
    return { periodType: "bi_monthly", start, end, label };
  }

  const start = new Date(year, month - 1, 16);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const label = formatDateLabel(start, end, "bi_monthly");
  return { periodType: "bi_monthly", start, end, label };
}

function getBiWeeklyBoundaries(year: number, biWeekNumber: number): PeriodBoundaries {
  const firstJan = new Date(year, 0, 1);
  const firstJanDay = firstJan.getDay();
  const mondayOffset = firstJanDay === 0 ? -6 : 1 - firstJanDay;

  const startWeekDay = (biWeekNumber - 1) * 14;
  const monday = new Date(year, 0, 1 + mondayOffset + startWeekDay);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 13);
  sunday.setHours(23, 59, 59, 999);

  if (monday.getFullYear() > year) {
    monday.setFullYear(year);
  }

  const label = formatDateLabel(monday, sunday, "bi_weekly");
  return { periodType: "bi_weekly", start: monday, end: sunday, label };
}

function formatDateLabel(
  start: Date,
  end: Date,
  type: string,
): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(start)} to ${fmt(end)} (${type})`;
}
