import { parseISO, endOfMonth } from "./dates";

/**
 * Fiscal-year rules, in one place (step 45).
 *
 * Every year boundary in the engine previously assumed January to December,
 * spread across `periodYear`, `withinYear`, `yearStart`/`yearEnd`, the slot
 * calendar and the router's SQL filter. A company on an April–March year had no
 * way to express it, and adding one meant changing each of those independently —
 * which is exactly how the five separate end-date matchers in finding A8 came
 * about. These functions are the single rule; callers pass a start month and
 * never compute a boundary themselves.
 *
 * Convention: a fiscal year is labelled by the calendar year it STARTS in. With
 * a start month of 4, fiscal 2026 runs 2026-04-01 to 2027-03-31. A start month
 * of 1 is the calendar year, which is the default.
 */

export const DEFAULT_FISCAL_START_MONTH = 1;

export function isValidFiscalStartMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

export function normaliseFiscalStartMonth(month: number | null | undefined): number {
  if (month === null || month === undefined || !isValidFiscalStartMonth(month)) {
    return DEFAULT_FISCAL_START_MONTH;
  }
  return month;
}

export interface YearInterval {
  /** Inclusive first day, YYYY-MM-DD. */
  start: string;
  /** Inclusive last day, YYYY-MM-DD. */
  end: string;
  /** Exclusive upper bound, for `period_end < x` SQL filters. */
  endExclusive: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** The interval a fiscal year covers. */
export function fiscalYearInterval(year: number, startMonth = DEFAULT_FISCAL_START_MONTH): YearInterval {
  const m = normaliseFiscalStartMonth(startMonth);
  const start = `${year}-${pad(m)}-01`;

  if (m === 1) {
    return { start, end: `${year}-12-31`, endExclusive: `${year + 1}-01-01` };
  }

  const endYear = year + 1;
  const endMonth = m - 1;
  return {
    start,
    end: endOfMonth(endYear, endMonth),
    endExclusive: `${endYear}-${pad(m)}-01`,
  };
}

/**
 * Which fiscal year a period belongs to, by its END date.
 *
 * A period ending 2026-02-28 with an April start month belongs to fiscal 2025
 * (April 2025 to March 2026).
 */
export function fiscalYearOf(endDate: string, startMonth = DEFAULT_FISCAL_START_MONTH): number {
  const m = normaliseFiscalStartMonth(startMonth);
  const d = parseISO(endDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return month >= m ? year : year - 1;
}

export function withinFiscalYear(
  date: string,
  year: number,
  startMonth = DEFAULT_FISCAL_START_MONTH,
): boolean {
  return fiscalYearOf(date, startMonth) === year;
}

/**
 * The twelve calendar months of a fiscal year, in order, as (year, month) pairs.
 * The slot calendar is built from this so a fiscal year's slots run Apr, May …
 * Mar rather than Jan … Dec.
 */
export function fiscalMonths(
  year: number,
  startMonth = DEFAULT_FISCAL_START_MONTH,
): { year: number; month: number }[] {
  const m = normaliseFiscalStartMonth(startMonth);
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const absolute = m - 1 + i;
    out.push({ year: year + Math.floor(absolute / 12), month: (absolute % 12) + 1 });
  }
  return out;
}

/** A label for the year itself, e.g. "2026" or "FY2026/27". */
export function fiscalYearLabel(year: number, startMonth = DEFAULT_FISCAL_START_MONTH): string {
  const m = normaliseFiscalStartMonth(startMonth);
  if (m === 1) return String(year);
  return `FY${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}
