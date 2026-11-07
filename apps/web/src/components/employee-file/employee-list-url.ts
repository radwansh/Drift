/**
 * The Employee File's URL state (steps E2 and E3).
 *
 * Range, year and scope live in the query string so a view can be linked and
 * reopened the same way, and so the selector stays where the user put it — the
 * bug `docs/Annual_Dashboard_Spec.md` was written to fix. **URL only: no
 * cookie.** The annual page reads `drift_annual_year` as a fallback, and a
 * second cookie keyed to a different feature is one more thing to
 * desynchronise.
 *
 * Parsing lives here, in plain `.ts`, so it is testable and so both the list and
 * the file page read a param the same way. Anything unrecognised becomes
 * `undefined` rather than being passed through: the server resolves its own
 * defaults, and an input zod would reject costs a round trip and a toast.
 */

export const RANGE_KINDS = ["ytd", "full_year", "previous_year", "slot"] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];

export const RANGE_LABELS: Record<RangeKind, string> = {
  ytd: "Year to date",
  full_year: "Full year",
  previous_year: "Previous year",
  slot: "One period",
};

export const LIST_SCOPES = ["paid_in_range", "currently_employed", "everyone_on_record"] as const;
export type ListScope = (typeof LIST_SCOPES)[number];

/** The segmented control's labels and the definition each one applies. */
export const SCOPE_DEFINITIONS: Record<ListScope, { label: string; definition: string }> = {
  paid_in_range: {
    label: "Paid in range",
    definition: "Anyone with at least one paid slot in the selected range. Leavers appear, badged.",
  },
  currently_employed: {
    label: "Currently employed",
    definition:
      "Anyone in the latest covered slot whose termination date is empty or later than that slot.",
  },
  everyone_on_record: {
    label: "Everyone on record",
    definition:
      "Anyone with a row in any ready period in scope, ignoring the range. The figures stay with the range.",
  },
};

export const LIST_SORTS = ["flags", "name", "range_gross", "latest_gross", "paid_periods"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const PERIOD_TYPES = ["monthly", "weekly", "bi_monthly", "bi_weekly"] as const;
export type PeriodTypeValue = (typeof PERIOD_TYPES)[number];

export function parseRange(value: string | null): RangeKind | undefined {
  return RANGE_KINDS.includes(value as RangeKind) ? (value as RangeKind) : undefined;
}

export function parseScope(value: string | null): ListScope | undefined {
  return LIST_SCOPES.includes(value as ListScope) ? (value as ListScope) : undefined;
}

export function parseSort(value: string | null): ListSort | undefined {
  return LIST_SORTS.includes(value as ListSort) ? (value as ListSort) : undefined;
}

export function parseCadence(value: string | null): PeriodTypeValue | undefined {
  return PERIOD_TYPES.includes(value as PeriodTypeValue) ? (value as PeriodTypeValue) : undefined;
}

/** Three upper-case letters, or nothing. The server uppercases too. */
export function parseCurrency(value: string | null): string | undefined {
  return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : undefined;
}

/**
 * A fiscal year, or `undefined` so the server can default it.
 *
 * It must not default to the fiscal year containing today: if the newest upload
 * is Oct 2026 and today is Feb 2027, that opens an empty file on a company with
 * eighteen months of data. `resolveEmployeeFileScope` defaults from the latest
 * ready period and says when it did, which is why this stays absent rather than
 * guessing.
 */
export function parseYear(value: string | null): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  const year = Number(value);
  return year >= 2000 && year <= 2100 ? year : undefined;
}

export function parsePositiveInt(value: string | null): number | undefined {
  if (!value || !/^\d{1,6}$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

export function parseFlag(value: string | null): "critical" | "duplicate" | undefined {
  return value === "critical" || value === "duplicate" ? value : undefined;
}

/** Comma-separated departments, trimmed and de-duplicated, capped like the input. */
export function parseList(value: string | null, max = 50): string[] | undefined {
  if (!value) return undefined;
  const items = [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, max);
  return items.length > 0 ? items : undefined;
}

/**
 * The params a file link should carry over from the list.
 *
 * Only the scope-shaped ones: year, range, cadence and currency change what the
 * file computes. Carrying the list's filters and page number into a single
 * employee's URL would put stale state in a bookmark that has no use for it.
 */
export function scopeSearch(params: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of ["year", "range", "slot", "cadence", "currency"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next.toString();
}
