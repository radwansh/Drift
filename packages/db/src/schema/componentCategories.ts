import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

export const componentCategories = pgTable(
  "component_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    componentKey: varchar("component_key", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    // Who last changed the mapping (finding B3): previously there was no record
    // of who recategorised a component, and updated_at never moved.
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.companyId, t.componentKey)],
);
