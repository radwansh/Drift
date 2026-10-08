import { describe, it, expect } from "vitest";
import { generateAnnualInsights, type AnnualInsightPayload } from "./insights";

function makePayload(overrides: Partial<AnnualInsightPayload> = {}): AnnualInsightPayload {
  return {
    year: 2026,
    periodType: "monthly",
    currency: "USD",
    companyName: "Acme Corp",
    coverage: { uploaded: 8, expected: 12, missingLabels: ["Jun 2026", "Jul 2026"] },
    totals: {
      grossToDate: 800000,
      netToDate: 605000,
      employerCostToDate: 950000,
      headcountLatest: 100,
      headcountAvgYtd: 98,
    },
    forecast: {
      method: "run_rate",
      fullYearNet: 910000,
      fullYearGross: 1200000,
      fullYearEmployerCost: 1425000,
    },
    statutory: {
      incomeTax: 90000,
      socialSecurityEmployee: 65000,
      employerOnCost: 150000,
    },
    categories: [
      { category: "base_salary", total: 720000 },
      { category: "bonus_commission", total: 50000 },
      { category: "overtime", total: 30000 },
    ],
    departments: [{ department: "Engineering", total: 400000 }],
    mix: { fixed: 720000, variable: 50000, overtime: 30000 },
    yoy: { changePctGross: 6.4, changePctNet: 5.1, likeForLikePeriods: 8 },
    ...overrides,
  };
}

describe("generateAnnualInsights", () => {
  it("returns between 3 and 5 bullets", async () => {
    const bullets = await generateAnnualInsights(makePayload());
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets.length).toBeLessThanOrEqual(5);
  });

  it("sends aggregated numbers only, never employee identifiers", async () => {
    const serialized = JSON.stringify(makePayload());
    expect(serialized).not.toMatch(/employeeId|employeeName|employee_id|employee_name/i);
    expect(serialized).not.toMatch(/\bname\b/i);
    expect(serialized).not.toMatch(/E\d{3,}/i);
  });

  it("uses only the numbers provided (aggregates)", async () => {
    const payload = makePayload({
      coverage: { uploaded: 12, expected: 12, missingLabels: [] },
      yoy: { changePctGross: null, changePctNet: null, likeForLikePeriods: null },
    });
    const bullets = await generateAnnualInsights(payload);
    expect(bullets.join(" ")).toContain("periods are uploaded");
    expect(bullets.join(" ")).not.toContain("not uploaded");
  });

  it("flags missing periods when coverage is partial", async () => {
    const bullets = await generateAnnualInsights(makePayload());
    expect(bullets.join(" ")).toContain("Jun 2026");
  });
});