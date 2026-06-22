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
  isAiSuggested: boolean("is_ai_suggested").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
