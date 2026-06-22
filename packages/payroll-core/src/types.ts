export interface PeriodBoundaries {
  periodType: "monthly" | "weekly" | "bi_monthly" | "bi_weekly";
  start: Date;
  end: Date;
  label: string;
}

export interface EmployeeRecord {
  externalId: string;
  name: string;
  department: string | null;
  components: Record<string, number | null>;
  grossSalary: number;
  netSalary: number;
}

export interface MatchedPair {
  employeeExternalId: string;
  employeeName: string;
  department: string | null;
  current: EmployeeRecord | null;
  previous: EmployeeRecord | null;
  status: "unchanged" | "increased" | "decreased" | "new" | "departed";
}

export interface ComponentDelta {
  component: string;
  previousValue: number | null;
  currentValue: number | null;
  absoluteDiff: number | null;
  percentageDiff: number | null;
}

export interface ComparisonOutput {
  employeeExternalId: string;
  employeeName: string;
  department: string | null;
  currentComponents: Record<string, number | null>;
  previousComponents: Record<string, number | null>;
  componentDeltas: ComponentDelta[];
  grossDelta: number | null;
  netDelta: number | null;
  status: "unchanged" | "increased" | "decreased" | "new" | "departed";
  anomalyFlags: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    description: string;
  }> | null;
}

export interface AggregatedSummary {
  totalPayrollVariance: { absolute: number; percentage: number | null };
  employeesAffected: { total: number; increased: number; decreased: number; unchanged: number };
  newEmployees: number;
  departedEmployees: number;
  largestIncrease: { employeeName: string; department: string | null; amount: number } | null;
  largestDecrease: { employeeName: string; department: string | null; amount: number } | null;
  averageChange: { absolute: number; percentage: number | null };
  distribution: Array<{ label: string; count: number; color: string }>;
  componentBreakdown: Array<{ component: string; totalChange: number; employeeCount: number }>;
  departmentBreakdown: Array<{
    department: string; headcountCurrent: number; headcountPrevious: number;
    totalCurrent: number; totalPrevious: number; absoluteChange: number; percentageChange: number | null;
  }>;
  topMovers: Array<{
    employeeName: string; department: string | null;
    previousNet: number; currentNet: number; changeAmount: number; changePercentage: number | null;
  }>;
  anomalies: Array<{ employeeId: string; employeeName: string; type: string; severity: "info" | "warning" | "critical"; description: string }>;
}
