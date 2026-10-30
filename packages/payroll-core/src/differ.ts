import type { ComponentDelta } from "./types";
import { calculateDelta } from "./delta-calculator";
import { DEFAULT_MINOR_UNITS } from "./money";

/** `decimals` is the currency's minor units (step 8a); 2 by default. */
export function diffComponents(
  currentComponents: Record<string, number | null>,
  previousComponents: Record<string, number | null>,
  decimals: number = DEFAULT_MINOR_UNITS,
): ComponentDelta[] {
  const allKeys = new Set([
    ...Object.keys(currentComponents),
    ...Object.keys(previousComponents),
  ]);

  const deltas: ComponentDelta[] = [];

  for (const key of allKeys) {
    const current = key in currentComponents ? currentComponents[key] ?? null : null;
    const previous = key in previousComponents ? previousComponents[key] ?? null : null;

    const { absolute, percentage } = calculateDelta(current, previous, decimals);

    deltas.push({
      component: key,
      previousValue: previous,
      currentValue: current,
      absoluteDiff: absolute,
      percentageDiff: percentage,
    });
  }

  deltas.sort((a, b) => a.component.localeCompare(b.component));
  return deltas;
}
