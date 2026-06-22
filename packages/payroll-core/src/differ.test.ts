import { describe, it, expect } from "vitest";
import { diffComponents } from "./differ";

describe("diffComponents", () => {
  it("diffs components with matching keys", () => {
    const current = { salary: 5000, bonus: 1000 };
    const previous = { salary: 4500, bonus: 1000 };

    const result = diffComponents(current, previous);
    expect(result).toHaveLength(2);

    const salaryDelta = result.find((d) => d.component === "salary")!;
    expect(salaryDelta.absoluteDiff).toBe(500);
    expect(salaryDelta.percentageDiff).toBeCloseTo(11.11, 1);

    const bonusDelta = result.find((d) => d.component === "bonus")!;
    expect(bonusDelta.absoluteDiff).toBe(0);
    expect(bonusDelta.percentageDiff).toBe(0);
  });

  it("handles new component in current", () => {
    const current = { salary: 5000, bonus: 1000 };
    const previous = { salary: 4500 };

    const result = diffComponents(current, previous);
    expect(result).toHaveLength(2);

    const bonusDelta = result.find((d) => d.component === "bonus")!;
    expect(bonusDelta.previousValue).toBeNull();
    expect(bonusDelta.currentValue).toBe(1000);
    expect(bonusDelta.absoluteDiff).toBe(1000);
    expect(bonusDelta.percentageDiff).toBeNull();
  });

  it("handles removed component in previous", () => {
    const current = { salary: 5000 };
    const previous = { salary: 4500, bonus: 1000 };

    const result = diffComponents(current, previous);
    expect(result).toHaveLength(2);

    const bonusDelta = result.find((d) => d.component === "bonus")!;
    expect(bonusDelta.previousValue).toBe(1000);
    expect(bonusDelta.currentValue).toBeNull();
    expect(bonusDelta.absoluteDiff).toBe(-1000);
    expect(bonusDelta.percentageDiff).toBe(-100);
  });

  it("handles null values in components", () => {
    const current = { salary: null };
    const previous = { salary: 5000 };

    const result = diffComponents(current, previous);
    expect(result).toHaveLength(1);
    expect(result[0].currentValue).toBeNull();
    expect(result[0].previousValue).toBe(5000);
    expect(result[0].absoluteDiff).toBe(-5000);
  });

  it("handles empty maps", () => {
    const result = diffComponents({}, {});
    expect(result).toHaveLength(0);
  });

  it("handles zero values without division by zero", () => {
    const current = { salary: 5000 };
    const previous = { salary: 0 };

    const result = diffComponents(current, previous);
    expect(result[0].absoluteDiff).toBe(5000);
    expect(result[0].percentageDiff).toBeNull();
  });

  it("sorts components alphabetically", () => {
    const current = { z: 1, a: 2, m: 3 };
    const previous = { z: 1, a: 2, m: 3 };

    const result = diffComponents(current, previous);
    expect(result.map((r) => r.component)).toEqual(["a", "m", "z"]);
  });
});
