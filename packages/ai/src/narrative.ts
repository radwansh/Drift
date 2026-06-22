import type { AiNarrative } from "@saas/types";
import type { AggregatedSummary } from "@saas/payroll-core";
import { callClaude, isAiAvailable } from "./client";
import { NARRATIVE_SYSTEM_PROMPT } from "./narrative/prompts";

function ruleBasedNarrative(
  summary: AggregatedSummary,
  companyName: string,
  currentPeriod: string,
  previousPeriod: string,
): AiNarrative {
  const variance = summary.totalPayrollVariance;
  const affected = summary.employeesAffected;
  const direction = variance.absolute >= 0 ? "increase" : "decrease";
  const absVariance = Math.abs(variance.absolute);
  const pctText = variance.percentage !== null
    ? ` (${variance.percentage.toFixed(1)}%)`
    : "";

  let summaryText =
    `For ${companyName}, comparing ${currentPeriod} to ${previousPeriod}, ` +
    `total payroll saw a ${direction} of $${absVariance.toFixed(2)}${pctText}. `;

  summaryText +=
    `${affected.total} employees were compared: ` +
    `${affected.increased} had increases, ${affected.decreased} had decreases, ` +
    `and ${affected.unchanged} were unchanged. `;

  if (summary.newEmployees > 0 || summary.departedEmployees > 0) {
    summaryText +=
      `${summary.newEmployees} new employee(s) joined and ` +
      `${summary.departedEmployees} employee(s) departed during this period. `;
  }

  if (summary.anomalies.length > 0) {
    const criticalCount = summary.anomalies.filter((a) => a.severity === "critical").length;
    const warningCount = summary.anomalies.filter((a) => a.severity === "warning").length;
    summaryText +=
      `${summary.anomalies.length} anomaly flag(s) were detected ` +
      `(${criticalCount} critical, ${warningCount} warning).`;
  }

  const highlights: string[] = [];
  if (summary.largestIncrease) {
    highlights.push(
      `${summary.largestIncrease.employeeName} had the largest increase at $${summary.largestIncrease.amount.toFixed(2)}`,
    );
  }
  if (summary.largestDecrease) {
    highlights.push(
      `${summary.largestDecrease.employeeName} had the largest decrease at $${Math.abs(summary.largestDecrease.amount).toFixed(2)}`,
    );
  }
  if (summary.averageChange.absolute !== 0) {
    const avgDir = summary.averageChange.absolute >= 0 ? "increase" : "decrease";
    highlights.push(
      `Average change per employee was an ${avgDir} of $${Math.abs(summary.averageChange.absolute).toFixed(2)}`,
    );
  }

  const concerns: string[] = [];
  for (const anomaly of summary.anomalies) {
    if (anomaly.severity === "critical" || anomaly.severity === "warning") {
      concerns.push(
        `${anomaly.employeeName}: ${anomaly.description} (${anomaly.severity})`,
      );
    }
  }
  if (concerns.length === 0 && summary.anomalies.length > 0) {
    concerns.push(`${summary.anomalies.length} anomaly(ies) detected - review recommended`);
  }

  let severity: "routine" | "review" | "critical" = "routine";
  const hasCritical = summary.anomalies.some((a) => a.severity === "critical");
  const hasWarning = summary.anomalies.some((a) => a.severity === "warning");
  const largeChange = variance.percentage !== null && Math.abs(variance.percentage) > 15;
  if (hasCritical) severity = "critical";
  else if (hasWarning || largeChange) severity = "review";

  return {
    summary: summaryText.trim(),
    highlights,
    concerns,
    severity,
  };
}

export async function generateNarrative(
  summary: AggregatedSummary,
  companyName: string,
  currentPeriod: string,
  previousPeriod: string,
): Promise<AiNarrative> {
  if (!isAiAvailable) {
    return ruleBasedNarrative(summary, companyName, currentPeriod, previousPeriod);
  }

  const userMessage = JSON.stringify({
    companyName,
    currentPeriod,
    previousPeriod,
    summary,
  });

  const claudeRaw = await callClaude(NARRATIVE_SYSTEM_PROMPT, userMessage);

  if (!claudeRaw) {
    return ruleBasedNarrative(summary, companyName, currentPeriod, previousPeriod);
  }

  try {
    const parsed = JSON.parse(claudeRaw.replace(/```json|```/g, "").trim());
    return {
      summary: parsed.summary ?? "",
      highlights: parsed.highlights ?? [],
      concerns: parsed.concerns ?? [],
      severity: parsed.severity ?? "routine",
    };
  } catch {
    return ruleBasedNarrative(summary, companyName, currentPeriod, previousPeriod);
  }
}
