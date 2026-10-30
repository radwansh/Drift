/**
 * Money for the rule-based text (step 8b of docs/PAYROLL_AUDIT_FIX_PLAN.md).
 *
 * `audit-summary.ts` and `narrative.ts` wrote `$${amount.toFixed(2)}` and took
 * no currency at all, so every rule-based sentence read in dollars whatever the
 * company was paid in — "Net pay increase by $1,172.839" for a Kuwaiti payroll.
 *
 * `currencyDisplay: "code"` as CLAUDE.md requires, so it is always
 * "USD 1,234.56" and never "$1,234.56". This duplicates the formatter in
 * `apps/web/src/lib/utils.ts` because a package cannot import from the app;
 * the two must stay in step, which is what the shared assertion in
 * `narrative.test.ts` and `annual-ui.test.ts` is for.
 */
const CACHE = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  const cached = CACHE.get(currency);
  if (cached) return cached;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // An unknown code must not fail the narrative; the code is still named.
    fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  CACHE.set(currency, fmt);
  return fmt;
}

/** Full value with the currency code, e.g. "LBP 1,234.56". */
export function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = formatter(currency).format(amount);
  return formatted.includes(currency) ? formatted : `${currency} ${formatted}`;
}
