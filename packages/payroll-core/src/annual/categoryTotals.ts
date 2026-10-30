import type { Category, CategoryTotals, ComponentAggregate } from "./types";
import {
  EMPLOYEE_DEDUCTION_CATEGORIES,
  EMPLOYER_COST_CATEGORIES,
  MONEY_CATEGORIES,
} from "./types";

/**
 * Fold a period's component aggregates into category totals (spec 4.3).
 * Earnings keep their sign; employee deduction and employer cost categories
 * use the absolute value of each (signed) component total. Quantities and
 * "ignore" never enter money totals. A deduction/employer component that has
 * both negative and positive rows in the same period is flagged MIXED_SIGN.
 */
export function buildCategoryTotals(
  components: readonly ComponentAggregate[],
  resolve: (key: string) => Category,
  /**
   * The question a column raises, or undefined when it can be placed
   * (step 11). Passed in rather than imported so the caller owns the
   * suppression: a column the user has already decided must not be asked
   * about again, and that decision lives with the override.
   */
  ambiguityOf?: (key: string) => { question: string } | undefined,
): CategoryTotals {
  const byCategory: Partial<Record<Category, number>> = {};
  const quantities: Partial<Record<"absence_days" | "other_quantity", number>> = {};
  const byKey: Record<string, { category: Category; total: number }> = {};
  const mixedSignKeys: string[] = [];
  const uncategorisedKeys: string[] = [];
  const ambiguousKeys: { key: string; question: string }[] = [];

  for (const c of components) {
    const category = resolve(c.key);
    byKey[c.key] = { category, total: c.total };
    if (category === "ignore") continue;

    if (category === "absence_days" || category === "other_quantity") {
      quantities[category] = (quantities[category] ?? 0) + c.total;
      continue;
    }

    if (MONEY_CATEGORIES.includes(category)) {
      if (EMPLOYEE_DEDUCTION_CATEGORIES.includes(category) || EMPLOYER_COST_CATEGORIES.includes(category)) {
        byCategory[category] = (byCategory[category] ?? 0) + Math.abs(c.total);
        if (c.negRows > 0 && c.posRows > 0) mixedSignKeys.push(c.key);
      } else {
        byCategory[category] = (byCategory[category] ?? 0) + c.total;
      }
    } else {
      byCategory[category] = (byCategory[category] ?? 0) + c.total;
    }

    if (category === "uncategorised") {
      uncategorisedKeys.push(c.key);
      const note = ambiguityOf?.(c.key);
      if (note) ambiguousKeys.push({ key: c.key, question: note.question });
    }
  }

  return { byCategory, quantities, byKey, mixedSignKeys, uncategorisedKeys, ambiguousKeys };
}

export function sumCategories(
  rows: readonly Partial<Record<Category, number>>[],
): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v !== "number") continue;
      out[k as Category] = (out[k as Category] ?? 0) + v;
    }
  }
  return out;
}

export function sumMoney(row: Partial<Record<Category, number>>, categories: readonly Category[]): number {
  let total = 0;
  for (const c of categories) {
    const v = row[c];
    if (typeof v === "number") total += v;
  }
  return total;
}