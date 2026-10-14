/**
 * Under test, a non-finite amount is a bug in the caller, not something to paper
 * over (finding C17). In production it still coerces to 0 so a single bad
 * component cannot blank the whole dashboard.
 */
const THROW_ON_NON_FINITE =
  typeof process !== "undefined" &&
  (process.env?.["VITEST"] === "true" || process.env?.["NODE_ENV"] === "test");

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    if (THROW_ON_NON_FINITE) {
      throw new Error(`roundMoney received a non-finite value: ${value}`);
    }
    return 0;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
