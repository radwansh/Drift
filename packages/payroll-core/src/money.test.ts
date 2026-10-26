import { describe, it, expect } from "vitest";
import {
  DEFAULT_MINOR_UNITS,
  minorUnits,
  roundToMinorUnits,
  smallestUnit,
} from "./money";

describe("minorUnits", () => {
  it("defaults to two for the currencies that use two", () => {
    for (const code of ["USD", "EUR", "GBP", "AED", "SAR", "EGP", "LBP"]) {
      expect(minorUnits(code)).toBe(2);
    }
  });

  it("knows the three-decimal currencies in this product's market", () => {
    // Kuwait, Bahrain, Oman, Jordan, Tunisia, Iraq and Libya.
    for (const code of ["KWD", "BHD", "OMR", "JOD", "TND", "IQD", "LYD"]) {
      expect(minorUnits(code)).toBe(3);
    }
  });

  it("knows the zero-decimal currencies", () => {
    for (const code of ["JPY", "KRW", "VND", "XOF", "ISK"]) {
      expect(minorUnits(code)).toBe(0);
    }
  });

  it("is case and whitespace insensitive", () => {
    expect(minorUnits("kwd")).toBe(3);
    expect(minorUnits(" KWD ")).toBe(3);
  });

  it("falls back rather than throwing on an unknown or absent code", () => {
    // A company whose currency this table has not met should still get a
    // working dashboard.
    expect(minorUnits("ZZZ")).toBe(DEFAULT_MINOR_UNITS);
    expect(minorUnits("")).toBe(DEFAULT_MINOR_UNITS);
    expect(minorUnits(null)).toBe(DEFAULT_MINOR_UNITS);
    expect(minorUnits(undefined)).toBe(DEFAULT_MINOR_UNITS);
  });
});

describe("smallestUnit", () => {
  it("is the smallest amount the currency can express", () => {
    expect(smallestUnit(2)).toBeCloseTo(0.01, 10);
    expect(smallestUnit(3)).toBeCloseTo(0.001, 10);
    expect(smallestUnit(0)).toBe(1);
  });

  it("defaults to the two-decimal case, which is the old fixed threshold", () => {
    expect(smallestUnit()).toBeCloseTo(0.01, 10);
  });
});

describe("the floating-point edge the threshold has to survive", () => {
  it("a true one-fils movement computes below its own threshold", () => {
    // Why classifyEmployeeStatus rounds below the minor unit before testing.
    // This is not hypothetical: it is the plan's KWD case, and the naive
    // threshold let it through as "no change".
    const raw = 1172.84 - 1172.839;
    expect(raw).toBeLessThan(0.001);
    expect(raw).not.toBe(0.001);

    // Rounded two places below the currency's precision, it is a change again.
    expect(roundToMinorUnits(raw, 5)).toBeCloseTo(0.001, 10);
    expect(roundToMinorUnits(raw, 5) < smallestUnit(3)).toBe(false);
  });

  it("rounding below the minor unit does not promote a sub-unit difference", () => {
    // The reason it rounds to decimals + 2 rather than to the minor unit:
    // rounding 0.005 to two decimals gives 0.01, which would reclassify a
    // half-cent as a change and break every existing USD assertion.
    expect(roundToMinorUnits(0.005, 4)).toBe(0.005);
    expect(roundToMinorUnits(0.005, 2)).toBe(0.01);
  });
});

describe("roundToMinorUnits", () => {
  it("is unchanged at two decimals", () => {
    // The guarantee that makes step 8a safe to thread gradually: the default
    // is arithmetically identical to the `Math.round(v * 100) / 100` it
    // replaced, so an untouched caller cannot move.
    for (const v of [0, 1.005, -1.005, 1234.5678, -0.004, 99.999, 1e9]) {
      expect(roundToMinorUnits(v)).toBe(Math.round(v * 100) / 100);
      expect(roundToMinorUnits(v, 2)).toBe(Math.round(v * 100) / 100);
    }
  });

  it("keeps the third decimal of a three-decimal currency", () => {
    expect(roundToMinorUnits(1172.839, 3)).toBeCloseTo(1172.839, 6);
    // The same amount at two decimals is where the fils went.
    expect(roundToMinorUnits(1172.839, 2)).toBeCloseTo(1172.84, 6);
  });

  it("holds precision on a currency with values in the billions", () => {
    // LBP is two minor units by ISO 4217 even though nobody prices in
    // piastres, so the guard that matters is that the scale does not lose
    // magnitude.
    expect(roundToMinorUnits(1_000_000_000, minorUnits("LBP"))).toBe(1_000_000_000);
    expect(roundToMinorUnits(1_234_567_890.12, 2)).toBe(1_234_567_890.12);
  });

  it("rounds to whole units for a zero-decimal currency", () => {
    expect(roundToMinorUnits(1234.6, 0)).toBe(1235);
    expect(roundToMinorUnits(1234.4, 0)).toBe(1234);
  });
});
