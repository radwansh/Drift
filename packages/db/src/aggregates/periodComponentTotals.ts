import { sql } from "drizzle-orm";
import type { DbClient } from "../client";

/**
 * Rebuilds the per-period component aggregates for one payroll period
 * (step 31, finding B7).
 *
 * Deliberately written as a single INSERT ... SELECT rather than reading rows
 * into JavaScript and writing them back: the aggregation happens where the data
 * is, in one round trip, and a 2,000-employee period never lands in the Node
 * heap.
 *
 * Only numeric component values are aggregated — the same filter the annual
 * queries use — because a components map can legitimately hold a non-numeric
 * value (a note, a date) that must not be summed. De-duplication by
 * (payroll_period_id, employee_external_id) keeping the newest row matches the
 * `snaps` CTE, so the aggregate equals what the live query would have returned.
 */
export async function rebuildPeriodComponentTotals(
  db: DbClient,
  payrollPeriodId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM period_component_totals WHERE payroll_period_id = ${payrollPeriodId}
  `);

  await db.execute(sql`
    WITH snaps AS (
      SELECT DISTINCT ON (employee_external_id)
             employee_external_id, department, components
      FROM employee_snapshots
      WHERE payroll_period_id = ${payrollPeriodId}
      ORDER BY employee_external_id, created_at DESC
    )
    INSERT INTO period_component_totals
      (payroll_period_id, department, component_key, total, neg_rows, pos_rows)
    SELECT ${payrollPeriodId},
           COALESCE(r.department, 'Unassigned'),
           x.key,
           COALESCE(SUM((x.value #>> '{}')::numeric), 0),
           COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric < 0)::int,
           COUNT(*) FILTER (WHERE (x.value #>> '{}')::numeric > 0)::int
    FROM snaps r
    CROSS JOIN LATERAL jsonb_each(r.components) x
    WHERE (x.value #>> '{}') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    GROUP BY COALESCE(r.department, 'Unassigned'), x.key
  `);
}

/**
 * Rebuilds every period that has no aggregate rows yet, newest first.
 *
 * Returns the ids it rebuilt so a caller can report progress. `limit` bounds a
 * single pass, so a large backfill can be run repeatedly rather than held open
 * in one long transaction.
 */
export async function backfillPeriodComponentTotals(
  db: DbClient,
  opts: { limit?: number; force?: boolean } = {},
): Promise<string[]> {
  const limit = opts.limit ?? 100;

  const res = opts.force
    ? await db.execute(sql`
        SELECT id FROM payroll_periods
        ORDER BY period_end DESC
        LIMIT ${limit}
      `)
    : await db.execute(sql`
        SELECT p.id
        FROM payroll_periods p
        WHERE NOT EXISTS (
          SELECT 1 FROM period_component_totals t WHERE t.payroll_period_id = p.id
        )
        ORDER BY p.period_end DESC
        LIMIT ${limit}
      `);

  const ids = res.rows.map((r) => (r as { id: string }).id);
  for (const id of ids) {
    await rebuildPeriodComponentTotals(db, id);
  }
  return ids;
}
