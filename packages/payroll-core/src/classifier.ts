import type { MatchedPair } from "./types";
import { DEFAULT_MINOR_UNITS, roundToMinorUnits, smallestUnit } from "./money";

/**
 * "Did this change at all" is answered against the currency's smallest unit
 * (step 8a), not a fixed 0.01. On KWD a one-fils movement — a real change the
 * payslip shows — was below the old threshold and classified "unchanged"; on
 * a zero-decimal currency a whole-unit movement would have been too.
 *
 * `decimals` defaults to 2, where `smallestUnit` is exactly 0.01, so existing
 * behaviour is unchanged.
 */
export function classifyEmployeeStatus(
  currentNet: number | null,
  previousNet: number | null,
  decimals: number = DEFAULT_MINOR_UNITS,
): "unchanged" | "increased" | "decreased" | "new" | "departed" {
  const threshold = smallestUnit(decimals);
  if (currentNet === null && previousNet === null) {
    return "unchanged";
  }
  if (currentNet === null) {
    return "departed";
  }
  if (previousNet === null) {
    return "new";
  }

  // Absorb floating-point noise two places below the currency's own precision
  // before testing. `1172.840 - 1172.839` computes as 0.0009999999999763531,
  // which is strictly below a 0.001 threshold even though the payslip shows a
  // one-fils movement — so the fix for the fixed-0.01 threshold would have
  // been undone by the representation.
  //
  // Rounding below the minor unit rather than to it keeps the original strict
  // comparison, so a two-decimal currency is unchanged: a 0.005 difference
  // still reads as unchanged, where rounding to the minor unit would have
  // promoted it to 0.01 and called it a change.
  const diff = roundToMinorUnits(currentNet - previousNet, decimals + 2);
  if (Math.abs(diff) < threshold) {
    return "unchanged";
  }
  return diff > 0 ? "increased" : "decreased";
}

export function classifyMatchedPairs(
  pairs: MatchedPair[],
  decimals: number = DEFAULT_MINOR_UNITS,
): MatchedPair[] {
  return pairs.map((pair) => {
    const status = classifyEmployeeStatus(
      pair.current?.netSalary ?? null,
      pair.previous?.netSalary ?? null,
      decimals,
    );
    return { ...pair, status };
  });
}
