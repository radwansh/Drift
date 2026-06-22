import { pgTable, uuid, varchar, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { payrollPeriods } from "./payrollPeriods";
import { users } from "./users";

export const comparisonRuns = pgTable("comparison_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  currentPeriodId: uuid("current_period_id").notNull().references(() => payrollPeriods.id),
  previousPeriodId: uuid("previous_period_id").notNull().references(() => payrollPeriods.id),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  resultSummary: jsonb("result_summary"),
  aiNarrative: text("ai_narrative"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
