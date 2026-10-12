import { describe, it, expect } from "vitest";
import { parseBullets, type AnnualInsightPayload } from "./insights";
import { generateAnnualInsights } from "./insights";

/** Equivalent of probe AI1: the parser must not eat leading numbers. */
describe("parseBullets", () => {
  it("keeps a leading number that is part of the sentence", () => {
    const raw = [
      "Here are the key insights for the year:",
      "",
      "- 2026 payroll is forecast at USD 3.1M, up from 2.9M.",
      "- 12.5% of gross is variable pay.",
      "- Employer on-costs run at 9.8% of gross.",
    ].join("\n");

    const bullets = parseBullets(raw);

    expect(bullets).toHaveLength(3);
    // v1 produced "payroll is forecast..." and "% of gross is variable pay."
    expect(bullets[0]).toBe("2026 payroll is forecast at USD 3.1M, up from 2.9M.");
    expect(bullets[1]).toBe("12.5% of gross is variable pay.");
  });

  it("drops the model's preamble instead of promoting it to bullet one", () => {
    const raw = ["Here are the insights:", "- Payroll grew 4%."].join("\n");
    expect(parseBullets(raw)).toEqual(["Payroll grew 4%."]);
  });

  it("accepts -, * and bullet markers and ignores unmarked prose", () => {
    const raw = ["- one", "* two", "• three", "four is not a bullet"].join("\n");
    expect(parseBullets(raw)).toEqual(["one", "two", "three"]);
  });

  it("caps at five bullets", () => {
    const raw = [1, 2, 3, 4, 5, 6, 7].map((n) => `- bullet ${n}`).join("\n");
    expect(parseBullets(raw)).toHaveLength(5);
  });
});

function payload(overrides: Partial<AnnualInsightPayload> = {}): AnnualInsightPayload {
  return {
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    coverage: { uploaded: 12, expected: 12, missingLabels: [] },
    totals: {
      grossToDate: 1000,
      netToDate: 800,
      employerCostToDate: 100,
      headcountLatest: 10,
      headcountAvgYtd: 10,
    },
    forecast: { method: "run rate", fullYearNet: 800, fullYearGross: 1000, fullYearEmployerCost: 100 },
    statutory: { incomeTax: 100, socialSecurityEmployee: 50, employerOnCost: 100 },
    categories: [],
    departments: [],
    // 900 fixed + 100 variable, of which 100 is overtime.
    mix: { fixed: 900, variable: 100, overtime: 100 },
    yoy: { changePctGross: null, changePctNet: null, likeForLikePeriods: null },
    ...overrides,
  };
}

/** Equivalent of probe AI2: the fallback must not count overtime twice. */
describe("rule-based insights", () => {
  it("reports the variable share once, so fixed plus variable does not exceed 100%", async () => {
    const { bullets } = await generateAnnualInsights(payload());
    const variableLine = bullets.find((b) => b.includes("variable pay"));

    expect(variableLine).toBeDefined();
    // mix.variable already includes overtime. v1 added mix.overtime again and
    // printed 20.0% here, making fixed + variable come to 110%.
    expect(variableLine).toContain("10.0%");
    expect(variableLine).toContain("90.0%");
  });

  it("falls back to rule-based text when no API key is configured, and says so", async () => {
    const result = await generateAnnualInsights(payload());
    expect(result.bullets.length).toBeGreaterThanOrEqual(3);
    expect(result.bullets[0]).toContain("2026");
    // The caller must be able to tell this apart from a model answer, so it is
    // never cached or labelled as one (step 23).
    expect(result.source).toBe("rules");
    expect(result.error).toBeTruthy();
  });
});
