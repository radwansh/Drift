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

  const variableRatio =
    totals.grossToDate > 0
      ? ((payload.mix.variable + payload.mix.overtime) / totals.grossToDate) * 100
      : null;
  if (variableRatio !== null && payload.mix.fixed + payload.mix.variable + payload.mix.overtime > 0) {
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

function parseBullets(raw: string): string[] {
  const bullets: string[] = [];
  for (const line of raw.split("\n")) {
    const cleaned = line.trim().replace(/^[-*\d.)\s]+/, "").trim();
    if (cleaned.length > 0) bullets.push(cleaned);
  }
  return bullets.slice(0, 5);
}

export function generateAnnualInsights(payload: AnnualInsightPayload): Promise<string[]> {
  const userMessage = JSON.stringify(payload);
  if (!isAiAvailable) {
    return Promise.resolve(ruleBasedInsights(payload));
  }
  return callClaude(ANNUAL_INSIGHTS_SYSTEM_PROMPT, userMessage).then(({ text: raw }) => {
    if (!raw) return ruleBasedInsights(payload);
    const parsed = parseBullets(raw);
    if (parsed.length >= 3) return parsed;
    return ruleBasedInsights(payload);
  });
}