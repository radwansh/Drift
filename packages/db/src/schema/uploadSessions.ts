import { pgTable, uuid, varchar, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  filename: varchar("filename", { length: 500 }).notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  periodType: varchar("period_type", { length: 20 }),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  currencyCode: varchar("currency_code", { length: 3 }),
  errorMessage: varchar("error_message", { length: 1000 }),
  autoMappingApplied: boolean("auto_mapping_applied").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
