import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "MMM dd, yyyy");
}

export function formatDateRange(start: string, end: string): string {
  return `${format(parseISO(start), "MMM dd")} – ${format(parseISO(end), "MMM dd, yyyy")}`;
}

export function formatPeriodLabel(periodType: string, start: string, end: string): string {
  switch (periodType) {
    case "monthly":
      return format(parseISO(start), "MMMM yyyy");
    case "weekly":
      return `Week of ${format(parseISO(start), "MMM dd")}`;
    case "bi_monthly": {
      const day = parseInt(start.split("-")[2] ?? "1");
      return day <= 15 ? `Early ${format(parseISO(start), "MMMM yyyy")}` : `Late ${format(parseISO(start), "MMMM yyyy")}`;
    }
    case "bi_weekly":
      return `${format(parseISO(start), "MMM dd")} – ${format(parseISO(end), "MMM dd, yyyy")}`;
    default:
      return formatDateRange(start, end);
  }
}
