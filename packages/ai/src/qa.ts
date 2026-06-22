import type { AiQueryResponse } from "@saas/types";
import type { ComparisonRun } from "@saas/types";
import { callClaude, isAiAvailable } from "./client";
import { QA_SYSTEM_PROMPT } from "./qa/prompts";

interface QuestionIntent {
  kind:
    | "total_change"
    | "increase"
    | "decrease"
    | "new_employees"
    | "departed_employees"
    | "deduction"
    | "bonus"
    | "department"
    | "anomalies"
    | "top_mover"
    | "average"
    | "unknown";
  original: string;
}

function classifyQuestion(question: string): QuestionIntent {
  const q = question.toLowerCase();
  if (/\b(total|overall|payroll)\b.*\b(change|variance|diff)\b/.test(q) || /\bhow much.*(total|overall)\b/.test(q)) {
    return { kind: "total_change", original: question };
  }
  if (/\b(increase|went up|higher|rise)\b/.test(q) && !/\b(new|deduction|anomal)\b/.test(q)) {
    return { kind: "increase", original: question };
  }
  if (/\b(decrease|went down|lower|drop|reduce)\b/.test(q) && !/\b(depart|deduction)\b/.test(q)) {
    return { kind: "decrease", original: question };
  }
  if (/\b(new)\b.*\b(hire|employee|join|started)\b/.test(q) || /\b(hire|join|started)\b.*\b(new)\b/.test(q)) {
    return { kind: "new_employees", original: question };
  }
  if (/\b(depart|left|terminated|resign|exit)\b/.test(q)) {
    return { kind: "departed_employees", original: question };
  }
  if (/\b(deduction|tax|insurance|pension|social)\b/.test(q)) {
    return { kind: "deduction", original: question };
  }
  if (/\b(bonus|commission|incentive)\b/.test(q)) {
    return { kind: "bonus", original: question };
  }
  if (/\b(department|dept|division)\b/.test(q) || /\b(engineering|sales|hr|marketing)\b/.test(q)) {
    return { kind: "department", original: question };
  }
  if (/\b(anomal|flag|issue|problem|error|warning|critical)\b/.test(q)) {
    return { kind: "anomalies", original: question };
  }
  if (/\b(top|most|largest|biggest)\b.*\b(mover|increase|decrease|change)\b/.test(q) || /\b(who|which employee)\b.*\b(most|largest)\b/.test(q)) {
    return { kind: "top_mover", original: question };
  }
  if (/\b(average|mean|typical|per employee)\b/.test(q)) {
    return { kind: "average", original: question };
  }
  return { kind: "unknown", original: question };
}

function ruleBasedAnswer(intent: QuestionIntent, comparisonRun: any): AiQueryResponse {
  const summary = comparisonRun?.resultSummary;
  if (!summary) {
    return { answer: "No comparison data is available to answer this question.", confidence: "low" };
  }

  switch (intent.kind) {
    case "total_change": {
      const v = summary.totalPayrollVariance;
      if (v.absolute === 0) {
        return { answer: "Total payroll remained unchanged.", confidence: "high" };
      }
      const dir = v.absolute > 0 ? "increased" : "decreased";
      const pct = v.percentage !== null ? ` (${Math.abs(v.percentage).toFixed(1)}%)` : "";
      return {
        answer: `Total payroll ${dir} by $${Math.abs(v.absolute).toFixed(2)}${pct}.`,
        confidence: "high",
      };
    }
    case "increase": {
      const affected = summary.employeesAffected;
      const inc = summary.largestIncrease;
      let answer = `${affected.increased} employee(s) had an increase in pay.`;
      if (inc) {
        answer += ` The largest increase was ${inc.employeeName} with +$${inc.amount.toFixed(2)}.`;
      }
      return { answer, confidence: "high", relatedEmployees: inc ? [inc.employeeName] : undefined };
    }
    case "decrease": {
      const affected = summary.employeesAffected;
      const dec = summary.largestDecrease;
      let answer = `${affected.decreased} employee(s) had a decrease in pay.`;
      if (dec) {
        answer += ` The largest decrease was ${dec.employeeName} with -$${Math.abs(dec.amount).toFixed(2)}.`;
      }
      return { answer, confidence: "high", relatedEmployees: dec ? [dec.employeeName] : undefined };
    }
    case "new_employees": {
      const count = summary.newEmployees ?? 0;
      return {
        answer: count > 0
          ? `${count} new employee(s) joined in the current period.`
          : "No new employees joined in the current period.",
        confidence: "high",
      };
    }
    case "departed_employees": {
      const count = summary.departedEmployees ?? 0;
      return {
        answer: count > 0
          ? `${count} employee(s) departed in the current period.`
          : "No employees departed in the current period.",
        confidence: "high",
      };
    }
    case "deduction": {
      const breakdown = summary.componentBreakdown ?? [];
      const dedComponents = breakdown.filter((c: any) =>
        /deduction|tax|insurance|pension|social/.test(c.component),
      );
      if (dedComponents.length === 0) {
        return { answer: "No deduction-related changes were found in the comparison data.", confidence: "medium" };
      }
      const lines = dedComponents.map((c: any) =>
        `${c.component}: ${c.totalChange >= 0 ? "+" : ""}$${c.totalChange.toFixed(2)} across ${c.employeeCount} employee(s)`,
      );
      return { answer: lines.join("; "), confidence: "high" };
    }
    case "bonus": {
      const breakdown = summary.componentBreakdown ?? [];
      const bonusComp = breakdown.find((c: any) => /bonus|commission|incentive/.test(c.component));
      if (!bonusComp) {
        return { answer: "No bonus or commission changes were found in the comparison data.", confidence: "medium" };
      }
      const dir = bonusComp.totalChange >= 0 ? "increased" : "decreased";
      return {
        answer: `Total bonus/commission ${dir} by $${Math.abs(bonusComp.totalChange).toFixed(2)} across ${bonusComp.employeeCount} employee(s).`,
        confidence: "high",
      };
    }
    case "department": {
      const deptBreakdown = summary.departmentBreakdown ?? [];
      if (deptBreakdown.length === 0) {
        return { answer: "No department breakdown data is available.", confidence: "low" };
      }
      const lines = deptBreakdown.slice(0, 5).map((d: any) =>
        `${d.department}: $${d.totalPrevious.toFixed(2)} -> $${d.totalCurrent.toFixed(2)} (${d.percentageChange !== null ? `${d.percentageChange >= 0 ? "+" : ""}${d.percentageChange.toFixed(1)}%` : "N/A"})`,
      );
      return { answer: lines.join("; "), confidence: "high" };
    }
    case "anomalies": {
      const anomalies = summary.anomalies ?? [];
      if (anomalies.length === 0) {
        return { answer: "No anomalies were detected in this comparison.", confidence: "high" };
      }
      const critical = anomalies.filter((a: any) => a.severity === "critical");
      const warnings = anomalies.filter((a: any) => a.severity === "warning");
      const parts: string[] = [];
      if (critical.length > 0) parts.push(`${critical.length} critical`);
      if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);
      const info = anomalies.length - critical.length - warnings.length;
      if (info > 0) parts.push(`${info} info`);
      return {
        answer: `${anomalies.length} anomaly(ies) detected: ${parts.join(", ")}.`,
        confidence: "high",
        relatedEmployees: [...new Set(anomalies.map((a: any) => a.employeeName))] as string[],
      };
    }
    case "top_mover": {
      const movers = summary.topMovers ?? [];
      if (movers.length === 0) {
        return { answer: "No top mover data is available.", confidence: "low" };
      }
      const top = movers[0];
      const dir = top.changeAmount >= 0 ? "increase" : "decrease";
      return {
        answer: `${top.employeeName} had the largest ${dir} of $${Math.abs(top.changeAmount).toFixed(2)} (${top.changePercentage !== null ? `${top.changePercentage >= 0 ? "+" : ""}${top.changePercentage.toFixed(1)}%` : "N/A"}).`,
        confidence: "high",
        relatedEmployees: [top.employeeName],
      };
    }
    case "average": {
      const avg = summary.averageChange;
      if (avg.absolute === 0) {
        return { answer: "The average change per employee was $0.00.", confidence: "high" };
      }
      const dir = avg.absolute > 0 ? "increase" : "decrease";
      const pct = avg.percentage !== null ? ` (${Math.abs(avg.percentage).toFixed(1)}%)` : "";
      return {
        answer: `The average change per employee was an ${dir} of $${Math.abs(avg.absolute).toFixed(2)}${pct}.`,
        confidence: "high",
      };
    }
    default: {
      return {
        answer: "I'm sorry, I could not understand the question. Try asking about total changes, increases, decreases, new or departed employees, deductions, bonuses, departments, anomalies, or top movers.",
        confidence: "low",
      };
    }
  }
}

export async function answerQuestion(
  question: string,
  comparisonRun: any,
): Promise<AiQueryResponse> {
  const intent = classifyQuestion(question);

  if (!isAiAvailable) {
    return ruleBasedAnswer(intent, comparisonRun);
  }

  const userMessage = JSON.stringify({
    question,
    comparisonRun,
  });

  const claudeRaw = await callClaude(QA_SYSTEM_PROMPT, userMessage);

  if (!claudeRaw) {
    return ruleBasedAnswer(intent, comparisonRun);
  }

  try {
    const parsed = JSON.parse(claudeRaw.replace(/```json|```/g, "").trim());
    return {
      answer: parsed.answer ?? "No answer could be generated.",
      confidence: parsed.confidence ?? "low",
      relatedEmployees: parsed.relatedEmployees,
    };
  } catch {
    return ruleBasedAnswer(intent, comparisonRun);
  }
}
