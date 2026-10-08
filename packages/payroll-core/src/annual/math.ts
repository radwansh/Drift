export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
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

export function safeRatio(prev: number, curr: number): number {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return 1;
  if (prev === 0) return curr === 0 ? 1 : 1;
  return curr / prev;
}