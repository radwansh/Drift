import { DEFAULT_MINOR_UNITS, roundToMinorUnits } from "../money";
/**
 * Under test, a non-finite amount is a bug in the caller, not something to paper
 * over (finding C17). In production it still coerces to 0 so a single bad
 * component cannot blank the whole dashboard.
 */
const THROW_ON_NON_FINITE =
  typeof process !== "undefined" &&
  (process.env?.["VITEST"] === "true" || process.env?.["NODE_ENV"] === "test");

/**
 * `decimals` is the currency's minor units (step 8a), defaulting to 2 so every
 * existing call site is byte-identical. The annual engine's 82 call sites are
 * threaded in step 8a-ii; this signature is what that change needs.
 *
 * The `Number.EPSILON` nudge is kept: it is what makes a value like 1.005
 * round up rather than down, and removing it would move figures the whole
 * annual suite asserts.
 */
export function roundMoney(value: number, decimals: number = DEFAULT_MINOR_UNITS): number {
  if (!Number.isFinite(value)) {
    if (THROW_ON_NON_FINITE) {
      throw new Error(`roundMoney received a non-finite value: ${value}`);
    }
    return 0;
  }
  return roundToMinorUnits(value + Number.EPSILON, decimals);
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function pct(num: number, den: number): number | null {
  if (!den || !Number.isFinite(den)) return null;
  return (num / den) * 100;
}

/**
 * Signed percentage change, or null when the base is zero.
 *
 * v1 returned +100% against a zero base (finding C10/P16), which read as "payroll
 * doubled" when the truth is that there is nothing to compare against.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0 || !Number.isFinite(previous)) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Middle value, averaging the two middle values for an even count.
 *
 * Used by the forecast to find a recurring level that one large month cannot
 * move (step 6): a mean is dragged by a March annual bonus, a median is not.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
