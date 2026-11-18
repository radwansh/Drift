import { DEFAULT_FISCAL_START_MONTH, isValidFiscalStartMonth } from "../annual/fiscal";

/**
 * Deciding that a company is Australian (`docs/AU_PAYROLL_SPEC.md` section 1).
 *
 * **There is no reliable answer.** `companies` has no `country` column, so the
 * proxy is the currency, and the proxy is wrong in two directions:
 *
 *   1. a New Zealand, Fijian or Papua New Guinean company that reports in AUD
 *      is treated as Australian;
 *   2. an Australian company that has not set its currency is **not**, because
 *      `companies.currency_code` defaults to `'USD'`. This is the likelier of
 *      the two in practice.
 *
 * Two consequences follow, and they pull in opposite directions, which is why
 * the proxy is used for one thing and not the other:
 *
 *   - **The classifier vocabulary is not gated on it.** `Superannuation`,
 *     `PAYG Withholding` and `STSL` are not words a French, Lebanese or Gulf
 *     register carries, so a gate in front of them buys nothing and adds a gate
 *     that can be wrong. Gating would make weakness 2 actively harmful: an
 *     Australian company left on USD would have its super column read as an
 *     unplaced earning, which is worse than any misclassification the ungated
 *     vocabulary can cause.
 *   - **The Payday Super check is gated, on two signals** — this predicate and
 *     an AU-super column on the register. See `payday-super.ts`.
 *
 * The predicate is deliberately the only place the proxy is written down, so
 * the real fix — a `country` column, ISO 3166-1 alpha-2, backfilled `'AU'`
 * where `currency_code = 'AUD'` — is a backfill and the change below rather
 * than a hunt through the engine. `country` is already read first and already
 * wins, and `null` means "unknown" and closes the gate, the same rule
 * `visibleNavItems` uses for an unknown plan.
 */

export const AU_CURRENCY_CODE = "AUD";
export const AU_COUNTRY_CODE = "AU";

/**
 * The Australian financial year starts on 1 July.
 *
 * Read through `resolveFiscalStartMonth` below, which feeds the existing
 * `annual/fiscal.ts` functions — there is no second year model.
 */
export const AU_FISCAL_START_MONTH = 7;

/** What the predicate needs, and nothing more, so a test can pass a literal. */
export interface JurisdictionCompany {
  currencyCode?: string | null;
  /**
   * ISO 3166-1 alpha-2, for when `companies` gains the column. Absent or null
   * means unknown, and unknown falls back to the currency proxy.
   */
  country?: string | null;
}

function code(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isAustralianCompany(
  company: JurisdictionCompany | null | undefined,
): boolean {
  if (!company) return false;
  const country = code(company.country);
  // A real answer beats a proxy, in both directions: a company that says it is
  // in New Zealand is not Australian however it reports.
  if (country.length > 0) return country === AU_COUNTRY_CODE;
  return code(company.currencyCode) === AU_CURRENCY_CODE;
}

/**
 * Why the company was, or was not, treated as Australian — in words.
 *
 * Section 1.1: a wrong-jurisdiction match must never be silent. A card that
 * states its basis is one a reader who knows the company is not Australian can
 * dismiss; a card whose basis is invisible is a card nobody can correct.
 */
export function australianBasis(company: JurisdictionCompany | null | undefined): string {
  const country = code(company?.country);
  if (country.length > 0) {
    return country === AU_COUNTRY_CODE
      ? "Based on this company being set to Australia."
      : `Based on this company being set to ${country}, not Australia.`;
  }
  const currency = code(company?.currencyCode);
  if (currency === AU_CURRENCY_CODE) {
    return "Based on this company reporting in AUD. Clarivo has no country setting yet, so the currency is what it goes on.";
  }
  return currency.length > 0
    ? `Based on this company reporting in ${currency} rather than AUD.`
    : "Based on this company having no currency set.";
}

/**
 * The fiscal start month to use, given what the company has stored.
 *
 * A stored month **always** wins. `companies.settings.fiscalStartMonth` is only
 * ever written by `annual.setFiscalStartMonth`, so a value there is a choice
 * somebody made, and an Australian company that has deliberately set a
 * January–December year keeps it. The July default applies exactly where the
 * old code applied January: when nothing is stored, or when what is stored is
 * not a month at all.
 *
 * Same signature shape as `normaliseFiscalStartMonth`, which it replaces at the
 * call sites that know which company they are reading — and it feeds the same
 * `fiscalYearInterval` / `fiscalYearOf` / `fiscalMonths` / `fiscalYearLabel`,
 * so an Australian year is `FY2026/27` running 1 July to 30 June with no second
 * code path anywhere.
 */
export function resolveFiscalStartMonth(
  stored: number | null | undefined,
  company: JurisdictionCompany | null | undefined,
): number {
  if (stored !== null && stored !== undefined && isValidFiscalStartMonth(stored)) {
    return stored;
  }
  return isAustralianCompany(company) ? AU_FISCAL_START_MONTH : DEFAULT_FISCAL_START_MONTH;
}
