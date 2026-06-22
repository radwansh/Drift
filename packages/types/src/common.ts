import { z } from "zod";

export const PeriodType = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);
export type PeriodType = z.infer<typeof PeriodType>;

export const CurrencyCode = z.enum([
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY",
  "INR", "BRL", "MXN", "SGD", "HKD", "NZD", "SEK", "NOK",
  "DKK", "ZAR", "AED", "SAR", "TRY", "PLN", "RUB", "KRW",
]);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const PeriodStatus = z.enum(["processing", "ready", "error"]);
export type PeriodStatus = z.infer<typeof PeriodStatus>;

export const ComparisonStatus = z.enum(["running", "completed", "error"]);
export type ComparisonStatus = z.infer<typeof ComparisonStatus>;

export const ExportFormat = z.enum(["pdf", "xlsx", "csv"]);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportStatus = z.enum(["pending", "processing", "completed", "error"]);
export type ExportStatus = z.infer<typeof ExportStatus>;

export const Role = z.enum(["admin", "manager", "viewer"]);
export type Role = z.infer<typeof Role>;

export const DataSource = z.enum(["upload", "integration"]);
export type DataSource = z.infer<typeof DataSource>;

export const Severity = z.enum(["info", "warning", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const EmployeeStatus = z.enum(["unchanged", "increased", "decreased", "new", "departed"]);
export type EmployeeStatus = z.infer<typeof EmployeeStatus>;

export const Pagination = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof Pagination>;

export const DateRange = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DateRange = z.infer<typeof DateRange>;
