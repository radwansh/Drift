import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";
import { generateNarrative } from "./narrative";
import { generateAuditSummary } from "./audit-summary";
import type { AggregatedSummary } from "@saas/payroll-core";
import type { DashboardSummary } from "@saas/types";

/**
 * Step 8b of docs/PAYROLL_AUDIT_FIX_PLAN.md.
 *
 * The rule-based narrative and audit summary wrote every amount as
 * `$${n.toFixed(2)}` and received no currency at all, so a Lebanese or Kuwaiti
 * payroll was described in dollars. These tests assert what a payroll manager
 * would check first: the code on the figure is the one the company is paid in,
 * and no dollar sign appears anywhere unless the company is in dollars.
 */
/**
 * `currencyDisplay: "code"` separates the code from the number with a
 * non-breaking space (U+00A0), deliberately — it stops "LBP" wrapping away
 * from its figure. Assertions compare against plain spaces so the intent is
 * readable; the NBSP itself is asserted once, below.
 */
const plain = (text: string) => text.replace(/\u00a0/g, " ");

function makeSummary(overrides: Partial<AggregatedSummary> = {}): AggregatedSummary {
  return {
    totalPayrollVariance: { absolute: 15000, percentage: 5.2 },
    totalNet: { previous: 288_461.54, current: 303_461.54, absolute: 15000, percentage: 5.2 },
    totalGross: { previous: 360_576.92, current: 379_326.92, absolute: 18_750, percentage: 5.2 },
    incompleteTotals: { grossMissing: 0, netMissing: 0 },
    employeesAffected: { total: 100, increased: 30, decreased: 10, unchanged: 60 },
    newEmployees: 3,
    departedEmployees: 2,
    largestIncrease: { employeeName: "Alice Smith", department: "Engineering", amount: 2500 },
    largestDecrease: { employeeName: "Bob Jones", department: "Sales", amount: -1800 },
    averageChange: { absolute: 150, percentage: 2.1 },
    distribution: [],
    componentBreakdown: [{ component: "base_salary", totalChange: 12000, employeeCount: 40 }],
    departmentBreakdown: [],
    topMovers: [],
    anomalies: [],
    ...overrides,
  };
}

describe("formatMoney", () => {
  it("uses the currency code and never a symbol", () => {
    expect(formatMoney(1234.5, "USD")).toContain("USD");
    expect(formatMoney(1234.5, "USD")).not.toContain("$");
    expect(formatMoney(1234.5, "LBP")).toContain("LBP");
    expect(formatMoney(1234.5, "KWD")).toContain("KWD");
  });

  it("keeps the code with its figure, so a narrow column cannot split them", () => {
    expect(formatMoney(1234.5, "USD")).toBe("USD\u00a01,234.50");
  });

  it("names the code even when Intl does not know it", () => {
    // An unrecognised code must neither throw nor silently print a bare number.
    expect(plain(formatMoney(1234.5, "ZZZ"))).toBe("ZZZ 1,234.50");
  });

  it("returns a dash rather than NaN", () => {
    expect(formatMoney(Number.NaN, "USD")).toBe("—");
  });
});

describe("generateNarrative currency (step 8b)", () => {
  it("states amounts in the company's currency, not dollars", async () => {
    const result = await generateNarrative(makeSummary(), "Beirut Co", "Jul", "Jun", "LBP");
    const text = [result.summary, ...result.highlights, ...result.concerns].join(" ");

    expect(text).toContain("LBP");
    expect(text).not.toContain("$");
  });

  it("carries the code onto every amount it prints, not only the headline", async () => {
    const result = await generateNarrative(makeSummary(), "Kuwait Co", "Jul", "Jun", "KWD");

    expect(result.summary).toContain("KWD");
    // The largest increase, the largest decrease and the average change.
    expect(result.highlights).toHaveLength(3);
    for (const line of result.highlights) {
      expect(line, line).toContain("KWD");
    }
  });

  it("still reads correctly for a dollar company", async () => {
    const result = await generateNarrative(makeSummary(), "Acme", "Jul", "Jun", "USD");
    expect(plain(result.summary)).toContain("USD 15,000.00");
  });
});

describe("generateAuditSummary currency (step 8b)", () => {
  const input = {
    summary: makeSummary() as unknown as DashboardSummary,
    companyName: "Beirut Co",
    currentPeriod: "Jul 2026",
    previousPeriod: "Jun 2026",
  };

  it("has no dollar sign left in the rule-based summary", async () => {
    const audit = await generateAuditSummary({ ...input, currency: "LBP" });

    // The four sites the audit found: the executive line, the average change,
    // and both largest movers. Plus the component breakdown.
    expect(audit).not.toContain("$");
    expect(audit).toContain("LBP");
    expect(plain(audit)).toContain("Net pay increase by LBP 15,000.00");
  });

  it("labels the average change and both movers, not just the headline", async () => {
    const audit = await generateAuditSummary({ ...input, currency: "KWD" });

    expect(plain(audit)).toContain("Average Change per Employee:** increase of KWD 150.00");
    expect(plain(audit)).toContain("+KWD 2,500.00");
    expect(plain(audit)).toContain("-KWD 1,800.00");
    expect(plain(audit)).toContain("**base_salary:** +KWD 12,000.00");
  });
});
