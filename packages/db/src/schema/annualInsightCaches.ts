import { pgTable, uuid, varchar, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const annualInsightCaches = pgTable(
  "annual_insight_caches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    forecastMethod: varchar("forecast_method", { length: 20 }).notNull(),
    dataHash: varchar("data_hash", { length: 64 }).notNull(),
    bullets: jsonb("bullets").notNull(),
    model: varchar("model", { length: 100 }).default("").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.companyId, t.forecastMethod, t.dataHash)],
);