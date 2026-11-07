import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

/**
 * Who read whose pay detail, for which range, when (Employee File, step B2).
 *
 * The control that makes company-wide manager access defensible. Clarivo stores
 * no reporting line, so "manager" cannot mean "my team" — a manager reads every
 * employee in the company, and the log is what makes that accountable rather
 * than merely permitted.
 *
 * Its own table rather than a row in `annual_audit_log`, which records a
 * *change* as `{entity, entityKey, oldValue, newValue}`: a read has no old or
 * new value, takes a row per page view against a few edits a month, and
 * `annual.auditTrail` is a `memberProcedure` that would show every viewer who
 * looked at whose salary. See `0011_employee_file.sql` for the full reasoning.
 *
 * The write rides inside the same `db.batch` as the procedure's data queries,
 * so it costs no extra round trip and cannot be skipped by an early return or
 * forgotten on a new code path. It therefore logs the **attempt**, not the
 * successful render — an attempted read of an id the company does not have is
 * precisely what an access review wants to see, and logging only successes
 * would hide probing.
 */
export const employeeFileAccessLog = pgTable(
  "employee_file_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    /**
     * `set null`, matching `annual_audit_log`: deleting a user must not delete
     * the evidence that they read something.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "view_file" | "view_list" | "export_file" */
    action: varchar("action", { length: 20 }).notNull(),
    /** Null for a list read, which names no single person. */
    employeeExternalId: varchar("employee_external_id", { length: 100 }),
    periodType: varchar("period_type", { length: 20 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    /** "ytd" | "full_year" | "previous_year" | "slot" */
    rangeKind: varchar("range_kind", { length: 20 }).notNull(),
    slotFrom: integer("slot_from"),
    slotTo: integer("slot_to"),
    /** Rows returned, so a bulk read is distinguishable from a single lookup. */
    rowCount: integer("row_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("employee_file_access_log_company_idx").on(t.companyId, t.createdAt),
    index("employee_file_access_log_employee_idx").on(t.companyId, t.employeeExternalId, t.createdAt),
    index("employee_file_access_log_user_idx").on(t.userId, t.createdAt),
  ],
);
