import { pgTable, uuid, varchar, numeric, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { payrollPeriods } from "./payrollPeriods";

export const employeeSnapshots = pgTable("employee_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollPeriodId: uuid("payroll_period_id").notNull().references(() => payrollPeriods.id, { onDelete: "cascade" }),
  employeeExternalId: varchar("employee_external_id", { length: 100 }).notNull(),
  employeeName: varchar("employee_name", { length: 300 }).notNull(),
  department: varchar("department", { length: 200 }),
  components: jsonb("components").notNull().default({}),
  /**
   * Step 9, migration 0009: scale 3, not 2.
   *
   * Steps 8a and 8a-ii made the engine carry a currency's own minor units, but
   * every money column was `numeric(_, 2)` and Postgres rounds to the declared
   * scale on insert — so a KWD 3,703.701 was stored as 3,703.70 and the fils
   * were gone before the engine saw the row. Measured against real Postgres in
   * `apps/web/test/money-precision.test.ts`.
   *
   * precision had to go to 20 at the same time: holding it at 15 while taking
   * scale to 3 would cut the integer part from 13 digits to 12, which an LBP
   * payroll exceeds.
   */
  grossSalary: numeric("gross_salary", { precision: 20, scale: 3 }).notNull(),
  netSalary: numeric("net_salary", { precision: 20, scale: 3 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
  /**
   * Step 9. Typed columns rather than keys in `dimensions` below, because these
   * three are universal and are what rules filter and compare on — step 5's
   * leaver and joiner checks, step 12a's roster warning, cost per FTE — and a
   * date inside jsonb is a string that has to be parsed at every use, which is
   * the class of bug finding C1 already was.
   *
   * All nullable: most registers do not carry them, and a register that does
   * not must still import.
   */
  hireDate: date("hire_date"),
  terminationDate: date("termination_date"),
  /** A fraction of a full post. 0.500 is a half-timer; above 1 is legitimate. */
  fte: numeric("fte", { precision: 6, scale: 3 }),
  /**
   * Step 9. Open-ended reporting dimensions — cost centre, location, grade,
   * job title, contract type — mirroring `components` above.
   *
   * jsonb rather than a column each, because companies do not agree on what
   * dimensions they have, so a typed column per dimension would be a migration
   * per customer. `department` deliberately stays its own column: it is
   * referenced across the engine, the UI and `period_component_totals`, and
   * moving it in here would be a wide rename for no gain. The dimension picker
   * treats it as one dimension among several, reading the column for that one
   * and this JSON for the rest.
   */
  dimensions: jsonb("dimensions").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
