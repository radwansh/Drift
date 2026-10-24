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
  currentGross: number | null;
  previousGross: number | null;
  currentNet: number | null;
  previousNet: number | null;
  grossDelta: number | null;
  netDelta: number | null;
  status: "unchanged" | "increased" | "decreased" | "new" | "departed";
  anomalyFlags: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    description: string;
  }> | null;
}

/** A period-over-period money total and its movement. */
export interface PeriodTotal {
  previous: number;
  current: number;
  absolute: number;
  percentage: number | null;
}

export interface AggregatedSummary {
  /**
   * The headline figure, and it is **net** — what actually left the bank.
   *
   * It used to be the sum of every mapped component, which is neither gross nor
   * net: with positive deduction columns it came to gross plus total
   * deductions, running 42% above the true net movement on the sample
   * registers while being labelled "total payroll" by the dashboard, the AI
   * narrative and the audit summary. `totalNet` carries the same movement with
   * both period figures beside it; this stays because several consumers read
   * it, and it is now the same number.
   */
  totalPayrollVariance: { absolute: number; percentage: number | null };
  /** Net, summed from each employee's own net rather than from components. */
  totalNet: PeriodTotal;
  /** Gross, for anything costing the payroll rather than paying it. */
  totalGross: PeriodTotal;
  /**
   * Employees whose gross or net was absent, so the totals above exclude them.
   * A null figure must never read as zero — that is how a wrong total hides.
   * Counted per side, so one employee missing both counts twice.
   */
  incompleteTotals: { grossMissing: number; netMissing: number };
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
