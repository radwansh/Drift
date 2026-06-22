import { z } from "zod";
import { CurrencyCode, PeriodType, DateRange } from "./common";

export const ColumnMapping = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  sourceColumn: z.string(),
  mappedComponent: z.string(),
  isEmployeeId: z.boolean().default(false),
  isEmployeeName: z.boolean().default(false),
  isDepartment: z.boolean().default(false),
  isGrossSalary: z.boolean().default(false),
  isNetSalary: z.boolean().default(false),
  isAiSuggested: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type ColumnMapping = z.infer<typeof ColumnMapping>;

export const ColumnMappingSuggestion = z.object({
  sourceColumn: z.string(),
  suggestedComponent: z.string(),
  confidence: z.number().min(0).max(1),
  isEmployeeId: z.boolean().default(false),
  isEmployeeName: z.boolean().default(false),
  isDepartment: z.boolean().default(false),
  isGrossSalary: z.boolean().default(false),
  isNetSalary: z.boolean().default(false),
});
export type ColumnMappingSuggestion = z.infer<typeof ColumnMappingSuggestion>;

export const UploadFlowRequest = z.object({
  filename: z.string(),
  fileBuffer: z.instanceof(ArrayBuffer).optional(),
  periodType: PeriodType,
  dateRange: DateRange,
  currencyCode: CurrencyCode,
  columnMappings: z.array(z.object({
    sourceColumn: z.string(),
    mappedComponent: z.string(),
    isEmployeeId: z.boolean().default(false),
    isEmployeeName: z.boolean().default(false),
    isDepartment: z.boolean().default(false),
    isGrossSalary: z.boolean().default(false),
    isNetSalary: z.boolean().default(false),
  })),
  skipMappingForFutureUploads: z.boolean().default(false),
});
export type UploadFlowRequest = z.infer<typeof UploadFlowRequest>;

export const UploadValidationError = z.object({
  row: z.number().int().optional(),
  column: z.string().optional(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
});
export type UploadValidationError = z.infer<typeof UploadValidationError>;

export const UploadValidationResult = z.object({
  valid: z.boolean(),
  totalRows: z.number().int(),
  errors: z.array(UploadValidationError),
  warnings: z.array(UploadValidationError),
  totalGross: z.number(),
  totalNet: z.number(),
  employeeCount: z.number().int(),
  detectedCurrency: CurrencyCode.nullable(),
});
export type UploadValidationResult = z.infer<typeof UploadValidationResult>;

export const ColumnMappingSave = z.object({
  companyId: z.string().uuid(),
  mappings: z.array(z.object({
    sourceColumn: z.string(),
    mappedComponent: z.string(),
    isEmployeeId: z.boolean().default(false),
    isEmployeeName: z.boolean().default(false),
    isDepartment: z.boolean().default(false),
    isGrossSalary: z.boolean().default(false),
    isNetSalary: z.boolean().default(false),
    isAiSuggested: z.boolean().default(false),
  })),
});
export type ColumnMappingSave = z.infer<typeof ColumnMappingSave>;
