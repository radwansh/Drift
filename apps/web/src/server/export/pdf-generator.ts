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
  }>;
}

export async function generatePdf(
  comparisonData: ComparisonData,
  companyInfo: CompanyInfo,
): Promise<Buffer> {
  const { summary, periodLabel, previousPeriodLabel } = comparisonData;
  const { name, currencyCode } = companyInfo;
  const currencySymbol = getCurrencySymbol(currencyCode);
  const dir = summary.totalPayrollVariance.absolute >= 0 ? "increase" : "decrease";
  const absVar = Math.abs(summary.totalPayrollVariance.absolute);

  const styles = {
    header: "font-size:24px; font-weight:bold; color:#1a1a2e; margin-bottom:4px;",
    subheader: "font-size:14px; color:#6b7280; margin-bottom:20px;",
    sectionTitle: "font-size:16px; font-weight:600; color:#1a1a2e; margin-top:20px; margin-bottom:10px; border-bottom:2px solid #e5e7eb; padding-bottom:4px;",
    metricValue: "font-size:18px; font-weight:bold; color:#111827;",
    metricLabel: "font-size:11px; color:#6b7280; text-transform:uppercase;",
    table: "width:100%; border-collapse:collapse; margin-top:8px;",
    th: "background-color:#f3f4f6; padding:8px 12px; text-align:left; font-size:12px; font-weight:600; color:#374151; border:1px solid #e5e7eb;",
    td: "padding:8px 12px; font-size:12px; color:#374151; border:1px solid #e5e7eb;",
    positive: "color:#16a34a;",
    negative: "color:#dc2626;",
    footer: "margin-top:30px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; text-align:center;",
    anomalyCritical: "background-color:#fef2f2; color:#dc2626; padding:4px 8px; border-radius:4px; font-size:11px;",
    anomalyWarning: "background-color:#fffbeb; color:#d97706; padding:4px 8px; border-radius:4px; font-size:11px;",
  };

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #111827; }
  .metric-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; display: inline-block; margin: 4px; min-width: 160px; text-align: center; }
  .page-break { page-break-after: always; }
</style>
</head>
<body>
  <div style="${styles.header}">${name}</div>
  <div style="${styles.subheader}">Payroll Comparison: ${periodLabel} vs ${previousPeriodLabel}</div>

  <div style="${styles.sectionTitle}">Executive Summary</div>
  <p>Total payroll ${dir} by ${currencySymbol}${absVar.toFixed(2)}${summary.totalPayrollVariance.percentage !== null ? ` (${summary.totalPayrollVariance.percentage.toFixed(1)}%)` : ""}.</p>

  <div>
    <div class="metric-card"><div style="${styles.metricLabel}">Employees</div><div style="${styles.metricValue}">${summary.employeesAffected.total}</div></div>
    <div class="metric-card"><div style="${styles.metricLabel}">Increases</div><div style="${styles.metricValue + 'color:#16a34a;'}">${summary.employeesAffected.increased}</div></div>
    <div class="metric-card"><div style="${styles.metricLabel}">Decreases</div><div style="${styles.metricValue + 'color:#dc2626;'}">${summary.employeesAffected.decreased}</div></div>
    <div class="metric-card"><div style="${styles.metricLabel}">Unchanged</div><div style="${styles.metricValue}">${summary.employeesAffected.unchanged}</div></div>
    <div class="metric-card"><div style="${styles.metricLabel}">New</div><div style="${styles.metricValue + 'color:#16a34a;'}">${summary.newEmployees}</div></div>
    <div class="metric-card"><div style="${styles.metricLabel}">Departed</div><div style="${styles.metricValue + 'color:#dc2626;'}">${summary.departedEmployees}</div></div>
  </div>

  <div style="${styles.sectionTitle}">Summary Table</div>
  <table style="${styles.table}">
    <tr>
      <th style="${styles.th}">Metric</th>
      <th style="${styles.th}">Value</th>
    </tr>
    <tr><td style="${styles.td}">Total Payroll Variance</td><td style="${styles.td}">${currencySymbol}${absVar.toFixed(2)}${summary.totalPayrollVariance.percentage !== null ? ` (${summary.totalPayrollVariance.percentage.toFixed(1)}%)` : ""}</td></tr>
    <tr><td style="${styles.td}">Average Change</td><td style="${styles.td}">${currencySymbol}${Math.abs(summary.averageChange.absolute).toFixed(2)}${summary.averageChange.percentage !== null ? ` (${summary.averageChange.percentage.toFixed(1)}%)` : ""}</td></tr>
    ${summary.largestIncrease ? `<tr><td style="${styles.td}">Largest Increase</td><td style="${styles.td + styles.positive}">${summary.largestIncrease.employeeName}: ${currencySymbol}${summary.largestIncrease.amount.toFixed(2)}</td></tr>` : ""}
    ${summary.largestDecrease ? `<tr><td style="${styles.td}">Largest Decrease</td><td style="${styles.td + styles.negative}">${summary.largestDecrease.employeeName}: ${currencySymbol}${Math.abs(summary.largestDecrease.amount).toFixed(2)}</td></tr>` : ""}
  </table>

  ${comparisonData.employeeComparisons.length > 0 ? `
  <div style="${styles.sectionTitle}">Employee Comparison</div>
  <table style="${styles.table}">
    <tr>
      <th style="${styles.th}">Employee</th>
      <th style="${styles.th}">Department</th>
      <th style="${styles.th}">Previous</th>
      <th style="${styles.th}">Current</th>
      <th style="${styles.th}">Change</th>
      <th style="${styles.th}">%</th>
    </tr>
    ${comparisonData.employeeComparisons.slice(0, 50).map((e) => {
      const changeClass = e.changeAmount >= 0 ? styles.positive : styles.negative;
      return `<tr>
        <td style="${styles.td}">${e.employeeName}</td>
        <td style="${styles.td}">${e.department ?? "N/A"}</td>
        <td style="${styles.td}">${currencySymbol}${e.previousNet.toFixed(2)}</td>
        <td style="${styles.td}">${currencySymbol}${e.currentNet.toFixed(2)}</td>
        <td style="${styles.td + changeClass}">${currencySymbol}${Math.abs(e.changeAmount).toFixed(2)}</td>
        <td style="${styles.td}">${e.changePercentage !== null ? `${e.changePercentage.toFixed(1)}%` : "N/A"}</td>
      </tr>`;
    }).join("")}
  </table>` : ""}

  ${summary.anomalies.length > 0 ? `
  <div class="page-break"></div>
  <div style="${styles.sectionTitle}">Anomaly Flags</div>
  <table style="${styles.table}">
    <tr>
      <th style="${styles.th}">Employee</th>
      <th style="${styles.th}">Type</th>
      <th style="${styles.th}">Severity</th>
      <th style="${styles.th}">Description</th>
    </tr>
    ${summary.anomalies.map((a) => {
      const severityStyle = a.severity === "critical" ? styles.anomalyCritical : a.severity === "warning" ? styles.anomalyWarning : "";
      return `<tr>
        <td style="${styles.td}">${a.employeeName}</td>
        <td style="${styles.td}">${a.type}</td>
        <td style="${styles.td}"><span style="${severityStyle}">${a.severity.toUpperCase()}</span></td>
        <td style="${styles.td}">${a.description}</td>
      </tr>`;
    }).join("")}
  </table>` : ""}

  <div style="${styles.footer}">Generated by Salary Compare | ${new Date().toISOString().split("T")[0]}</div>
</body></html>`;

  const buffer = Buffer.from(html, "utf-8");
  return buffer;
}

function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    USD: "$", EUR: "\u20AC", GBP: "\u00A3", JPY: "\u00A5", CAD: "C$",
    AUD: "A$", CHF: "Fr", CNY: "\u00A5", INR: "\u20B9", BRL: "R$",
  };
  return symbols[code] ?? code;
}
