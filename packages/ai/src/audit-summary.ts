import type { DashboardSummary } from "@saas/types";
import { callClaude, isAiAvailable } from "./client";
import { AUDIT_SYSTEM_PROMPT } from "./audit-summary/prompts";

function ruleBasedAuditSummary(comparisonData: {
  summary: DashboardSummary;
  companyName: string;
  currentPeriod: string;
  previousPeriod: string;
}): string {
  const { summary, companyName, currentPeriod, previousPeriod } = comparisonData;
  const v = summary.totalPayrollVariance;
  const affected = summary.employeesAffected;
  const dir = v.absolute >= 0 ? "increase" : "decrease";
  const absVar = Math.abs(v.absolute);
  const pctStr = v.percentage !== null ? ` (${v.percentage.toFixed(1)}%)` : "";

  const sections: string[] = [];

  sections.push(`# Audit Summary: ${companyName}`);
  sections.push(`**Period:** ${currentPeriod} vs ${previousPeriod}`);
  sections.push("");

  sections.push("## Executive Summary");
  sections.push(
    `Total payroll ${dir} by $${absVar.toFixed(2)}${pctStr}. ` +
    `A total of ${affected.total} employees were compared across the two periods.`,
  );
  sections.push("");

  sections.push("## Headcount Changes");
  sections.push(
    `- **New Hires:** ${summary.newEmployees}` +
    `\n- **Departures:** ${summary.departedEmployees}` +
    `\n- **Net Headcount Change:** ${summary.newEmployees - summary.departedEmployees}` +
    `\n- **Employee Status Breakdown:** ${affected.increased} increased, ${affected.decreased} decreased, ${affected.unchanged} unchanged`,
  );
  sections.push("");

  sections.push("## Payroll Analysis");
  if (summary.averageChange.absolute !== 0) {
    const avgDir = summary.averageChange.absolute >= 0 ? "increase" : "decrease";
    sections.push(
      `- **Average Change per Employee:** ${avgDir} of $${Math.abs(summary.averageChange.absolute).toFixed(2)}` +
      (summary.averageChange.percentage !== null ? ` (${summary.averageChange.percentage.toFixed(1)}%)` : ""),
    );
  }
  if (summary.largestIncrease) {
    sections.push(
      `- **Largest Increase:** ${summary.largestIncrease.employeeName} (${summary.largestIncrease.department ?? "N/A"}) ` +
      `+$${summary.largestIncrease.amount.toFixed(2)}`,
    );
  }
  if (summary.largestDecrease) {
    sections.push(
      `- **Largest Decrease:** ${summary.largestDecrease.employeeName} (${summary.largestDecrease.department ?? "N/A"}) ` +
      `-$${Math.abs(summary.largestDecrease.amount).toFixed(2)}`,
    );
  }

  const compLines = summary.componentBreakdown.slice(0, 5).map(
    (c) => `- **${c.component}:** ${c.totalChange >= 0 ? "+" : ""}$${c.totalChange.toFixed(2)} (${c.employeeCount} employees)`,
  );
  if (compLines.length > 0) {
    sections.push("### Component Changes");
    sections.push(compLines.join("\n"));
  }
  sections.push("");

  sections.push("## Anomaly Review");
  if (summary.anomalies.length === 0) {
    sections.push("No anomalies were detected during this comparison.");
  } else {
    const criticalFlags = summary.anomalies.filter((a) => a.severity === "critical");
    const warningFlags = summary.anomalies.filter((a) => a.severity === "warning");
    const infoFlags = summary.anomalies.filter((a) => a.severity === "info");

    if (criticalFlags.length > 0) {
      sections.push("### Critical");
      for (const a of criticalFlags) {
        sections.push(`- **${a.employeeName}:** ${a.description}`);
      }
    }
    if (warningFlags.length > 0) {
      sections.push("### Warnings");
      for (const a of warningFlags) {
        sections.push(`- **${a.employeeName}:** ${a.description}`);
      }
    }
    if (infoFlags.length > 0) {
      sections.push("### Info");
      for (const a of infoFlags) {
        sections.push(`- **${a.employeeName}:** ${a.description}`);
      }
    }
  }
  sections.push("");

  sections.push("## Compliance Assessment");
  const hasCritical = summary.anomalies.some((a) => a.severity === "critical");
  const hasWarning = summary.anomalies.some((a) => a.severity === "warning");
  const largeChange = v.percentage !== null && Math.abs(v.percentage) > 15;

  let rating: string;
  if (hasCritical) {
    rating = "**High Risk** - Critical anomalies require immediate investigation.";
  } else if (hasWarning || largeChange) {
    rating = "**Medium Risk** - Anomalies or significant variances detected. Further review recommended.";
  } else {
    rating = "**Low Risk** - No significant issues detected. Payroll processing appears normal.";
  }
  sections.push(rating);

  return sections.join("\n");
}

export async function generateAuditSummary(
  comparisonData: {
    summary: DashboardSummary;
    companyName: string;
    currentPeriod: string;
    previousPeriod: string;
  },
): Promise<string> {
  if (!isAiAvailable) {
    return ruleBasedAuditSummary(comparisonData);
  }

  const claudeRaw = await callClaude(AUDIT_SYSTEM_PROMPT, JSON.stringify(comparisonData));

  if (!claudeRaw) {
    return ruleBasedAuditSummary(comparisonData);
  }

  return claudeRaw;
}
