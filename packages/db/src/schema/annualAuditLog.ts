import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

/**
 * Who changed which category or budget, and when (findings B8, step 29).
 *
 * Needed by step 24: company-wide settings are editable by any admin or manager,
 * so a recategorisation that moves money between buckets has to be attributable.
 */
export const annualAuditLog = pgTable(
  "annual_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "component_category" | "annual_budget" */
    entity: varchar("entity", { length: 40 }).notNull(),
    /** The component key, or "<year>:<currency>" for a budget. */
    entityKey: varchar("entity_key", { length: 200 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("annual_audit_log_company_idx").on(t.companyId, t.createdAt)],
);
