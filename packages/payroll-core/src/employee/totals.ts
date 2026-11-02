import type { Category, ComponentAggregate } from "../annual/types";
import {
  EARNING_CATEGORIES,
  EMPLOYEE_DEDUCTION_CATEGORIES,
  EMPLOYER_COST_CATEGORIES,
} from "../annual/types";
import { buildCategoryTotals, sumMoney } from "../annual/categoryTotals";
import { roundToMinorUnits } from "../money";
import type { EmployeeSnapshotRow } from "./types";

/**
 * Per-slot category totals and the two balancing lines (step C3).
 *
 * The balancing lines are the whole of blocking gap B1. Without them the file
 * shows a gross and a "total earnings" that differ with nothing on screen to
 * explain it: on `samples/2025`, E0002's expense reimbursements are 3,604.74 for
 * the year and classify as `uncategorised`, so 1.3% of that person's pay simply
 * vanishes from mapped earnings.
 */

/** base_salary + allowance. */
const RECURRING_CATEGORIES: readonly Category[] = ["base_salary", "allowance"];

/** bonus_commission + overtime + other_earning. */
const VARIABLE_CATEGORIES: readonly Category[] = [
  "bonus_commission",
  "overtime",
  "other_earning",
];

/**
 * Fold an employee's snapshot rows for one slot into per-key aggregates.
 *
 * `total` sums only rows where the key is **present and non-null**, so an
 * absent cell contributes nothing and does not turn the key into a zero.
 * `negRows` / `posRows` count each sign, which is what `buildCategoryTotals`
 * reads to report a key written both ways.
 *
 * Keys are first-seen ordered, so the component matrix is stable between runs.
 */
export function buildComponentAggregates(
  rows: readonly EmployeeSnapshotRow[],
  decimals: number,
): ComponentAggregate[] {
  const byKey = new Map<string, ComponentAggregate>();

  for (const row of rows) {
    for (const [key, raw] of Object.entries(row.components)) {
      if (raw === null || raw === undefined) continue;
      if (!Number.isFinite(raw)) continue;
      const value = roundToMinorUnits(raw, decimals);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          total: value,
          negRows: value < 0 ? 1 : 0,
          posRows: value > 0 ? 1 : 0,
        });
        continue;
      }
      existing.total = roundToMinorUnits(existing.total + value, decimals);
      if (value < 0) existing.negRows += 1;
      if (value > 0) existing.posRows += 1;
    }
  }

  return [...byKey.values()];
}

export interface SlotMoney {
  byCategory: Partial<Record<Category, number>>;
  quantities: Partial<Record<"absence_days" | "other_quantity", number>>;
  byKey: Record<string, { category: Category; total: number }>;
  components: ComponentAggregate[];
  earnings: number;
  deductions: number;
  employerCosts: number;
  earnBal: number;
  netBal: number;
  recurring: number;
  variable: number;
  mixedSignKeys: string[];
  uncategorisedKeys: string[];
}

/**
 * The money for one slot.
 *
 * `buildCategoryTotals` is **reused rather than re-summed**, and that is the
 * point of this function rather than an inlined loop. It already applies
 * `Math.abs` to deduction and employer categories so the bridge holds whichever
 * sign convention the register uses, already keeps quantities and `ignore` out
 * of money, and already reports a key carrying both signs. Re-implementing any
 * of that is how the Employee File ends up disagreeing with the annual
 * dashboard about the same column.
 *
 * `resolve` must be the three-step resolution of spec 2.2 — the company's saved
 * `component_categories.category`, else `classifyComponent(key)`, else
 * `uncategorised`. One classifier, one answer.
 */
export function buildSlotMoney(opts: {
  rows: readonly EmployeeSnapshotRow[];
  gross: number;
  net: number;
  resolve: (key: string) => Category;
  ambiguityOf?: (key: string) => { question: string } | undefined;
  decimals: number;
}): SlotMoney {
  const { rows, gross, net, resolve, ambiguityOf, decimals } = opts;
  const round = (v: number) => roundToMinorUnits(v, decimals);

  const components = buildComponentAggregates(rows, decimals);
  const totals = buildCategoryTotals(components, resolve, ambiguityOf);

  const earnings = round(sumMoney(totals.byCategory, EARNING_CATEGORIES));
  const deductions = round(sumMoney(totals.byCategory, EMPLOYEE_DEDUCTION_CATEGORIES));
  const employerCosts = round(sumMoney(totals.byCategory, EMPLOYER_COST_CATEGORIES));

  return {
    byCategory: totals.byCategory,
    quantities: totals.quantities,
    byKey: totals.byKey,
    components,
    earnings,
    deductions,
    employerCosts,
    // Both are returned always, and rendered as their own labelled lines
    // whenever non-zero. They exist because real uploads have unmapped columns,
    // and without them the file silently omits whatever was not categorised.
    earnBal: round(gross - earnings),
    netBal: round(gross - net - deductions),
    recurring: round(sumMoney(totals.byCategory, RECURRING_CATEGORIES)),
    variable: round(sumMoney(totals.byCategory, VARIABLE_CATEGORIES)),
    mixedSignKeys: totals.mixedSignKeys,
    uncategorisedKeys: totals.uncategorisedKeys,
  };
}

/** Sum a field across slots at the currency's minor unit. */
export function sumSlots<T>(
  slots: readonly T[],
  pick: (slot: T) => number | null,
  decimals: number,
): number {
  let total = 0;
  for (const slot of slots) {
    const value = pick(slot);
    if (value === null || !Number.isFinite(value)) continue;
    total += value;
  }
  return roundToMinorUnits(total, decimals);
}
