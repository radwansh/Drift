import {
  gapLabelsBetween,
  type Category,
  type EmployeeSlotKind,
  type EmployeeSlotRow,
  type PeriodType,
} from "@saas/payroll-core";
import { shortPeriodLabel } from "@/components/annual/annual-utils";

/**
 * The period table's rows — and the chart's series, from the same array
 * (steps E5 and E6).
 *
 * **One computation rendered twice, never two.** The table and the stacked
 * chart are handed the same `PeriodRow[]`, so a figure cannot appear in one and
 * not the other, and a fix to either lands in both.
 *
 * Plain `.ts`, so `employee-file-ui.test.ts` can assert the thing that matters
 * most here: a slot nobody uploaded is **null**, never 0. `?? 0` anywhere below
 * would reintroduce the exact bug the nullable `gross`/`net` type prevents — a
 * slot nobody was paid in drawn as a zero-value bar, which reads as "paid
 * nothing" rather than "unknown".
 */

export interface PeriodRow {
  index: number;
  /** `ExpectedSlot.label` through `shortPeriodLabel`, never a raw ISO date. */
  label: string;
  fullLabel: string;
  start: string;
  end: string;
  kind: EmployeeSlotKind;
  /** Null for `missing` and `not_paid`. The reason comes from `kind`. */
  gross: number | null;
  net: number | null;
  recurring: number | null;
  variable: number | null;
  deductions: number | null;
  employerCosts: number | null;
  /** gross - mapped earnings. Its own labelled line whenever non-zero. */
  earnBal: number | null;
  /** gross - net - mapped deductions. */
  netBal: number | null;
  absenceDays: number | null;
  byCategory: Partial<Record<Category, number>> | null;
  department: string | null;
  rowCount: number;
  mergedRunCount: number;
  /** Δ gross against the previous **covered** slot with a figure. */
  deltaGross: number | null;
  deltaPct: number | null;
  /** True when a slot nobody uploaded lies between this row and that one. */
  spansGap: boolean;
  gapLabels: string[];
  slot: EmployeeSlotRow;
}

/**
 * The stacked series, which sum to gross on a slot that reconciles.
 *
 * `earnBal` is a series of its own rather than folded into "other earnings":
 * it is gross minus everything the classifier could place, so hiding it inside
 * a mapped category would make unmapped money look categorised. On
 * `samples/2025` it is E0002's 3,604.74 of reimbursements for the year.
 *
 * Colours are explicit `fill` values, **never** a Tailwind `className`:
 * Recharts does not apply classes to legend marks, so a classed chart renders
 * its legend black and loses it in dark mode. These are fixed hues rather than
 * theme variables because a stack needs six distinguishable colours and the
 * theme defines one accent.
 */
export const GROSS_STACK: readonly {
  key: Category | "earnBal";
  label: string;
  fill: string;
}[] = [
  { key: "base_salary", label: "Base salary", fill: "hsl(221 83% 53%)" },
  { key: "allowance", label: "Allowances", fill: "hsl(199 89% 48%)" },
  { key: "bonus_commission", label: "Bonus & commission", fill: "hsl(142 70% 42%)" },
  { key: "overtime", label: "Overtime", fill: "hsl(38 92% 50%)" },
  { key: "other_earning", label: "Other earnings", fill: "hsl(271 70% 58%)" },
  { key: "earnBal", label: "Unmapped balance", fill: "hsl(215 16% 55%)" },
];

function isPaid(kind: EmployeeSlotKind): boolean {
  return kind === "actual" || kind === "duplicate";
}

/**
 * One row per slot in R, in calendar order — never only the slots with data.
 *
 * The delta is against the previous **covered** slot that has a figure, and it
 * is withheld in three cases, each for its own reason:
 *
 *   - either side has duplicate rows, because summing two rows looks like a
 *     doubling and the engine excludes those slots from every delta;
 *   - a slot nobody uploaded lies between the two, which is `spansGap` — the
 *     movement is real but it is not one period's movement;
 *   - there is no earlier paid slot at all.
 */
export function buildPeriodRows(
  slots: readonly EmployeeSlotRow[],
  periodType: PeriodType,
): PeriodRow[] {
  const rows: PeriodRow[] = [];
  let previousPaid: EmployeeSlotRow | null = null;

  for (const slot of slots) {
    const paid = isPaid(slot.kind);
    const gross = slot.gross;

    let deltaGross: number | null = null;
    let deltaPct: number | null = null;
    let gapLabels: string[] = [];

    if (previousPaid !== null) {
      gapLabels = gapLabelsBetween(slots, previousPaid.slot.index, slot.slot.index);
    }
    const spansGap = paid && gapLabels.length > 0;

    if (
      paid &&
      slot.kind === "actual" &&
      previousPaid !== null &&
      previousPaid.kind === "actual" &&
      !spansGap &&
      gross !== null &&
      previousPaid.gross !== null
    ) {
      deltaGross = gross - previousPaid.gross;
      deltaPct = previousPaid.gross === 0 ? null : (deltaGross / previousPaid.gross) * 100;
    }

    rows.push({
      index: slot.slot.index,
      label: shortPeriodLabel(slot.slot.label, periodType),
      fullLabel: slot.slot.label,
      start: slot.slot.start,
      end: slot.slot.end,
      kind: slot.kind,
      gross,
      net: slot.net,
      // Every money line follows `gross`: on an unpaid slot they are unknown
      // together, and a 0 in any one of them would be read as a figure.
      recurring: paid ? slot.recurring : null,
      variable: paid ? slot.variable : null,
      deductions: paid ? slot.deductions : null,
      employerCosts: paid ? slot.employerCosts : null,
      earnBal: paid ? slot.earnBal : null,
      netBal: paid ? slot.netBal : null,
      absenceDays: paid ? slot.quantities.absence_days ?? null : null,
      byCategory: paid ? slot.byCategory : null,
      department: slot.department,
      rowCount: slot.rowCount,
      mergedRunCount: slot.mergedRunCount,
      deltaGross,
      deltaPct,
      spansGap,
      gapLabels,
      slot,
    });

    if (paid) previousPaid = slot;
  }

  return rows;
}

export type ChartDatum = { label: string; fullLabel: string; kind: EmployeeSlotKind } & Record<
  string,
  number | null | string
>;

/**
 * The same rows, shaped for Recharts.
 *
 * **Missing slots break the series. They are never plotted as zero.** A slot
 * with no figure contributes `null` for every series, so Recharts draws no bar
 * at all — the x-axis still carries the label, so the gap is visible as a gap
 * rather than as an absence from the chart.
 */
export function buildChartData(rows: readonly PeriodRow[]): ChartDatum[] {
  return rows.map((row) => {
    const datum: ChartDatum = { label: row.label, fullLabel: row.fullLabel, kind: row.kind };
    for (const series of GROSS_STACK) {
      if (row.byCategory === null) {
        datum[series.key] = null;
        continue;
      }
      const value =
        series.key === "earnBal" ? row.earnBal ?? 0 : row.byCategory[series.key] ?? 0;
      // A real zero in a category that exists stays 0 — a slot that paid no
      // overtime did pay no overtime. Only an unpaid or un-uploaded slot is
      // null, which is the distinction in spec 7.14.
      datum[series.key] = value;
    }
    return datum;
  });
}

/** The series with something in them, so an empty category draws no legend mark. */
export function presentStack(rows: readonly PeriodRow[]): typeof GROSS_STACK {
  return GROSS_STACK.filter((series) =>
    rows.some((row) => {
      if (row.byCategory === null) return false;
      const value = series.key === "earnBal" ? row.earnBal : row.byCategory[series.key];
      return value !== undefined && value !== null && Math.abs(value) > 0;
    }),
  );
}
