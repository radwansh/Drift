/** Pure date helpers operating on YYYY-MM-DD strings in UTC. No dependencies. */

export function parseISO(date: string): Date {
  return new Date(date.slice(0, 10) + "T00:00:00Z");
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function daysInMonth(year: number, month: number): number {
  // eslint-disable-next-line no-restricted-globals
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function endOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/** A period belongs to the year in which its end date falls (UTC). */
export function periodYear(endDate: string): number {
  return parseISO(endDate).getUTCFullYear();
}

export function withinYear(date: string, year: number): boolean {
  return periodYear(date) === year;
}

export function yearStart(year: number): string {
  return `${year}-01-01`;
}

export function yearEnd(year: number): string {
  return `${year}-12-31`;
}

export function yearInterval(year: number): { start: string; end: string } {
  return { start: yearStart(year), end: yearEnd(year) };
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}