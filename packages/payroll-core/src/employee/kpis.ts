import type { Category, ExpectedSlot } from "../annual/types";
import { EMPLOYER_COST_CATEGORIES, QUANTITY_CATEGORIES } from "../annual/types";
import { roundToMinorUnits, smallestUnit } from "../money";
import { cleanPaidSlots, coveredSlots, paidSlots } from "./slots";
import { sumSlots } from "./totals";
import {
  kpi,
  suppressed,
  type AbsenceKpi,
  type AnnualisedRecurring,
  type AtSlot,
  type AverageGross,
  type BaseRateHistory,
  type ChangeLogEntry,
  type EmployeeCoverage,
  type EmployeeFlag,
  type EmployeeKpis,
  type EmployeeSlotRow,
  type EmployeeStatus,
  type EmployerCostKpi,
  type ExceptionCounts,
  type GrossToNetBridge,
  type Kpi,
  type PresenceResult,
  type Ratio,
} from "./types";

/**
 * K1-K16 (step C6).
 *
 * Every KPI that can mislead returns `Kpi<T>`, so section 6.3's required
 * presentation is enforced by the type rather than by a reviewer noticing. K3
 * is the one exception and is a plain value: it is the figure that says whether
 * any other figure on the page can be trusted, so there is no state in which
 * withholding it is the more honest answer.
 *
 * **Every denominator is |P(e)| excluding `duplicate` slots, never |R|.** The
 * arithmetic that matters is spec 8.2: E0001 is paid January to November,
 * 50,242.51 over 11 slots is 4,567.50; over 12 calendar slots it is 4,186.88,
 * understating by exactly one twelfth. The error equals the share of slots
 * wrongly counted.
 *
 * K17-K25 are deferred (nice-to-have). K26-K29 are blocked: there is no
 * per-employee forecast in the engine, no per-employee budget, no contracted
 * hours and no statutory rate table, so every one of them would have to invent
 * its divisor or its threshold.
 */

/** Three paid periods is the floor below which a share is noise, not a figure. */
const MIN_PERIODS_FOR_SHARE = 3;

export function buildCoverage(opts: {
  slots: readonly EmployeeSlotRow[];
  expected: readonly ExpectedSlot[];
  supersededUploads: number;
}): EmployeeCoverage {
  const { slots, expected, supersededUploads } = opts;
  const covered = coveredSlots(slots);
  const paid = paidSlots(slots);

  return {
    paid: paid.length,
    covered: covered.length,
    expected: expected.length,
    // A covered slot where the employee has no row is counted here and excluded
    // from every rate denominator, because the absence is evidence: the person
    // was not paid that period.
    notPaid: covered.length - paid.length,
    // Unknown, not zero. Never dropped from the slot list.
    notUploaded: expected.length - covered.length,
    duplicate: slots.filter((s) => s.kind === "duplicate").length,
    missingLabels: slots.filter((s) => s.kind === "missing").map((s) => s.slot.label),
    notPaidLabels: slots.filter((s) => s.kind === "not_paid").map((s) => s.slot.label),
    duplicateLabels: slots.filter((s) => s.kind === "duplicate").map((s) => s.slot.label),
    supersededUploads,
  };
}

/** K4. Both identities, for the range. */
function bridgeOf(paid: readonly EmployeeSlotRow[], decimals: number): GrossToNetBridge {
  const q = smallestUnit(decimals);
  const gross = sumSlots(paid, (s) => s.gross, decimals);
  const net = sumSlots(paid, (s) => s.net, decimals);
  const deductions = sumSlots(paid, (s) => s.deductions, decimals);
  const netBal = sumSlots(paid, (s) => s.netBal, decimals);
  const earnings = sumSlots(paid, (s) => s.earnings, decimals);
  const earnBal = sumSlots(paid, (s) => s.earnBal, decimals);

  return {
    gross,
    net,
    deductions,
    netBal,
    earnings,
    earnBal,
    balanced:
      Math.abs(roundToMinorUnits(gross - net - deductions - netBal, decimals)) <= q &&
      Math.abs(roundToMinorUnits(gross - earnings - earnBal, decimals)) <= q,
  };
}

/**
 * K6's p*: the latest paid slot that is clean enough to read a run rate off.
 *
 * Neither `duplicate` (summing two rows looks like a doubling), nor possibly
 * prorated (a part first month reads as a pay rise the following month), nor a
 * final settlement (severance, notice and a leave payout read as a 300% rise).
 */
function cleanLatestSlot(
  slots: readonly EmployeeSlotRow[],
  presence: PresenceResult,
): EmployeeSlotRow | undefined {
  const excluded = new Set<number>();
  if (presence.finalSettlementIndex !== null) excluded.add(presence.finalSettlementIndex);
  if (presence.possiblyProratedIndex !== null) excluded.add(presence.possiblyProratedIndex);

  const candidates = cleanPaidSlots(slots).filter((s) => !excluded.has(s.slot.index));
  return candidates[candidates.length - 1];
}

/** The slots K5-K8 must leave out, with their labels for the UI to name. */
function excludedLabels(
  slots: readonly EmployeeSlotRow[],
  presence: PresenceResult,
): string[] {
  const labels: string[] = [];
  for (const slot of slots) {
    if (slot.kind === "duplicate") {
      labels.push(slot.slot.label);
      continue;
    }
    if (slot.kind !== "actual") continue;
    if (
      slot.slot.index === presence.finalSettlementIndex ||
      slot.slot.index === presence.possiblyProratedIndex
    ) {
      labels.push(slot.slot.label);
    }
  }
  return labels;
}

function ratio(
  numerator: number,
  denominator: number,
  paidPeriods: number,
): Kpi<Ratio> {
  if (denominator === 0) return suppressed("no_paid_slots");
  return kpi({ value: numerator / denominator, paidPeriods });
}

function sumCategory(
  slots: readonly EmployeeSlotRow[],
  category: Category,
  decimals: number,
): number {
  return sumSlots(slots, (s) => s.byCategory[category] ?? 0, decimals);
}

export interface BuildEmployeeKpisOptions {
  slots: readonly EmployeeSlotRow[];
  expected: readonly ExpectedSlot[];
  presence: PresenceResult;
  flags: readonly EmployeeFlag[];
  changeLog: readonly ChangeLogEntry[];
  decimals: number;
  supersededUploads: number;
  /**
   * |generateExpectedPeriods(cadence, year, anchor, fsm)| for a **full** year —
   * 12, 24, 26/27, 52/53, generated, never hard-coded.
   *
   * Passed in rather than taken from `expected.length`, because a
   * year-to-date range truncates `expected` at the latest covered slot and K8
   * must still annualise over a whole year. The anchor matters: for `weekly`
   * and `bi_weekly`, `generateExpectedPeriods` seeds its grid from
   * `anchor ?? interval.start`, so an unanchored call counts from 1 January and
   * can be one slot out — 52 against 53.
   */
  slotsPerYear: number;
}

export function buildEmployeeKpis(opts: BuildEmployeeKpisOptions): EmployeeKpis {
  const { slots, expected, presence, flags, changeLog, decimals, slotsPerYear } = opts;

  const coverage = buildCoverage({
    slots,
    expected,
    supersededUploads: opts.supersededUploads,
  });

  const paid = paidSlots(slots);
  const clean = cleanPaidSlots(slots);
  const status: EmployeeStatus = presence.status;

  const exceptions: ExceptionCounts = { critical: 0, warning: 0, info: 0 };
  for (const flag of flags) exceptions[flag.severity] += 1;

  const lastPaid = paid[paid.length - 1];

  // Every figure below is suppressed rather than zeroed when the employee has
  // no paid slot in range. That is a real case, not an edge one: a leaver opened
  // in the current year has a valid, empty file, and a 0.00 gross would read as
  // "we paid this person nothing" rather than "this range has nothing in it".
  if (paid.length === 0 || !lastPaid) {
    return {
      coverage,
      grossInRange: suppressed("no_paid_slots"),
      netInRange: suppressed("no_paid_slots"),
      bridge: suppressed("no_paid_slots"),
      averageGrossPerPaidPeriod: suppressed("no_paid_slots"),
      recurringLatest: suppressed("no_paid_slots"),
      baseRate: suppressed("no_paid_slots"),
      annualisedRecurring: suppressed("no_paid_slots"),
      variableShare: suppressed("no_paid_slots"),
      overtime: suppressed("no_paid_slots"),
      absence: suppressed("no_paid_slots"),
      deductionRate: suppressed("no_paid_slots"),
      incomeTaxRatio: suppressed("no_paid_slots"),
      totalEmploymentCost: suppressed("no_paid_slots"),
      employerOnCostRate: suppressed("no_paid_slots"),
      exceptions: kpi(exceptions),
      lastPaidSlot: suppressed("no_paid_slots"),
      status,
    };
  }

  // K1 and K2: the register's own columns, summed over P(e). Never recomputed
  // from components (R1).
  const gross = sumSlots(paid, (s) => s.gross, decimals);
  const net = sumSlots(paid, (s) => s.net, decimals);

  // K5. The denominator excludes `duplicate` slots from both halves, and the
  // excluded slots come back by name so the UI can show the mean beside the
  // recurring figure with the one-off periods named. It is never presented alone
  // as "monthly salary": on samples/2025 E0002's twelve-month mean of 23,016.84
  // sits 16.53% above the Jan-Jun run rate.
  const averageGross: Kpi<AverageGross> =
    clean.length === 0
      ? suppressed("duplicate_slots_excluded")
      : kpi<AverageGross>({
          mean: roundToMinorUnits(
            sumSlots(clean, (s) => s.gross, decimals) / clean.length,
            decimals,
          ),
          periods: clean.length,
          excludedLabels: excludedLabels(slots, presence),
        });

  // K6. The run rate, from a clean slot, with the slot named.
  const pStar = cleanLatestSlot(slots, presence);
  const recurringLatest: Kpi<AtSlot> = pStar
    ? kpi<AtSlot>({
        value: pStar.recurring,
        slotLabel: pStar.slot.label,
        slotIndex: pStar.slot.index,
      })
    : suppressed("no_clean_slot");

  // K7. Per slot, and the movements named per component rather than inferred
  // from gross: spec 8.1's July event is base +4.20%, housing +4.20%, transport
  // and meal flat, recurring +4.06%. The run-rate percentage is not the
  // increase percentage.
  const baseRate: Kpi<BaseRateHistory> = kpi<BaseRateHistory>({
    perSlot: paid.map((slot) => ({
      slotLabel: slot.slot.label,
      slotIndex: slot.slot.index,
      total: slot.byCategory.base_salary ?? 0,
    })),
    changes: changeLog.filter((entry) => entry.kind === "base_rate"),
  });

  // K8. **Annualised, not paid**, and only ever from K6's p*. Annualising
  // E0002's March instead gives 483,150.24 against an actual year of
  // 276,202.12 — a 74.9% overstatement, on one row of real fixture data.
  const annualisedRecurring: Kpi<AnnualisedRecurring> = pStar
    ? kpi<AnnualisedRecurring>({
        value: roundToMinorUnits(pStar.recurring * slotsPerYear, decimals),
        slotsPerYear,
        fromSlotLabel: pStar.slot.label,
      })
    : suppressed("no_clean_slot");

  // K9. Meaningless over one or two periods, and seasonal: a file opened in
  // March after the annual bonus shows a share no full year will match. The
  // window is always carried.
  const variable = sumSlots(paid, (s) => s.variable, decimals);
  const variableShare: Kpi<Ratio> =
    paid.length < MIN_PERIODS_FOR_SHARE
      ? suppressed("insufficient_history")
      : ratio(variable, gross, paid.length);

  // K10. Intensity is overtime over base, and null rather than Infinity when
  // there is no base to divide by.
  const overtimeAmount = sumCategory(paid, "overtime", decimals);
  const baseAmount = sumCategory(paid, "base_salary", decimals);
  const overtime = kpi({
    amount: overtimeAmount,
    intensity: baseAmount === 0 ? null : overtimeAmount / baseAmount,
  });

  // K11. Quantity components under their **own register names**, inferring
  // nothing: `absence_days` and `other_quantity` both hold counts, and a
  // register with an "Overtime Hours" column puts hours in `other_quantity`.
  const quantities: AbsenceKpi["quantities"] = [];
  for (const slot of paid) {
    for (const [key, entry] of Object.entries(slot.byKey)) {
      if (!QUANTITY_CATEGORIES.includes(entry.category as "absence_days" | "other_quantity")) {
        continue;
      }
      const existing = quantities.find((q) => q.key === key);
      if (existing) existing.total = roundToMinorUnits(existing.total + entry.total, decimals);
      else quantities.push({ key, category: entry.category, total: entry.total });
    }
  }
  const absenceMoney = sumCategory(paid, "absence_deduction", decimals);
  const absence: Kpi<AbsenceKpi> = kpi<AbsenceKpi>({
    money: absenceMoney,
    shareOfGross: gross === 0 ? 0 : absenceMoney / gross,
    quantities,
  });

  // K12. Labelled "observed, this employee, this range" by the UI, and never a
  // statutory rate: it is a ratio for one person, affected by exemptions, caps,
  // mid-year joining and absence.
  const deductions = sumSlots(paid, (s) => s.deductions, decimals);
  const incomeTax = sumCategory(paid, "income_tax", decimals);

  // K13 and K14. Suppressed to `employer_costs_not_mapped` when **no** component
  // in range classifies to an employer category — never 0, which would read as
  // "this employee costs nothing above their salary".
  let employerComponentCount = 0;
  for (const slot of paid) {
    for (const entry of Object.values(slot.byKey)) {
      if (EMPLOYER_COST_CATEGORIES.includes(entry.category)) employerComponentCount += 1;
    }
  }
  const employerCosts = sumSlots(paid, (s) => s.employerCosts, decimals);
  const uncategorised = sumCategory(paid, "uncategorised", decimals);

  const totalEmploymentCost: Kpi<EmployerCostKpi> =
    employerComponentCount === 0
      ? suppressed("employer_costs_not_mapped")
      : kpi<EmployerCostKpi>({
          total: roundToMinorUnits(gross + employerCosts, decimals),
          componentCount: employerComponentCount,
        });

  // K14 additionally suppresses when `uncategorised` is non-zero: one mapped
  // employer line plus one unmapped reads as a low on-cost rate rather than as
  // missing data, which is the worse of the two failures.
  const employerOnCostRate: Kpi<Ratio> =
    employerComponentCount === 0
      ? suppressed("employer_costs_not_mapped")
      : Math.abs(uncategorised) > smallestUnit(decimals)
        ? suppressed("uncategorised_non_zero")
        : ratio(employerCosts, gross, paid.length);

  return {
    coverage,
    grossInRange: kpi(gross),
    netInRange: kpi(net),
    bridge: kpi(bridgeOf(paid, decimals)),
    averageGrossPerPaidPeriod: averageGross,
    recurringLatest,
    baseRate,
    annualisedRecurring,
    variableShare,
    overtime,
    absence,
    deductionRate: ratio(deductions, gross, paid.length),
    incomeTaxRatio: ratio(incomeTax, gross, paid.length),
    totalEmploymentCost,
    employerOnCostRate,
    exceptions: kpi(exceptions),
    lastPaidSlot: kpi<AtSlot>({
      value: lastPaid.gross ?? 0,
      slotLabel: lastPaid.slot.label,
      slotIndex: lastPaid.slot.index,
    }),
    status,
  };
}
