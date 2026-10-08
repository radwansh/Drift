import { pgTable, uuid, varchar, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const annualBudgets = pgTable(
  "annual_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.companyId, t.year, t.currency)],
);