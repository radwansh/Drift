import { describe, it, expect } from "vitest";
import {
  AU_FISCAL_START_MONTH,
  australianBasis,
  isAustralianCompany,
  resolveFiscalStartMonth,
} from "./jurisdiction";
import {
  DEFAULT_FISCAL_START_MONTH,
  fiscalYearInterval,
  fiscalYearLabel,
  fiscalYearOf,
} from "../annual/fiscal";

describe("isAustralianCompany — the proxy, and its two weaknesses", () => {
  it("reads AUD as Australian", () => {
    expect(isAustralianCompany({ currencyCode: "AUD" })).toBe(true);
    expect(isAustralianCompany({ currencyCode: " aud " })).toBe(true);
  });

  it("does not read any other currency as Australian", () => {
    for (const code of ["USD", "EUR", "NZD", "GBP", "", null, undefined]) {
      expect(isAustralianCompany({ currencyCode: code }), String(code)).toBe(false);
    }
    expect(isAustralianCompany(null)).toBe(false);
    expect(isAustralianCompany(undefined)).toBe(false);
  });

  /**
   * Weakness 1 (spec 1.1): a New Zealand company reporting in AUD. The
   * predicate says yes and that is as good as a currency proxy gets — which is
   * why the Payday Super check does not rely on it alone, and why the report
   * carries its basis in words.
   */
  it("cannot tell a New Zealand company reporting in AUD apart", () => {
    expect(isAustralianCompany({ currencyCode: "AUD" })).toBe(true);
  });

  /**
   * Weakness 2, and the likelier of the two: `companies.currency_code`
   * defaults to `'USD'`, so an Australian company that never touched the
   * setting falls outside the predicate.
   */
  it("misses an Australian company left on the USD default", () => {
    expect(isAustralianCompany({ currencyCode: "USD" })).toBe(false);
  });

  /**
   * Spec 1.3's real fix, already wired: when `companies` gains a `country`
   * column, the predicate is a backfill rather than a rewrite. A stated
   * country wins over the proxy in **both** directions.
   */
  it("prefers a stated country over the currency, either way", () => {
    expect(isAustralianCompany({ currencyCode: "USD", country: "AU" })).toBe(true);
    expect(isAustralianCompany({ currencyCode: "AUD", country: "NZ" })).toBe(false);
    expect(isAustralianCompany({ currencyCode: "AUD", country: "au" })).toBe(true);
    // Null means unknown, which closes the gate and falls back to the proxy.
    expect(isAustralianCompany({ currencyCode: "AUD", country: null })).toBe(true);
    expect(isAustralianCompany({ currencyCode: "USD", country: null })).toBe(false);
  });
});

describe("australianBasis — never silent about why", () => {
  it("names the currency, because that is all it has", () => {
    expect(australianBasis({ currencyCode: "AUD" })).toContain("reporting in AUD");
    expect(australianBasis({ currencyCode: "USD" })).toContain("reporting in USD rather than AUD");
    expect(australianBasis({ currencyCode: null })).toContain("no currency set");
  });

  it("names the country once there is one", () => {
    expect(australianBasis({ country: "AU" })).toContain("set to Australia");
    expect(australianBasis({ currencyCode: "AUD", country: "NZ" })).toContain("set to NZ, not Australia");
  });
});

describe("resolveFiscalStartMonth — July by default, and only by default", () => {
  it("gives an Australian company a July start when nothing is stored", () => {
    expect(resolveFiscalStartMonth(undefined, { currencyCode: "AUD" })).toBe(AU_FISCAL_START_MONTH);
    expect(resolveFiscalStartMonth(null, { currencyCode: "AUD" })).toBe(7);
  });

  /**
   * The point of the whole function. `companies.settings.fiscalStartMonth` is
   * only ever written by `annual.setFiscalStartMonth`, so a value there is a
   * choice somebody made — and an Australian company that deliberately set a
   * January–December year keeps it.
   */
  it("never overrides a month the company has set", () => {
    for (const month of [1, 4, 7, 10, 12]) {
      expect(resolveFiscalStartMonth(month, { currencyCode: "AUD" }), String(month)).toBe(month);
      expect(resolveFiscalStartMonth(month, { currencyCode: "USD" }), String(month)).toBe(month);
    }
  });

  it("leaves every other company on January, exactly as before", () => {
    expect(resolveFiscalStartMonth(undefined, { currencyCode: "USD" })).toBe(DEFAULT_FISCAL_START_MONTH);
    expect(resolveFiscalStartMonth(null, null)).toBe(1);
    expect(resolveFiscalStartMonth(undefined, { currencyCode: "EUR" })).toBe(1);
  });

  it("falls back for a stored value that is not a month", () => {
    // Same rule `normaliseFiscalStartMonth` applied, so a 0 or a 13 in the
    // jsonb column is not a choice and does not win.
    expect(resolveFiscalStartMonth(0, { currencyCode: "AUD" })).toBe(7);
    expect(resolveFiscalStartMonth(13, { currencyCode: "AUD" })).toBe(7);
    expect(resolveFiscalStartMonth(7.5, { currencyCode: "AUD" })).toBe(7);
    expect(resolveFiscalStartMonth(0, { currencyCode: "USD" })).toBe(1);
  });

  /**
   * It feeds the existing `annual/fiscal.ts` functions and there is no second
   * year model: an Australian financial year is 1 July to 30 June, labelled
   * `FY2026/27`, through the same four functions every other company uses.
   */
  it("produces an Australian financial year through the existing fiscal path", () => {
    const month = resolveFiscalStartMonth(undefined, { currencyCode: "AUD" });
    expect(fiscalYearInterval(2026, month)).toEqual({
      start: "2026-07-01",
      end: "2027-06-30",
      endExclusive: "2027-07-01",
    });
    expect(fiscalYearLabel(2026, month)).toBe("FY2026/27");
    // The two fortnights in `samples/au/` are both in fiscal 2026.
    expect(fiscalYearOf("2026-10-18", month)).toBe(2026);
    expect(fiscalYearOf("2026-11-01", month)).toBe(2026);
    // And a June period belongs to the year before it.
    expect(fiscalYearOf("2026-06-30", month)).toBe(2025);
  });
});
