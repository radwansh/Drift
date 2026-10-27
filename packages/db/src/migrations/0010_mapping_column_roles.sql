-- Step 9 part 2 of docs/PAYROLL_AUDIT_FIX_PLAN.md: let a saved mapping say
-- which snapshot field or reporting dimension a column feeds.
--
-- Migration 0009 added hire_date, termination_date, fte and dimensions to
-- employee_snapshots. Nothing could populate them, because a mapping could only
-- say one of five things about a column — employee id, name, department, gross,
-- net — and anything else became a pay component.
--
-- Two columns rather than four more booleans, deliberately:
--
--   snapshot_field  one of 'hire_date' | 'termination_date' | 'fte'
--   dimension_name  free text: the dimension this column reports under
--
-- The existing is_* booleans are a fixed set of exactly-one-of roles, and the
-- UI renders a toggle per boolean. Adding a boolean per new field would grow
-- that grid for every field ever added and still could not express the
-- open-ended case: companies do not agree on what dimensions they have, so
-- 'Cost Centre' has to arrive as a value, not as a column name. snapshot_field
-- is the closed half and dimension_name the open half, and a column with
-- neither set behaves exactly as it does today.
--
-- Both nullable with no default, so every mapping saved before this migration
-- keeps its current meaning.
--
-- Idempotent on purpose (see README.md): drizzle keys __drizzle_migrations on a
-- hash of this file's contents, so an edit makes it run again on production.

ALTER TABLE "company_column_mappings"
  ADD COLUMN IF NOT EXISTS "snapshot_field" varchar(40);
--> statement-breakpoint

ALTER TABLE "company_column_mappings"
  ADD COLUMN IF NOT EXISTS "dimension_name" varchar(100);
--> statement-breakpoint

-- A closed set, enforced here rather than only in zod: the processor switches
-- on this value, and a typo written by a future caller would silently drop the
-- column instead of failing. NULL passes, which is the common case.
DO $$ BEGIN
  ALTER TABLE "company_column_mappings" ADD CONSTRAINT "company_column_mappings_snapshot_field"
    CHECK ("snapshot_field" IS NULL OR "snapshot_field" IN ('hire_date', 'termination_date', 'fte'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
--> statement-breakpoint

-- A column is one thing. Letting it be both a typed snapshot field and a
-- dimension would write the same value twice under two names, and the two
-- readers disagree about which wins.
DO $$ BEGIN
  ALTER TABLE "company_column_mappings" ADD CONSTRAINT "company_column_mappings_one_role"
    CHECK ("snapshot_field" IS NULL OR "dimension_name" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
