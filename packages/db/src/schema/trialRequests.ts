import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const trialRequests = pgTable("trial_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  companySize: varchar("company_size", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  zohoLeadId: varchar("zoho_lead_id", { length: 100 }),
  trialLink: text("trial_link"),
  trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
