import { callClaude, isAiAvailable } from "./client";
import { ANNUAL_INSIGHTS_SYSTEM_PROMPT } from "./insights/prompts";

export interface AnnualInsightPayload {
  year: number;
  periodType: string;
  currency: string;
  companyName?: string;
  coverage: {
    uploaded: number;
    expected: number;
    missingLabels: string[];
  };
  totals: {
    grossToDate: number;
    netToDate: number;
    employerCostToDate: number;
    headcountLatest: number;
    headcountAvgYtd: number;
  };
  forecast: {
    method: string;
    fullYearNet: number;
    fullYearGross: number;
    fullYearEmployerCost: number;
  };
  statutory: {
    incomeTax: number;
    socialSecurityEmployee: number;
    employerOnCost: number;
  };
  categories: Array<{ category: string; total: number }>;
  departments: Array<{ department: string; total: number }>;
  mix: {
    fixed: number;
    variable: number;
    overtime: number;
  };
  yoy: {
    changePctGross: number | null;
    changePctNet: number | null;
    likeForLikePeriods: number | null;
  };
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function pctText(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "n/a";
  return `${ratio.toFixed(1)}%`;
}

function ruleBasedInsights(payload: AnnualInsightPayload): string[] {
  const { year, currency, coverage, totals, forecast, statutory } = payload;
  const bullets: string[] = [];

  bullets.push(
    `${year} salaries are forecast at ${fmt(forecast.fullYearNet, currency)} on the ${forecast.method} method, with ${fmt(totals.netToDate, currency)} paid to date across ${coverage.uploaded} of ${coverage.expected} periods.`,
  );

  const statutoryTotal = statutory.incomeTax + statutory.socialSecurityEmployee + statutory.employerOnCost;
  bullets.push(
    `Statutory burden on the year is ${fmt(statutoryTotal, currency)} (${fmt(statutory.incomeTax, currency)} income tax, ${fmt(statutory.socialSecurityEmployee, currency)} employee social security, ${fmt(statutory.employerOnCost, currency)} employer contributions).`,
  );

  if (coverage.missingLabels.length > 0) {
    bullets.push(
      `Data quality: ${coverage.missingLabels.length} period(s) are not uploaded yet (${coverage.missingLabels.join(", ")}); forecasts extend them rather than estimate missing actuals.`,
    );
  } else {
    bullets.push(
      `All ${coverage.expected} expected periods are uploaded, so the full-year figures are actuals, not estimates.`,
    );
  }

  // `mix.variable` already includes overtime (summary.ts sums bonus_commission +
  // overtime), so adding `mix.overtime` again counted it twice: the variable share
  // read 13.8% instead of 10.0%, and fixed-plus-variable came to 103.8% of gross
  // (finding C11/AI2). `mix.overtime` is carried separately only so the narrative
  // can name it.
  const variableRatio =
    totals.grossToDate > 0 ? (payload.mix.variable / totals.grossToDate) * 100 : null;
  if (variableRatio !== null && payload.mix.fixed + payload.mix.variable > 0) {
    bullets.push(
      `${pctText(variableRatio)} of gross earnings to date is variable pay (bonuses, commissions and overtime), versus ${pctText(totals.grossToDate > 0 ? (payload.mix.fixed / totals.grossToDate) * 100 : null)} fixed.`,
    );
  }

  if (payload.yoy.changePctGross !== null && Number.isFinite(payload.yoy.changePctGross) && payload.yoy.likeForLikePeriods !== null) {
    bullets.push(
      `Like-for-like gross is ${pctText(payload.yoy.changePctGross)} versus the same periods last year.`,
    );
  }

  return bullets.slice(0, 5);
}

/**
 * Keep only lines that are actually bullets, and strip just the marker.
 *
 * v1 ran `replace(/^[-*\d.)\s]+/, "")` over every non-empty line (finding
 * C11/AI1), which ate the leading number of any bullet that began with one:
 * "2026 payroll rose..." became "payroll rose...", and "12.5% of gross..."
 * became "% of gross...". It also accepted the model's preamble line ("Here are
 * the insights:") as bullet one, because that line is non-empty too.
 */
export function parseBullets(raw: string): string[] {
  const bullets: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    // A bullet marker is "-", "*" or "•" followed by whitespace. Nothing else.
    const match = /^([-*•])\s+(.*)$/.exec(trimmed);
    if (!match) continue;
    const text = match[2]!.trim();
    if (text.length > 0) bullets.push(text);
  }
  return bullets.slice(0, 5);
}

export interface AnnualInsightsResult {
  bullets: string[];
  /** Which produced the text, so the cache and the UI never mislabel it. */
  source: "ai" | "rules";
  /** Why the model was not used, when it wasn't. */
  error: string | null;
}

/**
 * Returns the source alongside the text (step 23, findings A2/B5/U7).
 *
 * v1 returned a bare string[], so the caller cached rule-based fallbacks under
 * the model's name and the UI presented deterministic text as AI output.
 */
export async function generateAnnualInsights(
  payload: AnnualInsightPayload,
): Promise<AnnualInsightsResult> {
  if (!isAiAvailable) {
    return { bullets: ruleBasedInsights(payload), source: "rules", error: "No API key configured" };
  }

  const { text, error } = await callClaude(ANNUAL_INSIGHTS_SYSTEM_PROMPT, JSON.stringify(payload));
  if (!text) {
    return { bullets: ruleBasedInsights(payload), source: "rules", error: error ?? "No response" };
  }

  const parsed = parseBullets(text);
  if (parsed.length >= 3) {
    return { bullets: parsed, source: "ai", error: null };
  }
  return {
    bullets: ruleBasedInsights(payload),
    source: "rules",
    error: `Model returned ${parsed.length} usable bullets`,
  };
}