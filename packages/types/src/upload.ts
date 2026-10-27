import { z } from "zod";
import { CurrencyCode, PeriodType, DateRange } from "./common";

/**
 * Step 9: the typed snapshot columns a register column can feed, beyond the
 * five identity roles below (employee id, name, department, gross, net).
 *
 * A closed set, and the strings are the column names on `employee_snapshots`,
 * so one definition serves the mapping UI, the zod schemas here, the upload
 * processor and the CHECK in migration 0010. It lives in this package because
 * everything depends on it and nothing may depend on `@saas/payroll-core`
 * without a cycle; `payroll-core/ingest.ts` re-exports it.
 */
export const SNAPSHOT_FIELDS = ["hire_date", "termination_date", "fte"] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export function isSnapshotField(value: unknown): value is SnapshotField {
  return typeof value === "string" && (SNAPSHOT_FIELDS as readonly string[]).includes(value);
}

/**
 * Step 9: the two roles the five booleans cannot express — the closed set
 * above, and a free-text dimension name for the open-ended ones (cost centre,
 * location, grade, contract type).
 *
 * Both nullish, so a client built before step 9 still validates. Mutually
 * exclusive in the database; the writer drops the dimension when a field is
 * set rather than letting the insert fail.
 */
export const ColumnRole = {
  snapshotField: z.enum(SNAPSHOT_FIELDS).nullish(),
  dimensionName: z.string().trim().min(1).max(100).nullish(),
};

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
  ...ColumnRole,
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
    ...ColumnRole,
    isAiSuggested: z.boolean().default(false),
  })),
});
export type ColumnMappingSave = z.infer<typeof ColumnMappingSave>;
