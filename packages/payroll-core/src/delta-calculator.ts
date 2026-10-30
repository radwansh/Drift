import { DEFAULT_MINOR_UNITS, roundToMinorUnits } from "./money";

/**
 * `decimals` is the currency's minor units (step 8a). It defaults to 2, so a
 * caller that does not know its currency behaves exactly as before; a KWD
 * caller passes 3 and a one-fils movement survives instead of rounding to
 * nothing.
 *
 * The percentage is rounded to the same number of places as the money, which
 * is what it did before and is unrelated to the currency — it is kept in step
 * with `decimals` only because every existing assertion depends on the two
 * being the same at 2.
 */
export function calculateDelta(
  current: number | null,
  previous: number | null,
  decimals: number = DEFAULT_MINOR_UNITS,
): { absolute: number | null; percentage: number | null } {
  const round = (value: number) => roundToMinorUnits(value, decimals);

  if (current === null && previous === null) {
    return { absolute: null, percentage: null };
  }

  if (current === null) {
    const abs = -(previous as number);
    const pct = previous !== 0 ? -100 : null;
    return { absolute: round(abs), percentage: pct !== null ? round(pct) : null };
  }

  if (previous === null) {
    return { absolute: round(current), percentage: null };
  }

  const absolute = round(current - previous);
  const percentage = previous !== 0 ? round((absolute / previous) * 100) : null;

  return { absolute, percentage };
}

/**
 * Kept because callers and tests import it. `roundToMinorUnits` from ./money is the
 * one to reach for in new code — this is the two-decimal case of it.
 */
export function round2(value: number): number {
  return roundToMinorUnits(value, DEFAULT_MINOR_UNITS);
}
