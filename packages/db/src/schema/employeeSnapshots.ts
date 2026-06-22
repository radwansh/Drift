import { pgTable, uuid, varchar, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { payrollPeriods } from "./payrollPeriods";

export const employeeSnapshots = pgTable("employee_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollPeriodId: uuid("payroll_period_id").notNull().references(() => payrollPeriods.id, { onDelete: "cascade" }),
  employeeExternalId: varchar("employee_external_id", { length: 100 }).notNull(),
  employeeName: varchar("employee_name", { length: 300 }).notNull(),
  department: varchar("department", { length: 200 }),
  components: jsonb("components").notNull().default({}),
  grossSalary: numeric("gross_salary", { precision: 15, scale: 2 }).notNull(),
  netSalary: numeric("net_salary", { precision: 15, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
