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
  totalGross: numeric("total_gross", { precision: 15, scale: 2 }).notNull().default("0"),
  totalNet: numeric("total_net", { precision: 15, scale: 2 }).notNull().default("0"),
  rawFileKey: varchar("raw_file_key", { length: 500 }),
  errorMessage: varchar("error_message", { length: 1000 }),
  syncMetadata: jsonb("sync_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
