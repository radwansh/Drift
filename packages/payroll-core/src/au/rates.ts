/**
 * Australian superannuation rates and thresholds, by financial year.
 *
 * **A dated table, keyed on the financial year, and deliberately short.**
 * `docs/AU_PAYROLL_SPEC.md` section 0 is explicit: statutory rates and
 * thresholds change every financial year, nothing may be hard-coded without a
 * recheck against the ATO, and Radwan signs off payroll rules. So a year this
 * table does not carry is **not checkable** rather than silently charged at
 * last year's numbers — `superRatesFor` returns `undefined` and
 * `payday-super.ts` says so in words.
 *
 * That is the whole reason this is a table and not two constants. A missing
 * year showing a confident figure is the failure mode the table exists to
 * prevent.
 */

export interface SuperRates {
  /** The financial year, as the ATO labels it. */
  financialYear: string;
  /** Inclusive first day, YYYY-MM-DD. */
  start: string;
  /** Inclusive last day, YYYY-MM-DD. */
  end: string;
  /**
   * s 17A(2): "charge percentage means 12." A flat number in the amended Act,
   * not a table, so there is nothing legislated to step from. Read directly
   * from the Treasury Laws Amendment (Payday Superannuation) Act 2025.
   */
  chargePercentage: number;
  /**
   * The basic concessional contributions cap. ATO, read indirectly.
   */
  concessionalCap: number;
  /**
   * s 10A(5): the concessional cap divided by the charge percentage, times
   * 100, rounded down to the nearest $10 — and **annual** under Payday Super,
   * where it was quarterly before.
   *
   * `32,500 / 12 x 100 = 270,833.33`, rounded down to `270,830`, which is
   * exactly the figure the ATO publishes. That cross-check is the reason to
   * trust the number and also the reason not to compute it here: the cap is
   * indexed to AWOTE and moves.
   */
  maximumContributionsBase: number;
}

/**
 * Payday Super commenced **1 July 2026** and applies to qualifying earnings
 * *paid* from that date, even where the work was done before it. A period
 * ending before this is not a Payday Super question at all.
 */
export const PAYDAY_SUPER_START = "2026-07-01";

export const AU_SUPER_RATES: readonly SuperRates[] = [
  {
    financialYear: "2026-27",
    start: "2026-07-01",
    end: "2027-06-30",
    chargePercentage: 12,
    concessionalCap: 32_500,
    maximumContributionsBase: 270_830,
  },
];

/** The rates for the financial year a date falls in, or `undefined`. */
export function superRatesFor(date: string): SuperRates | undefined {
  return AU_SUPER_RATES.find((r) => date >= r.start && date <= r.end);
}

/**
 * Where the maximum contributions base starts suppressing a verdict.
 *
 * Section 7.8: Clarivo sees a period, not a year, and cannot see year-to-date
 * from before the first uploaded period. An employee whose YTD qualifying
 * earnings have passed the base correctly receives no further super, and a
 * single late-year period would read as a 100% shortfall. 80% is the spec's
 * figure for "close enough that the next period could cross it".
 */
export const MCB_SUPPRESSION_SHARE = 0.8;
