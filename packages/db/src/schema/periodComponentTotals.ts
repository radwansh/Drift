import { pgTable, uuid, varchar, numeric, integer, index, unique } from "drizzle-orm/pg-core";
import { payrollPeriods } from "./payrollPeriods";

/**
 * Per-period, per-department component totals (step 31, finding B7).
 *
 * The annual queries used to unnest every employee's `components` JSON at read
 * time — on every page view, for every period, for both the current and the
 * previous year. This table holds the same numbers, computed once when a period
 * is uploaded, so the read path is a plain indexed aggregate instead.
 *
 * `department` is never null: an employee with no department is stored under
 * 'Unassigned', matching what the annual SQL already did with COALESCE, so the
 * unique key stays usable.
 */
export const periodComponentTotals = pgTable(
  "period_component_totals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollPeriodId: uuid("payroll_period_id")
      .notNull()
      .references(() => payrollPeriods.id, { onDelete: "cascade" }),
    department: varchar("department", { length: 200 }).notNull(),
    componentKey: varchar("component_key", { length: 200 }).notNull(),
    /**
     * Wide enough for an LBP-scale company total, and scale 3 so a KWD fils
     * survives storage — see the note on `employee_snapshots.gross_salary`.
     */
    total: numeric("total", { precision: 20, scale: 3 }).notNull(),
    /** Row counts per sign, so MIXED_SIGN can still be detected (finding C1). */
    negRows: integer("neg_rows").notNull().default(0),
    posRows: integer("pos_rows").notNull().default(0),
  },
  (t) => [
    unique().on(t.payrollPeriodId, t.department, t.componentKey),
    index("period_component_totals_period_idx").on(t.payrollPeriodId),
  ],
);
