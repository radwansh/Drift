import { z } from "zod";
import { CurrencyCode, ComparisonStatus, Severity, EmployeeStatus } from "./common";

export const ComponentDelta = z.object({
  component: z.string(),
  previousValue: z.number().nullable(),
  currentValue: z.number().nullable(),
  absoluteDiff: z.number().nullable(),
  percentageDiff: z.number().nullable(),
});
export type ComponentDelta = z.infer<typeof ComponentDelta>;

export const AnomalyFlag = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  type: z.enum([
    "large_change_no_explanation",
    "new_component",
    "removed_component",
    "duplicate_employee",
    "id_mismatch",
    "negative_salary",
    "missing_data",
    "unusual_department_change",
  ]),
  severity: Severity,
  description: z.string(),
});
export type AnomalyFlag = z.infer<typeof AnomalyFlag>;

export const ComparisonResult = z.object({
  id: z.string().uuid(),
  comparisonRunId: z.string().uuid(),
  employeeExternalId: z.string(),
  employeeName: z.string(),
  department: z.string().nullable(),
  currentComponents: z.record(z.string(), z.number().nullable()),
  previousComponents: z.record(z.string(), z.number().nullable()),
  componentDeltas: z.array(ComponentDelta),
  grossDelta: z.number().nullable(),
  netDelta: z.number().nullable(),
  status: EmployeeStatus,
  anomalyFlags: z.array(AnomalyFlag).nullable(),
  createdAt: z.string().datetime(),
});
export type ComparisonResult = z.infer<typeof ComparisonResult>;

export const ComparisonRun = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  currentPeriodId: z.string().uuid(),
  previousPeriodId: z.string().uuid(),
  status: ComparisonStatus,
  resultSummary: z.any().nullable(),
  aiNarrative: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ComparisonRun = z.infer<typeof ComparisonRun>;

export const DashboardSummary = z.object({
  totalPayrollVariance: z.object({
    absolute: z.number(),
    percentage: z.number().nullable(),
  }),
  employeesAffected: z.object({
    total: z.number().int(),
    increased: z.number().int(),
    decreased: z.number().int(),
    unchanged: z.number().int(),
  }),
  newEmployees: z.number().int(),
  departedEmployees: z.number().int(),
  largestIncrease: z.object({
    employeeName: z.string(),
    department: z.string().nullable(),
    amount: z.number(),
  }).nullable(),
  largestDecrease: z.object({
    employeeName: z.string(),
    department: z.string().nullable(),
    amount: z.number(),
  }).nullable(),
  averageChange: z.object({
    absolute: z.number(),
    percentage: z.number().nullable(),
  }),
  distribution: z.array(z.object({
    label: z.string(),
    count: z.number().int(),
    color: z.string(),
  })),
  componentBreakdown: z.array(z.object({
    component: z.string(),
    totalChange: z.number(),
    employeeCount: z.number().int(),
  })),
  departmentBreakdown: z.array(z.object({
    department: z.string(),
    headcountCurrent: z.number().int(),
    headcountPrevious: z.number().int(),
    totalCurrent: z.number(),
    totalPrevious: z.number(),
    absoluteChange: z.number(),
    percentageChange: z.number().nullable(),
  })),
  topMovers: z.array(z.object({
    employeeName: z.string(),
    department: z.string().nullable(),
    previousNet: z.number(),
    currentNet: z.number(),
    changeAmount: z.number(),
    changePercentage: z.number().nullable(),
  })),
  anomalies: z.array(AnomalyFlag),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;
