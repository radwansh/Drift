export { formatCurrency } from "./utils";

export function detectCurrencyFromData(values: number[]): string {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg > 10000) return "JPY";
  if (avg > 1000) return "GBP";
  return "USD";
}

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD - US Dollar", symbol: "$" },
  { value: "EUR", label: "EUR - Euro", symbol: "€" },
  { value: "GBP", label: "GBP - British Pound", symbol: "£" },
  { value: "CAD", label: "CAD - Canadian Dollar", symbol: "C$" },
  { value: "AUD", label: "AUD - Australian Dollar", symbol: "A$" },
  { value: "JPY", label: "JPY - Japanese Yen", symbol: "¥" },
  { value: "CHF", label: "CHF - Swiss Franc", symbol: "Fr" },
  { value: "CNY", label: "CNY - Chinese Yuan", symbol: "¥" },
  { value: "INR", label: "INR - Indian Rupee", symbol: "₹" },
  { value: "BRL", label: "BRL - Brazilian Real", symbol: "R$" },
  { value: "AED", label: "AED - UAE Dirham", symbol: "د.إ" },
  { value: "SAR", label: "SAR - Saudi Riyal", symbol: "﷼" },
  { value: "SGD", label: "SGD - Singapore Dollar", symbol: "S$" },
] as const;
