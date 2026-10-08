import { formatCurrency, formatComponentName } from "@/lib/utils";
import type { PeriodType } from "@saas/payroll-core";

export function formatMoney(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

export function formatCompact(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${currency} ${(amount / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${currency} ${(amount / 1_000).toFixed(1)}K`;
  return `${currency} ${Number(amount.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatAxisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return Number(value.toFixed(0)).toLocaleString("en-US");
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthShort(dateStr: string): string {
  const m = Number(dateStr.slice(5, 7));
  return MONTH_SHORT[(m - 1) % 12] ?? dateStr;
}

export function shortPeriodLabel(label: string, periodType: PeriodType | string): string {
  if (periodType === "monthly") return label.split(" ")[0] ?? label;
  if (periodType === "bi_monthly") {
    const parts = label.split(" ");
    return `${parts[0] ?? ""} ${parts[1] ?? ""}`.trim() || label;
  }
  return label;
}

export { formatComponentName };