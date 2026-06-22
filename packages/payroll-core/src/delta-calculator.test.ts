import { describe, it, expect } from "vitest";
import { calculateDelta, round2 } from "./delta-calculator";

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(100.4567)).toBe(100.46);
  });

  it("handles negative numbers", () => {
    expect(round2(-1.234)).toBe(-1.23);
    expect(round2(-1.235)).toBe(-1.24);
  });

  it("handles whole numbers", () => {
    expect(round2(5)).toBe(5);
    expect(round2(0)).toBe(0);
  });
});

describe("calculateDelta", () => {
  it("returns nulls when both values are null", () => {
    const result = calculateDelta(null, null);
    expect(result.absolute).toBeNull();
    expect(result.percentage).toBeNull();
  });

  it("returns current as absolute when previous is null", () => {
    const result = calculateDelta(5000, null);
    expect(result.absolute).toBe(5000);
    expect(result.percentage).toBeNull();
  });

  it("returns negative of previous as absolute when current is null", () => {
    const result = calculateDelta(null, 5000);
    expect(result.absolute).toBe(-5000);
    expect(result.percentage).toBe(-100);
  });

  it("calculates positive delta correctly", () => {
    const result = calculateDelta(6000, 5000);
    expect(result.absolute).toBe(1000);
    expect(result.percentage).toBe(20);
  });

  it("calculates negative delta correctly", () => {
    const result = calculateDelta(4000, 5000);
    expect(result.absolute).toBe(-1000);
    expect(result.percentage).toBe(-20);
  });

  it("returns zero absolute and percentage when values are equal", () => {
    const result = calculateDelta(5000, 5000);
    expect(result.absolute).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it("handles division by zero when previous is 0", () => {
    const result = calculateDelta(5000, 0);
    expect(result.absolute).toBe(5000);
    expect(result.percentage).toBeNull();
  });

  it("rounds to 2 decimal places", () => {
    const result = calculateDelta(100.333, 50.111);
    expect(result.absolute).toBe(50.22);
    expect(result.percentage).toBe(100.22);
  });

  it("handles negative numbers", () => {
    const result = calculateDelta(-1000, 1000);
    expect(result.absolute).toBe(-2000);
    expect(result.percentage).toBe(-200);
  });

  it("handles zero to zero transition", () => {
    const result = calculateDelta(0, 0);
    expect(result.absolute).toBe(0);
    expect(result.percentage).toBeNull();
  });
});
