/**
 * Per-currency minor units, and rounding that respects them.
 *
 * Step 8a of docs/PAYROLL_AUDIT_FIX_PLAN.md. Every rounding helper in this
 * package assumed two decimals, so a three-decimal currency lost its third
 * digit everywhere and silently: a KWD net movement of one fils rounded to
 * zero, `calculateDelta` returned 0, and the employee was classified
 * "unchanged". The bridge still balanced, because the same rounding was
 * applied to both sides of it, which is what made the loss invisible.
 *
 * Three-decimal currencies are not exotic for this product's market — KWD,
 * BHD, OMR, JOD, TND, IQD and LYD are all in it.
 *
 * Every helper here defaults to 2, so an existing call site that passes no
 * currency behaves exactly as it did. That default is what makes the change
 * safe to thread through gradually, and it is asserted: the whole USD suite
 * must be byte-identical.
 */

/**
 * ISO 4217 exponents that are not 2, by alphabetic code.
 *
 * Taken from the standard rather than from practice. Lebanon is a case where
 * the two differ — ISO gives LBP two minor units and nobody prices in
 * piastres — but following the standard costs nothing here (rounding a
 * billion to two places is exact in a double) and inventing a figure the
 * standard contradicts would be worse.
 */
const EXPONENTS: Readonly<Record<string, number>> = {
  // Zero minor units.
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three minor units.
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Four.
  CLF: 4, UYW: 4,
};

/** The default, and what every currency not listed above uses. */
export const DEFAULT_MINOR_UNITS = 2;

/**
 * Minor units for a currency code, falling back to 2.
 *
 * An unknown or empty code falls back rather than throwing: a company with a
 * currency this table has not met should still get a working dashboard, and
 * two decimals is right for the large majority.
 */
export function minorUnits(currencyCode: string | null | undefined): number {
  if (!currencyCode) return DEFAULT_MINOR_UNITS;
  return EXPONENTS[currencyCode.trim().toUpperCase()] ?? DEFAULT_MINOR_UNITS;
}

/**
 * The smallest amount the currency can express — 0.01 for USD, 0.001 for KWD,
 * 1 for JPY.
 *
 * This is the only defensible tolerance for "did this change at all". A fixed
 * 0.01 treated a one-fils movement as nothing, and on a zero-decimal currency
 * it would call a whole-unit movement nothing too.
 */
export function smallestUnit(decimals: number = DEFAULT_MINOR_UNITS): number {
  return 1 / 10 ** decimals;
}

/**
 * Round to the currency's minor units.
 *
 * `decimals` defaults to 2 and the arithmetic is unchanged at that value —
 * `10 ** 2` is exactly 100 — so every existing caller is byte-identical.
 *
 * Named apart from `roundMoney` in annual/math.ts, which is the annual
 * engine's entry point and keeps its own guard: under test a non-finite
 * amount throws there rather than coercing to 0, because in that engine a
 * NaN is a bug in the caller. This is the shared implementation both use.
 */
export function roundToMinorUnits(
  value: number,
  decimals: number = DEFAULT_MINOR_UNITS,
): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
