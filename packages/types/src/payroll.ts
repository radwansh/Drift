import { z } from "zod";
import { CurrencyCode, PeriodType, PeriodStatus, DataSource, DateRange } from "./common";

export const SalaryComponent = z.record(z.string(), z.number().nullable());
export type SalaryComponent = z.infer<typeof SalaryComponent>;

export const PayrollPeriod = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  periodType: PeriodType,
  dateRange: DateRange,
  source: DataSource,
  sourceFilename: z.string().nullable(),
  currencyCode: CurrencyCode,
  status: PeriodStatus,
  totalEmployees: z.number().int().nonnegative(),
  totalGross: z.number().nonnegative(),
  totalNet: z.number().nonnegative(),
  rawFileKey: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PayrollPeriod = z.infer<typeof PayrollPeriod>;

export const CreatePayrollPeriod = z.object({
  companyId: z.string().uuid(),
  periodType: PeriodType,
  dateRange: DateRange,
  source: DataSource,
  sourceFilename: z.string().optional(),
  currencyCode: CurrencyCode,
  totalEmployees: z.number().int().nonnegative(),
  totalGross: z.number().nonnegative(),
  totalNet: z.number().nonnegative(),
});
export type CreatePayrollPeriod = z.infer<typeof CreatePayrollPeriod>;

export const EmployeeSnapshot = z.object({
  id: z.string().uuid(),
  payrollPeriodId: z.string().uuid(),
  employeeExternalId: z.string(),
  employeeName: z.string(),
  department: z.string().nullable(),
  components: SalaryComponent,
  grossSalary: z.number().nonnegative(),
  netSalary: z.number().nonnegative(),
  currencyCode: CurrencyCode,
  createdAt: z.string().datetime(),
});
export type EmployeeSnapshot = z.infer<typeof EmployeeSnapshot>;

export const UploadSession = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  status: PeriodStatus,
  filename: z.string(),
  fileKey: z.string(),
  periodType: PeriodType | null,
  dateRange: DateRange | null,
  currencyCode: CurrencyCode | null,
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UploadSession = z.infer<typeof UploadSession>;
