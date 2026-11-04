import { z } from "zod";
import { sql, eq } from "drizzle-orm";
import { companies, componentCategories } from "@saas/db";
import {
  assignSlot,
  countSupersededUploads,
  dedupePeriods,
  fiscalYearLabel,
  fiscalYearOf,
  generateExpectedPeriods,
  normaliseFiscalStartMonth,
  type Category,
  type EmployeePeriodInput,
  type ExpectedSlot,
  type PeriodType,
  type AnomalyTolerances,
  minorUnits,
} from "@saas/payroll-core";
import { parseRows, Numeric, IntLike, toIsoDate, toIsoTimestamp } from "../parse-rows";
import type { MemberContext } from "../trpc";

/**
 * Scope resolution — round trip 1 of the Employee File's budget of 3.
 *
 * One function, shared by `employeeFile.list` and `employeeFile.get`, mirroring
 * the annual router's setup batch: one `ctx.db.batch([...])` of three queries,
 * which `db.batch` on neon-http sends as a single HTTP request.
 *
 * **Note what is not here: no fallback to `period_component_totals`.** That
 * table is per-period per-**department**, with no employee dimension and no
 * gross or net columns, so it is unusable for this feature. The Employee File
 * reads `employee_snapshots` exclusively — there is no second path to write and
 * none to keep numerically identical. The annual feature's dual-path rule is two
 * files away and invites copying, so this is stated rather than left implicit.
 */

export const RANGE_KINDS = ["ytd", "full_year", "previous_year", "slot"] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];

export const PeriodTypeSchema = z.enum(["monthly", "weekly", "bi_monthly", "bi_weekly"]);

/**
 * ISO 4217 is three upper-case letters. The annual budget endpoint once accepted
 * "lbp" and stored it as a distinct currency from "LBP".
 */
export const CurrencyCodeSchema = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), { message: "Currency must be a 3-letter ISO code" });

/** Every column aliased, every row parsed. Never `as unknown as`. */
const PeriodRowSchema = z.object({
  id: z.string(),
  periodType: z.string(),
  periodStart: z.union([z.string(), z.date()]).transform(toIsoDate),
  periodEnd: z.union([z.string(), z.date()]).transform(toIsoDate),
  currencyCode: z.string(),
  createdAt: z.union([z.string(), z.date()]).transform(toIsoTimestamp),
  totalGross: Numeric,
  totalNet: Numeric,
  controlTotalGross: Numeric.nullable(),
  controlTotalNet: Numeric.nullable(),
  employeeCount: IntLike,
});

/**
 * `companies.settings.tolerances`, parsed rather than cast.
 *
 * It is the one input this feature reads that nobody validates on the way in:
 * `settings` is jsonb and the only writer is an operator or a future settings
 * screen. A hand-written `{"netChangePct": null}` used to reach
 * `detectAnomalies` as-is, where `{...DEFAULT_TOLERANCES, ...tolerances}`
 * overwrites 20 with `null` and every `Math.abs(delta) > tol.netChangePct`
 * becomes false — the exceptions panel goes quiet while the card beside it
 * still says the thresholds came from this company's settings.
 *
 * Each threshold is caught on its own, so one bad key falls back to its default
 * instead of discarding the two good ones. A key that does not survive is
 * **absent**, never `undefined`: a spread of `{netChangePct: undefined}` wipes
 * the default just as `null` does.
 */
const Threshold = z.number().finite().nonnegative().optional().catch(undefined);

const TolerancesSchema = z
  .object({
    netChangePct: Threshold,
    baseChangePct: Threshold,
    minAbsolute: Threshold,
  })
  .catch({});

export function parseTolerances(raw: unknown): Partial<AnomalyTolerances> {
  if (raw === null || typeof raw !== "object") return {};
  const parsed = TolerancesSchema.parse(raw);
  const out: Partial<AnomalyTolerances> = {};
  if (parsed.netChangePct !== undefined) out.netChangePct = parsed.netChangePct;
  if (parsed.baseChangePct !== undefined) out.baseChangePct = parsed.baseChangePct;
  if (parsed.minAbsolute !== undefined) out.minAbsolute = parsed.minAbsolute;
  return out;
}

export interface ScopeOption {
  periodType: PeriodType;
  currency: string;
  /** Ready periods in this scope, across the window. Index 0 is most frequent. */
  periods: number;
}

export interface EmployeeFileScope {
  scopeOptions: ScopeOption[];
  periodType: PeriodType;
  currency: string;
  decimals: number;
  fiscalYear: number;
  fiscalStartMonth: number;
  /** "2026" or "FY2026/27". */
  label: string;
  /**
   * True when the default year is **not** the fiscal year containing today, so
   * the header can say `FY2026/27 · latest data Oct 2026` rather than silently
   * opening a year the user did not ask for.
   */
  defaultedToLatestData: boolean;
  latestDataLabel: string | null;
  /** R, for the selected range. */
  expected: ExpectedSlot[];
  /**
   * The **whole** fiscal year's slot calendar, whatever the range narrowed
   * `expected` to — what a period picker has to offer.
   *
   * Returned separately because `expected` is the answer to "which slots is
   * this response about" and a picker needs "which slots could it be about".
   * Driving the picker off `expected` meant that once a slot was chosen the
   * control collapsed to the one option already selected, with no way back to
   * another period.
   */
  allSlots: ExpectedSlot[];
  /**
   * The slot `range: "slot"` resolved to, and null for every other range.
   *
   * The UI shows this rather than guessing, because `range=slot` with no index
   * is reachable — the list's range control sets `range` alone — and a picker
   * displaying `expected[0]` over a different slot's figures is a label that
   * contradicts the money beside it.
   */
  slotIndex: number | null;
  /** A full year's slot count for this cadence, with the anchor passed (F7). */
  slotsPerYear: number;
  /** The surviving periods in scope, de-duplicated, placed on slots. */
  periods: EmployeePeriodInput[];
  /** Explicit binds for the data query's `IN (...)`. Empty means no SQL at all. */
  periodIdsInRange: string[];
  /** Every surviving period in scope, ignoring the range — `everyone_on_record`. */
  allScopePeriodIds: string[];
  /** The periods on the latest covered slot — `currently_employed`. */
  latestSlotPeriodIds: string[];
  /** That slot's end date, for the `termination_date` half of the predicate. */
  latestSlotEnd: string | null;
  coveredSlotIndexes: number[];
  supersededCount: number;
  savedCategories: Record<string, Category>;
  tolerances: Partial<AnomalyTolerances>;
  /** The latest covered slot index, which is where a year-to-date range ends. */
  lastCoveredIndex: number | null;
}

export interface ResolveScopeInput {
  year?: number;
  range?: RangeKind;
  slotIndex?: number;
  periodType?: PeriodType;
  currency?: string;
}

function countBy<T extends string>(values: readonly T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}

export async function resolveEmployeeFileScope(
  ctx: MemberContext,
  input: ResolveScopeInput,
): Promise<EmployeeFileScope> {
  const { companyId } = ctx;
  const requestedYear = input.year;
  // A three calendar-year window, because the "previous year" range needs
  // `year - 1` and a fiscal year spans two calendar years. Wider than the
  // annual router's two-year window, so its index behaviour is not identical —
  // `harness.test.ts` carries the EXPLAIN assertion for the index this rests on.
  const windowFrom = `${(requestedYear ?? new Date().getUTCFullYear()) - 2}-01-01`;
  const windowTo = `${(requestedYear ?? new Date().getUTCFullYear()) + 2}-01-01`;

  const [companyRows, periodRes, savedRows] = await ctx.db.batch([
    ctx.db
      .select({
        currencyCode: companies.currencyCode,
        settings: companies.settings,
      })
      .from(companies)
      .where(eq(companies.id, companyId)),
    ctx.db.execute(sql`
      -- Every ready period for this company in a three calendar-year window.
      -- The fiscal filter is applied in TypeScript with fiscalYearOf, because
      -- the company's fiscal start month arrives in THIS SAME batch and so
      -- cannot be used to build this query's SQL. Same reason, same shape as
      -- routers/annual.ts.
      --
      -- Never interpolate a value into a comment in one of these templates:
      -- drizzle turns every substitution into a bind parameter, Postgres strips
      -- comments before planning, so the parameter is sent and never referenced
      -- and the statement dies with 42P18. Keep interpolation in the WHERE.
      SELECT id,
             period_type          AS "periodType",
             period_start         AS "periodStart",
             period_end           AS "periodEnd",
             currency_code        AS "currencyCode",
             created_at           AS "createdAt",
             total_gross          AS "totalGross",
             total_net            AS "totalNet",
             control_total_gross  AS "controlTotalGross",
             control_total_net    AS "controlTotalNet",
             total_employees      AS "employeeCount"
      FROM payroll_periods
      WHERE company_id = ${companyId}
        AND status = 'ready'
        AND period_end >= ${windowFrom}::date
        AND period_end < ${windowTo}::date
      ORDER BY period_end
    `),
    ctx.db
      .select({
        componentKey: componentCategories.componentKey,
        category: componentCategories.category,
      })
      .from(componentCategories)
      .where(eq(componentCategories.companyId, companyId)),
  ]);

  const companyRow = companyRows[0];
  const companySettings = (companyRow?.settings ?? {}) as {
    fiscalStartMonth?: number;
    tolerances?: unknown;
  };
  const fiscalStartMonth = normaliseFiscalStartMonth(companySettings.fiscalStartMonth);
  const tolerances = parseTolerances(companySettings.tolerances);

  const allPeriods = parseRows(PeriodRowSchema, periodRes.rows, "employee file period");

  // The default year is the fiscal year of the **latest ready period**, not the
  // fiscal year containing today. If the newest upload is Oct 2026 and today is
  // Feb 2027, defaulting to today's year opens an empty file on a company with
  // eighteen months of data.
  const latestPeriodEnd = allPeriods.reduce<string | null>(
    (latest, p) => (latest === null || p.periodEnd > latest ? p.periodEnd : latest),
    null,
  );
  const todayFiscalYear = fiscalYearOf(
    new Date().toISOString().slice(0, 10),
    fiscalStartMonth,
  );
  const latestFiscalYear =
    latestPeriodEnd === null ? todayFiscalYear : fiscalYearOf(latestPeriodEnd, fiscalStartMonth);
  const baseYear = requestedYear ?? latestFiscalYear;

  // "previous_year" shifts the whole scope back one fiscal year rather than
  // being a second query against a different window.
  const fiscalYear = input.range === "previous_year" ? baseYear - 1 : baseYear;

  const inYear = allPeriods.filter(
    (p) => fiscalYearOf(p.periodEnd, fiscalStartMonth) === fiscalYear,
  );

  const cadenceCounts = countBy(inYear.map((p) => p.periodType as PeriodType));
  const currencyCounts = countBy(inYear.map((p) => p.currencyCode));

  const periodType = input.periodType ?? cadenceCounts[0]?.value ?? "monthly";
  // The company's own currency wins when the year actually has data in it;
  // otherwise the most frequent, and only then the company's as a fallback.
  const companyCurrency = companyRow?.currencyCode;
  const currency =
    input.currency ??
    (companyCurrency && currencyCounts.some((c) => c.value === companyCurrency)
      ? companyCurrency
      : currencyCounts[0]?.value ?? companyCurrency ?? "USD");

  const scopeOptions: ScopeOption[] = [];
  for (const cadence of cadenceCounts) {
    for (const code of currencyCounts) {
      const count = inYear.filter(
        (p) => p.periodType === cadence.value && p.currencyCode === code.value,
      ).length;
      if (count > 0) {
        scopeOptions.push({ periodType: cadence.value, currency: code.value, periods: count });
      }
    }
  }

  const inScope = inYear.filter(
    (p) => p.periodType === periodType && p.currencyCode === currency,
  );

  // De-duplication happens here, in TypeScript, through the function the engine
  // already owns — so SQL and the engine cannot disagree about which upload won,
  // and `countSupersededUploads` gives "1 superseded upload ignored" with no
  // second implementation. There is no `DISTINCT ON` anywhere in this feature:
  // the `created_at DESC` tie-break it would need works for periods and cannot
  // work for rows, since `processUpload` inserts every row of a period in one
  // statement and they share a timestamp.
  const surviving = dedupePeriods(inScope);
  const supersededCount = countSupersededUploads(inScope);

  const periods: EmployeePeriodInput[] = surviving.map((p) => ({
    id: p.id,
    periodType: p.periodType as PeriodType,
    currency: p.currencyCode,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    createdAt: p.createdAt,
    totalGross: p.totalGross,
    totalNet: p.totalNet,
    controlTotalGross: p.controlTotalGross,
    controlTotalNet: p.controlTotalNet,
  }));

  // The anchor is the first covered period's start, which is finding F7: for
  // `weekly` and `bi_weekly`, `generateExpectedPeriods` seeds its grid from
  // `anchor ?? interval.start`, so an unanchored call counts from the year's
  // first day and can be one slot out — 52 against 53.
  const anchor = periods[0]?.periodStart;
  const fullYear = generateExpectedPeriods(periodType, fiscalYear, anchor, fiscalStartMonth);
  const slotsPerYear = fullYear.length;

  const coveredIndexes = new Set<number>();
  for (const period of periods) {
    const slot = assignSlot(period, periodType, fullYear);
    if (slot) coveredIndexes.add(slot.index);
  }
  const lastCoveredIndex = coveredIndexes.size > 0 ? Math.max(...coveredIndexes) : null;

  // The range decides how much of R the file shows. Year-to-date stops at the
  // latest covered slot; a full year shows all of it with the future slots as
  // `missing` rather than forecast, because the file forecasts nothing.
  let expected = fullYear;
  let slotIndex: number | null = null;
  if (input.range === "ytd" && lastCoveredIndex !== null) {
    expected = fullYear.filter((s) => s.index <= lastCoveredIndex);
  } else if (input.range === "slot") {
    /**
     * `range=slot` **defaults its slot** rather than narrowing nothing.
     *
     * The old condition was `range === "slot" && slotIndex !== undefined`, and
     * the list's range control sets `range` with no `slot` — so choosing "One
     * period" showed a full year of money under a control saying "One period",
     * and the file page's picker displayed `expected[0]`'s label over it. The
     * latest covered slot is the one a picker should open on, so it is also the
     * one the figures are for.
     *
     * An index that is not in this year's calendar — a stale link, a hand-typed
     * `?slot=99` — falls back to that default instead of resolving to an empty
     * range, which would read as "nothing was paid" rather than "no such
     * period".
     */
    const requested =
      input.slotIndex !== undefined && fullYear.some((s) => s.index === input.slotIndex)
        ? input.slotIndex
        : null;
    slotIndex = requested ?? lastCoveredIndex;
    if (slotIndex !== null) {
      const chosen = slotIndex;
      expected = fullYear.filter((s) => s.index === chosen);
    }
  }

  /**
   * The periods on the latest covered slot, for the `currently_employed` scope.
   *
   * "Appears in the latest covered slot" is an `assignSlot` question, not an
   * end-date comparison, so the slot's periods are resolved here and the id list
   * is what the SQL predicate uses. That is what lets the scope be applied
   * before pagination — a filter applied after it would make every page short
   * and the total wrong.
   */
  const latestSlotPeriodIds: string[] = [];
  if (lastCoveredIndex !== null) {
    for (const period of periods) {
      const slot = assignSlot(period, periodType, fullYear);
      if (slot && slot.index === lastCoveredIndex) latestSlotPeriodIds.push(period.id);
    }
  }
  const latestSlotEnd =
    lastCoveredIndex === null
      ? null
      : fullYear.find((s) => s.index === lastCoveredIndex)?.end ?? null;

  // Only the periods that land inside the selected range reach the data query,
  // so a single-slot range does not fetch a year of rows.
  const visibleIndexes = new Set(expected.map((s) => s.index));
  const periodsInRange = periods.filter((period) => {
    const slot = assignSlot(period, periodType, fullYear);
    return slot !== null && visibleIndexes.has(slot.index);
  });

  const savedCategories: Record<string, Category> = {};
  for (const row of savedRows) savedCategories[row.componentKey] = row.category as Category;


  return {
    scopeOptions,
    periodType,
    currency,
    decimals: minorUnits(currency),
    fiscalYear,
    fiscalStartMonth,
    label: fiscalYearLabel(fiscalYear, fiscalStartMonth),
    defaultedToLatestData: requestedYear === undefined && latestFiscalYear !== todayFiscalYear,
    latestDataLabel: latestPeriodEnd,
    expected,
    allSlots: fullYear,
    slotIndex,
    slotsPerYear,
    periods: periodsInRange,
    periodIdsInRange: periodsInRange.map((p) => p.id),
    // Every surviving period in this (cadence, currency, fiscal year), ignoring
    // the range selector — what `everyone_on_record` lists over. It stays inside
    // the fiscal year on purpose: "in scope" is the cadence and currency, and
    // finding a leaver from two years ago is a change of year rather than an
    // unbounded query.
    allScopePeriodIds: periods.map((p) => p.id),
    latestSlotPeriodIds,
    latestSlotEnd,
    coveredSlotIndexes: [...coveredIndexes].sort((a, b) => a - b),
    supersededCount,
    savedCategories,
    tolerances,
    lastCoveredIndex,
  };
}

/**
 * The surviving period ids as explicit binds, for `WHERE ... IN (...)`.
 *
 * Built with `sql.join` over one `sql` fragment per id rather than by passing a
 * JS array, so each id is its own bind parameter and no array-type inference is
 * involved. The caller **must** guard the empty case: `IN ()` is a Postgres
 * syntax error, so a scope with no surviving periods has to return an empty
 * result before any SQL runs.
 */
export function periodIdBinds(ids: readonly string[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}
