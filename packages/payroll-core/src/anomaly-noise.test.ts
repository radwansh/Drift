import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runComparison } from "./comparator";
import type { EmployeeRecord } from "./types";

/**
 * The measurement that justified step 5, held as a test rather than a claim.
 *
 * The old detector produced 3,166 flags across the eleven consecutive
 * comparisons in `samples/2025`, none of them critical, and 100% of them the
 * same rule: any component equal to zero, raised twice per employee. On a
 * 150-person month where nobody worked overtime that is ~300 flags saying
 * nothing, which is the same as having no alerts at all.
 *
 * Reads the real registers rather than embedding totals, because the thing
 * being measured is per-employee flag volume.
 */

const SAMPLES = join(import.meta.dirname, "..", "..", "..", "samples", "2025");

function loadMonth(file: string): EmployeeRecord[] {
  const text = readFileSync(join(SAMPLES, file), "utf8").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine!.split(",");

  const idx = (name: string) => headers.findIndex((h) => h.trim() === name);
  const iId = idx("Employee ID");
  const iName = idx("Full Name");
  const iDept = idx("Department");
  const iGross = idx("Gross Salary");
  const iNet = idx("Net Salary");

  // Everything that is not an identifier or a total is a component, which is
  // the same rule the upload processor applies.
  const componentCols = headers
    .map((h, i) => ({ key: h.trim(), i }))
    .filter(({ i }) => ![iId, iName, iDept, iGross, iNet].includes(i));

  return lines.map((line) => {
    const cells = line.split(",");
    const components: Record<string, number | null> = {};
    for (const { key, i } of componentCols) {
      const raw = cells[i]?.trim() ?? "";
      components[key] = raw === "" ? null : Number(raw);
    }
    return {
      externalId: cells[iId]!.trim(),
      name: cells[iName]!.trim(),
      department: cells[iDept]?.trim() ?? null,
      components,
      grossSalary: Number(cells[iGross]),
      netSalary: Number(cells[iNet]),
    };
  });
}

const months = readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".csv"))
  .sort();

describe("anomaly volume across samples/2025", () => {
  it("has the twelve registers to compare", () => {
    expect(months).toHaveLength(12);
  });

  it("raises a tractable number of flags, not one per zero cell", () => {
    const loaded = months.map(loadMonth);
    const bySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0 };
    const byType: Record<string, number> = {};
    let total = 0;
    let rows = 0;

    for (let i = 1; i < loaded.length; i++) {
      const { results, summary } = runComparison(loaded[i]!, loaded[i - 1]!, { currency: "USD" });
      rows += results.length;
      for (const a of summary.anomalies) {
        total++;
        bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
        byType[a.type] = (byType[a.type] ?? 0) + 1;
      }
    }

    /**
     * Measured on this fixture: 11 comparisons, 1,660 rows,
     *
     *   total 382 — all `net_change_beyond_tolerance`, all warnings
     *   0 critical, 0 info
     *
     * Against 3,166 before, so an 8.3x fall. Two honest observations rather
     * than a victory lap:
     *
     * 1. One rule still dominates. The difference is what it says — "net fell
     *    100.0%, mostly from Overtime" is a sentence a payroll manager can act
     *    on, where "Employee has zero value component(s)" is not. But 382 on
     *    1,660 rows is 23%, which is high.
     *
     *    It is also the fixture: `samples/2025` was generated with deliberately
     *    large swings in headcount, overtime, absence and expense refunds, so a
     *    20% net movement is genuinely common in it. On a stable payroll it is
     *    rare. This is the case for per-company tolerances rather than one
     *    global number, and it is why `baseChangePct` and `netChangePct` are
     *    settings.
     *
     * 2. Zero criticals, and that is correct — not a gap. The impossible-value
     *    rules fire on net above gross and negative net, and this fixture
     *    contains neither. The plan expected "at least one critical" from this
     *    data, which was an assumption about the fixture rather than a property
     *    of it. Those rules are bound by unit cases in
     *    anomaly-detector.test.ts, where the values exist.
     */
    expect(total).toBeLessThan(500);
    expect(bySeverity.critical).toBe(0);

    // The zero-value rule is gone, so nothing may come from it.
    expect(Object.keys(byType)).not.toContain("zero_salary_component");
    expect(Object.keys(byType)).not.toContain("zero_salary_component_previous");

    // Raising a tenth of the old volume is the point; if a future change puts
    // it back, this is the assertion that should fail.
    expect(total).toBeLessThan(3166 / 4);
  });
});
