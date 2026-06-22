import * as XLSX from "xlsx";

interface CompanyInfo {
  name: string;
  currencyCode: string;
}

interface AnomalyData {
  employeeId: string;
  employeeName: string;
  type: string;
  severity: string;
  description: string;
}

interface ComparisonData {
  periodLabel: string;
  previousPeriodLabel: string;
  summary: {
    totalPayrollVariance: { absolute: number; percentage: number | null };
    employeesAffected: { total: number; increased: number; decreased: number; unchanged: number };
    newEmployees: number;
    departedEmployees: number;
    largestIncrease: { employeeName: string; department: string | null; amount: number } | null;
    largestDecrease: { employeeName: string; department: string | null; amount: number } | null;
    averageChange: { absolute: number; percentage: number | null };
    componentBreakdown?: Array<{ component: string; totalChange: number; employeeCount: number }>;
    departmentBreakdown?: Array<{
      department: string; headcountCurrent: number; headcountPrevious: number;
      totalCurrent: number; totalPrevious: number; absoluteChange: number; percentageChange: number | null;
    }>;
    anomalies: AnomalyData[];
  };
  employeeComparisons: Array<{
    employeeName: string;
    department: string | null;
    previousNet: number;
    currentNet: number;
    changeAmount: number;
    changePercentage: number | null;
    status: string;
    components?: Record<string, number | null>;
    previousComponents?: Record<string, number | null>;
  }>;
}

export async function generateExcel(
  comparisonData: ComparisonData,
  companyInfo: CompanyInfo,
): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const { summary, employeeComparisons } = comparisonData;

  const summarySheet = buildSummarySheet(summary, companyInfo, comparisonData.periodLabel, comparisonData.previousPeriodLabel);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const comparisonSheet = buildComparisonSheet(employeeComparisons);
  XLSX.utils.book_append_sheet(wb, comparisonSheet, "Employee Comparison");

  if (summary.componentBreakdown && summary.componentBreakdown.length > 0) {
    const compSheet = buildComponentBreakdownSheet(summary.componentBreakdown);
    XLSX.utils.book_append_sheet(wb, compSheet, "Component Breakdown");
  }

  if (summary.anomalies.length > 0) {
    const anomalySheet = buildAnomalySheet(summary.anomalies);
    XLSX.utils.book_append_sheet(wb, anomalySheet, "Anomalies");
  }

  if (summary.departmentBreakdown && summary.departmentBreakdown.length > 0) {
    const deptSheet = buildDepartmentSheet(summary.departmentBreakdown);
    XLSX.utils.book_append_sheet(wb, deptSheet, "Departments");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

function buildSummarySheet(
  summary: ComparisonData["summary"],
  company: CompanyInfo,
  currentPeriod: string,
  previousPeriod: string,
): XLSX.WorkSheet {
  const dir = summary.totalPayrollVariance.absolute >= 0 ? "Increase" : "Decrease";
  const absVar = Math.abs(summary.totalPayrollVariance.absolute);

  const rows: unknown[][] = [
    [company.name],
    [`Payroll Comparison: ${currentPeriod} vs ${previousPeriod}`],
    [],
    ["Metric", "Value"],
    ["Total Payroll Variance", `${dir}: ${absVar.toFixed(2)}${summary.totalPayrollVariance.percentage !== null ? ` (${summary.totalPayrollVariance.percentage.toFixed(1)}%)` : ""}`],
    ["Total Employees", summary.employeesAffected.total],
    ["Increases", summary.employeesAffected.increased],
    ["Decreases", summary.employeesAffected.decreased],
    ["Unchanged", summary.employeesAffected.unchanged],
    ["New Hires", summary.newEmployees],
    ["Departures", summary.departedEmployees],
    ["Average Change", `${Math.abs(summary.averageChange.absolute).toFixed(2)}${summary.averageChange.percentage !== null ? ` (${summary.averageChange.percentage.toFixed(1)}%)` : ""}`],
  ];

  if (summary.largestIncrease) {
    rows.push(["Largest Increase", `${summary.largestIncrease.employeeName}: ${summary.largestIncrease.amount.toFixed(2)}`]);
  }
  if (summary.largestDecrease) {
    rows.push(["Largest Decrease", `${summary.largestDecrease.employeeName}: ${Math.abs(summary.largestDecrease.amount).toFixed(2)}`]);
  }
  rows.push(["Anomalies Detected", summary.anomalies.length]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 50 }];
  return ws;
}

function buildComparisonSheet(
  employees: ComparisonData["employeeComparisons"],
): XLSX.WorkSheet {
  const headerRow = ["Employee", "Department", "Previous Net", "Current Net", "Change", "Change %", "Status"];

  const dataRows = employees.map((e) => [
    e.employeeName,
    e.department ?? "",
    e.previousNet,
    e.currentNet,
    e.changeAmount,
    e.changePercentage !== null ? e.changePercentage : "",
    e.status,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 25 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  return ws;
}

function buildComponentBreakdownSheet(
  breakdown: NonNullable<ComparisonData["summary"]["componentBreakdown"]>,
): XLSX.WorkSheet {
  const headerRow = ["Component", "Total Change", "Employees Affected"];
  const dataRows = breakdown.map((c) => [
    c.component,
    c.totalChange,
    c.employeeCount,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 20 }];
  return ws;
}

function buildAnomalySheet(
  anomalies: AnomalyData[],
): XLSX.WorkSheet {
  const headerRow = ["Employee ID", "Employee Name", "Type", "Severity", "Description"];
  const dataRows = anomalies.map((a) => [
    a.employeeId,
    a.employeeName,
    a.type,
    a.severity,
    a.description,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 15 }, { wch: 25 }, { wch: 30 },
    { wch: 12 }, { wch: 50 },
  ];
  return ws;
}

function buildDepartmentSheet(
  breakdown: NonNullable<ComparisonData["summary"]["departmentBreakdown"]>,
): XLSX.WorkSheet {
  const headerRow = [
    "Department", "Headcount (Current)", "Headcount (Previous)",
    "Total (Current)", "Total (Previous)", "Change", "Change %",
  ];
  const dataRows = breakdown.map((d) => [
    d.department,
    d.headcountCurrent,
    d.headcountPrevious,
    d.totalCurrent,
    d.totalPrevious,
    d.absoluteChange,
    d.percentageChange !== null ? d.percentageChange : "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 20 }, { wch: 18 }, { wch: 18 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
  ];
  return ws;
}
