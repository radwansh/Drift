import { pgTable, uuid, varchar, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const annualBudgets = pgTable(
  "annual_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    // numeric(14,2) topped out near 1e12, so a 1,000-person LBP payroll (~1.2e12
    // a year) failed with "numeric field overflow" (finding B4).
    amount: numeric("amount", { precision: 20, scale: 3 }).notNull(),
    // What the budget is measured against: gross, total employment cost, or net.
    basis: varchar("basis", { length: 20 }).default("gross").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.companyId, t.year, t.currency)],
);

/** Optional per-month phasing of an annual budget (spec 4.7 / step 25). */
export const annualBudgetPhasing = pgTable(
  "annual_budget_phasing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id").notNull().references(() => annualBudgets.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 20, scale: 3 }).notNull(),
  },
  (t) => [unique().on(t.budgetId, t.month)],
);