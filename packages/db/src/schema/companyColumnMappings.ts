import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const companyColumnMappings = pgTable("company_column_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sourceColumn: varchar("source_column", { length: 200 }).notNull(),
  mappedComponent: varchar("mapped_component", { length: 200 }).notNull(),
  isEmployeeId: boolean("is_employee_id").default(false).notNull(),
  isEmployeeName: boolean("is_employee_name").default(false).notNull(),
  isDepartment: boolean("is_department").default(false).notNull(),
  isGrossSalary: boolean("is_gross_salary").default(false).notNull(),
  isNetSalary: boolean("is_net_salary").default(false).notNull(),
  /**
   * Step 9 part 2, migration 0010. The two roles the five booleans above
   * cannot express.
   *
   * `snapshotField` is the closed half — one of `hire_date`,
   * `termination_date`, `fte` — and `dimensionName` the open half, free text
   * naming the reporting dimension a column feeds (cost centre, location,
   * grade, contract type). Companies do not agree on what dimensions they
   * have, so the dimension arrives as a value rather than as a column name.
   *
   * Mutually exclusive, and both null for an ordinary pay component, which is
   * every mapping saved before this migration. A CHECK enforces both rules in
   * the database, because the processor switches on `snapshotField` and a typo
   * would otherwise drop the column silently.
   */
  snapshotField: varchar("snapshot_field", { length: 40 }),
  dimensionName: varchar("dimension_name", { length: 100 }),
  isAiSuggested: boolean("is_ai_suggested").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
