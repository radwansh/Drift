import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currencyCode: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatComponentName(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatPercentage(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatChange(value: number | null): { text: string; className: string } {
  if (value === null || value === undefined) return { text: "—", className: "unchanged-text" };
  if (Math.abs(value) < 0.01) return { text: "0.00", className: "unchanged-text" };
  const sign = value > 0 ? "+" : "";
  const className = value > 0 ? "increase-text" : value < 0 ? "decrease-text" : "unchanged-text";
  return { text: `${sign}${value.toFixed(2)}`, className };
}

export function getSeverityBg(severity: string): string {
  switch (severity) {
    case "critical": return "anomaly-critical";
    case "warning": return "anomaly-warning";
    default: return "anomaly-info";
  }
}
