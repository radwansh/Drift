import type { AnomalyFlag } from "@saas/types";
import type { ComparisonOutput } from "@saas/payroll-core";
import { callClaude, isAiAvailable } from "./client";
import { ANOMALY_SYSTEM_PROMPT } from "./anomaly/prompts";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function bySeverity(a: AnomalyFlag, b: AnomalyFlag): number {
  return (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2);
}

/** Identity of a finding: which employee, and which rule fired. */
function keyOf(employeeId: string, type: string): string {
  return `${employeeId}\u0000${type}`;
}

/**
 * Let the model improve how a finding reads. Nothing else.
 *
 * Step 10a of docs/PAYROLL_AUDIT_FIX_PLAN.md. What this did before: it parsed
 * the model's `anomalies` array, mapped it straight onto `AnomalyFlag`
 * with no validation of any field, and **returned it in place of the
 * rule-based list**.
 *
 * Two different failures, and the second is worse than the one the audit
 * recorded:
 *
 * - **Invention.** No check that `employeeId` named a real employee, that
 *   `severity` was one of the three allowed values, or that the finding
 *   corresponded to anything the engine had detected. The prompt made this
 *   likely rather than theoretical: it offered a closed type list including
 *   `id_mismatch`, `missing_data` and `unusual_department_change`, none of
 *   which any rule produces. A hallucinated employee landed on the dashboard
 *   as a payroll finding.
 * - **Suppression.** Because the model's array replaced the engine's, a model
 *   that simply omitted a finding deleted it. A `critical` net-exceeds-gross
 *   could disappear because a language model did not think it important, and
 *   nothing would record that it had been dropped.
 *
 * So the engine's findings are the record. The model may supply better wording
 * for a finding that exists; it cannot add one, remove one, or change how
 * serious it is. Severity in particular stays the engine's: it is computed
 * from rules, and letting a model downgrade `critical` to `info` is the
 * suppression above by another route.
 */
export async function refineAnomalies(
  ruleBasedAnomalies: AnomalyFlag[],
  comparisonResults: ComparisonOutput[],
): Promise<AnomalyFlag[]> {
  const asFound = () => ruleBasedAnomalies.slice().sort(bySeverity);

  if (!isAiAvailable || ruleBasedAnomalies.length === 0) {
    return asFound();
  }

  const userMessage = JSON.stringify({
    anomalies: ruleBasedAnomalies,
    comparisonResults: comparisonResults.map((r) => ({
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

  const { text: claudeRaw } = await callClaude(ANOMALY_SYSTEM_PROMPT, userMessage);
  if (!claudeRaw) return asFound();

  try {
    const parsed = JSON.parse(claudeRaw.replace(/```json|```/g, "").trim());
    const rows: unknown[] = Array.isArray(parsed?.anomalies) ? parsed.anomalies : [];

    // Collect only descriptions, and only for findings the engine actually
    // made. Anything else — an unknown employee, an invented type, a missing
    // or empty description — is dropped without comment, because there is
    // nothing for it to improve.
    const descriptions = new Map<string, string>();
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const { employeeId, type, description } = row as Record<string, unknown>;
      if (typeof employeeId !== "string" || typeof type !== "string") continue;
      if (typeof description !== "string" || description.trim() === "") continue;
      descriptions.set(keyOf(employeeId, type), description.trim());
    }

    return ruleBasedAnomalies
      .map((flag) => {
        const reworded = descriptions.get(keyOf(flag.employeeId, flag.type));
        // Identity and severity are the engine's; only the prose can change.
        return reworded ? { ...flag, description: reworded } : flag;
      })
      .sort(bySeverity);
  } catch {
    return asFound();
  }
}
