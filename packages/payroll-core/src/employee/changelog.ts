import { roundToMinorUnits, smallestUnit } from "../money";
import { gapLabelsBetween, paidSlots } from "./slots";
import type { ChangeLogEntry, ChangeLogKind, EmployeeSlotRow } from "./types";

/**
 * The change log (step C7): derived, never stored.
 *
 * One entry per detected change between consecutive paid slots. A change is
 * `|delta| > q`, where q is the currency's own smallest unit — never a
 * hardcoded 0.01, so a one-fils KWD movement registers and a whole-yen JPY
 * movement is not called nothing.
 *
 * **Every entry states what moved, never why.** Clarivo holds no reason codes,
 * so "promotion", "merit review" and "cost-of-living adjustment" are not in
 * this vocabulary at all. Adding one would be the product asserting a cause the
 * data cannot support.
 *
 * Entries are computed between consecutive members of P(e) rather than of C.
 * Spec 4.6 says "consecutive covered slots", but a `not_paid` slot carries no
 * name, no department and no components, so pairing a paid slot with one would
 * report every component removed and then re-added. The absence itself is
 * already reported — by the presence spans, by the status badge and by the
 * coverage line — so reporting it again as twelve component removals would be
 * noise standing in for a fact that is already on the page.
 */

function pct(current: number, previous: number, decimals: number): number | null {
  if (previous === 0) return null;
  return roundToMinorUnits(((current - previous) / Math.abs(previous)) * 100, decimals);
}

/** Per-key totals for one slot, so a rate change can be named per component. */
function keyTotals(slot: EmployeeSlotRow): Map<string, { category: string; total: number }> {
  const map = new Map<string, { category: string; total: number }>();
  for (const [key, entry] of Object.entries(slot.byKey)) {
    map.set(key, { category: entry.category, total: entry.total });
  }
  return map;
}

export interface BuildChangeLogOptions {
  slots: readonly EmployeeSlotRow[];
  decimals: number;
}

export function buildChangeLog(opts: BuildChangeLogOptions): ChangeLogEntry[] {
  const { slots, decimals } = opts;
  const q = smallestUnit(decimals);
  const paid = paidSlots(slots);
  const entries: ChangeLogEntry[] = [];

  const first = paid[0];
  if (!first) return entries;

  const base = (
    kind: ChangeLogKind,
    from: EmployeeSlotRow | null,
    to: EmployeeSlotRow,
    gapLabels: string[],
  ) => ({
    kind,
    fromSlot: from ? from.slot.label : null,
    toSlot: to.slot.label,
    fromIndex: from ? from.slot.index : null,
    toIndex: to.slot.index,
    spansGap: gapLabels.length > 0,
    gapLabels,
  });

  entries.push({
    ...base("first_appearance", null, first, []),
    key: null,
    previous: null,
    current: first.name,
    absolute: null,
    percentage: null,
  });

  for (let i = 1; i < paid.length; i++) {
    const previous = paid[i - 1];
    const current = paid[i];
    if (!previous || !current) continue;

    // "between Mar and May (Apr not uploaded)" — only `missing` slots count as
    // a gap. A `not_paid` slot in between is a fact about this employee, not a
    // hole in the data.
    const gapLabels = gapLabelsBetween(slots, previous.slot.index, current.slot.index);
    const at = (kind: ChangeLogKind) => base(kind, previous, current, gapLabels);

    const previousKeys = keyTotals(previous);
    const currentKeys = keyTotals(current);

    for (const [key, entry] of currentKeys) {
      const before = previousKeys.get(key);

      // Absent -> a value is "component added"; 0 -> a value is a movement
      // (spec 7.14). The two are different facts and must read differently.
      if (!before) {
        if (Math.abs(entry.total) <= q) continue;
        entries.push({
          ...at("component_added"),
          key,
          previous: null,
          current: entry.total,
          absolute: entry.total,
          percentage: null,
        });
        continue;
      }

      const delta = roundToMinorUnits(entry.total - before.total, decimals);
      if (Math.abs(delta) <= q) continue;

      // A rate change is named **per component**, never inferred from gross.
      const kind: ChangeLogKind =
        entry.category === "base_salary"
          ? "base_rate"
          : entry.category === "allowance"
            ? "allowance"
            : "component_added";

      // A movement on something that is neither base nor an allowance is still
      // a movement, not an addition, so it is only logged under the two rate
      // kinds. Anything else is visible in the component matrix and would make
      // the log a second copy of it.
      if (kind === "component_added") continue;

      entries.push({
        ...at(kind),
        key,
        previous: before.total,
        current: entry.total,
        absolute: delta,
        percentage: pct(entry.total, before.total, decimals),
      });
    }

    for (const [key, before] of previousKeys) {
      if (currentKeys.has(key)) continue;
      if (Math.abs(before.total) <= q) continue;
      entries.push({
        ...at("component_removed"),
        key,
        previous: before.total,
        current: null,
        absolute: roundToMinorUnits(-before.total, decimals),
        percentage: null,
      });
    }

    if ((previous.department ?? null) !== (current.department ?? null)) {
      entries.push({
        ...at("department"),
        key: null,
        previous: previous.department,
        current: current.department,
        absolute: null,
        percentage: null,
      });
    }

    if ((previous.name ?? null) !== (current.name ?? null)) {
      entries.push({
        ...at("name"),
        key: null,
        previous: previous.name,
        current: current.name,
        absolute: null,
        percentage: null,
      });
    }

    if (previous.fte !== null && current.fte !== null) {
      const delta = current.fte - previous.fte;
      if (Math.abs(delta) > q) {
        entries.push({
          ...at("fte"),
          key: null,
          previous: previous.fte,
          current: current.fte,
          absolute: delta,
          percentage: pct(current.fte, previous.fte, decimals),
        });
      }
    } else if (previous.fte === null && current.fte !== null) {
      entries.push({
        ...at("fte"),
        key: null,
        previous: null,
        current: current.fte,
        absolute: null,
        percentage: null,
      });
    }

    // Dimensions are open-ended, so both sides are walked: a key appearing is as
    // much a change as a key's value moving.
    const dimensionKeys = new Set([
      ...Object.keys(previous.dimensions),
      ...Object.keys(current.dimensions),
    ]);
    for (const key of dimensionKeys) {
      const before = previous.dimensions[key] ?? null;
      const after = current.dimensions[key] ?? null;
      if (before === after) continue;
      entries.push({
        ...at("dimension"),
        key,
        previous: before,
        current: after,
        absolute: null,
        percentage: null,
      });
    }

    // A currency or cadence change is a **scope** change, so it is logged and
    // the figures are never merged across it. It can only appear here when the
    // caller has widened the scope by mistake, which is exactly when it needs
    // to be visible rather than silently summed.
    const previousCurrency = previous.rows[0]?.currency ?? null;
    const currentCurrency = current.rows[0]?.currency ?? null;
    if (previousCurrency && currentCurrency && previousCurrency !== currentCurrency) {
      entries.push({
        ...at("currency"),
        key: null,
        previous: previousCurrency,
        current: currentCurrency,
        absolute: null,
        percentage: null,
      });
    }
  }

  // The last slot the employee was paid in. Named rather than inferred, so a
  // leaver and a gap in uploads read differently on the log as well as on the
  // period table.
  const last = paid[paid.length - 1];
  if (last && last !== first) {
    entries.push({
      ...base("last_appearance", null, last, []),
      key: null,
      previous: null,
      current: last.name,
      absolute: null,
      percentage: null,
    });
  }

  return entries;
}
