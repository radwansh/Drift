import { pgTable, uuid, varchar, date, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const payrollPeriods = pgTable("payroll_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  periodType: varchar("period_type", { length: 20 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  source: varchar("source", { length: 20 }).notNull().default("upload"),
  sourceFilename: varchar("source_filename", { length: 500 }),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  totalEmployees: integer("total_employees").notNull().default(0),
  /** scale 3, not 2 — see the note on `employee_snapshots.gross_salary`. */
  totalGross: numeric("total_gross", { precision: 20, scale: 3 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 20, scale: 3 }).notNull().default("0"),
  /**
   * Step 9, for step 4's reconciliation gate: the totals printed on the export
   * the admin uploaded, to tick the computed figures against.
   *
   * Nullable, because an upload that supplies none is still valid — step 4
   * reports "not supplied" rather than treating absence as agreement. These
   * are what the admin asserts; `totalGross` and `totalNet` above are what
   * Clarivo computed from the rows, so they can only ever agree with
   * themselves.
   */
  controlTotalGross: numeric("control_total_gross", { precision: 20, scale: 3 }),
  controlTotalNet: numeric("control_total_net", { precision: 20, scale: 3 }),
  rawFileKey: varchar("raw_file_key", { length: 500 }),
  errorMessage: varchar("error_message", { length: 1000 }),
  syncMetadata: jsonb("sync_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
