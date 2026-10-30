import { pgTable, uuid, varchar, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { comparisonRuns } from "./comparisonRuns";

export const comparisonResults = pgTable("comparison_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  comparisonRunId: uuid("comparison_run_id").notNull().references(() => comparisonRuns.id, { onDelete: "cascade" }),
  employeeExternalId: varchar("employee_external_id", { length: 100 }).notNull(),
  employeeName: varchar("employee_name", { length: 300 }).notNull(),
  department: varchar("department", { length: 200 }),
  currentComponents: jsonb("current_components").notNull(),
  previousComponents: jsonb("previous_components").notNull(),
  componentDeltas: jsonb("component_deltas").notNull(),
  /** scale 3 — see the note on `employee_snapshots.gross_salary`. */
  grossDelta: numeric("gross_delta", { precision: 20, scale: 3 }).notNull(),
  netDelta: numeric("net_delta", { precision: 20, scale: 3 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  anomalyFlags: jsonb("anomaly_flags"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
