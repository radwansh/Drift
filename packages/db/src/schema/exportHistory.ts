import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { comparisonRuns } from "./comparisonRuns";
import { users } from "./users";

export const exportHistory = pgTable("export_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  comparisonRunId: uuid("comparison_run_id").notNull().references(() => comparisonRuns.id, { onDelete: "cascade" }),
  format: varchar("format", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  fileKey: varchar("file_key", { length: 500 }),
  requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
