import type { AnomalyFlag } from "@saas/types";
import type { ComparisonOutput } from "@saas/payroll-core";
import { callClaude, isAiAvailable } from "./client";
import { ANOMALY_SYSTEM_PROMPT } from "./anomaly/prompts";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export async function refineAnomalies(
  ruleBasedAnomalies: AnomalyFlag[],
  _comparisonResults: ComparisonOutput[],
): Promise<AnomalyFlag[]> {
  if (!isAiAvailable) {
    return ruleBasedAnomalies
      .slice()
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
      );
  }

  const userMessage = JSON.stringify({
    anomalies: ruleBasedAnomalies,
    comparisonResults: _comparisonResults.map((r) => ({
      employeeExternalId: r.employeeExternalId,
      employeeName: r.employeeName,
      department: r.department,
      status: r.status,
      grossDelta: r.grossDelta,
      netDelta: r.netDelta,
      componentDeltas: r.componentDeltas,
      anomalyFlags: r.anomalyFlags,
    })),
  });

  const claudeRaw = await callClaude(ANOMALY_SYSTEM_PROMPT, userMessage);

  if (!claudeRaw) {
    return ruleBasedAnomalies
      .slice()
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
      );
  }

  try {
    const parsed = JSON.parse(claudeRaw.replace(/```json|```/g, "").trim());
    const refined: AnomalyFlag[] = (parsed.anomalies ?? []).map((a: any) => ({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      type: a.type,
      severity: a.severity,
      description: a.description,
    }));

    if (refined.length === 0) {
      return ruleBasedAnomalies
        .slice()
        .sort(
          (a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
        );
    }

    return refined.sort(
      (a: AnomalyFlag, b: AnomalyFlag) =>
        (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
    );
  } catch {
    return ruleBasedAnomalies
      .slice()
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
      );
  }
}
