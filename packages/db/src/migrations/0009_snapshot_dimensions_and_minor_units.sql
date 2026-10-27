-- Step 9 of docs/PAYROLL_AUDIT_FIX_PLAN.md, plus a defect found while writing it.
--
-- Two unrelated-looking changes in one file because they are one migration on
-- the same tables, which is how step 9 was grouped in the first place.
--
-- PART 1 — the data Clarivo does not yet ingest.
--
-- `hire_date`, `termination_date` and `fte` are typed columns rather than keys
-- in the JSON below, decided deliberately: they are universal, they are what
-- rules filter and compare on (step 5's leaver and joiner checks, step 12a's
-- roster warning, cost per FTE), and a date inside jsonb is a string that has
-- to be parsed at every use — which is the class of bug finding C1 already was.
--
-- Everything else goes in `dimensions`, mirroring the existing `components`
-- jsonb on the same table. Companies do not agree on what dimensions they have
-- — cost centre, location, grade, contract type — so a typed column per
-- dimension would be a migration per customer. `department` stays where it is:
-- it is referenced across the engine, the UI and period_component_totals, and
-- moving it would be a wide rename for no gain.
--
-- PART 2 — three-decimal currencies were truncated at the storage boundary.
--
-- Steps 8a and 8a-ii made the engine carry a currency's own minor units, so a
-- KWD figure of 3,703.701 survives every calculation. It did not survive being
-- stored: every money column was numeric(_, 2), and Postgres rounds to the
-- declared scale on insert. Measured against real Postgres before this change,
-- 3,703.701 read back as 3,703.7 and 11,111.103 as 11,111.1 — so the fils were
-- gone before the engine ever saw the row, and the engine tests passed only
-- because they build their inputs directly and never round-trip through a
-- table.
--
-- scale 3 covers every currency a payroll is actually run in: KWD, BHD, OMR,
-- JOD, TND, IQD and LYD. The two four-decimal ISO entries (CLF, UYW) are units
-- of account, not payroll currencies.
--
-- precision goes to 20 at the same time, and that is not cosmetic: holding
-- precision at 15 while taking scale to 3 would cut the integer part from 13
-- digits to 12, which an LBP payroll exceeds. 20 and 3 widens both axes, so no
-- existing value can fail to fit.
--
-- Idempotent on purpose (see README.md): drizzle keys __drizzle_migrations on a
-- hash of this file's contents, so an edit makes it run again on production.
-- ADD COLUMN IF NOT EXISTS is a no-op on a second pass, and ALTER COLUMN TYPE
-- to a type the column already has is also a no-op.

-- --- Part 1: new snapshot columns -------------------------------------------

ALTER TABLE "employee_snapshots" ADD COLUMN IF NOT EXISTS "hire_date" date;
--> statement-breakpoint

ALTER TABLE "employee_snapshots" ADD COLUMN IF NOT EXISTS "termination_date" date;
--> statement-breakpoint

-- numeric(6,3): a half-timer is 0.500, and three decimals is enough for any
-- real contracted fraction. Nullable, because most registers do not carry it.
ALTER TABLE "employee_snapshots" ADD COLUMN IF NOT EXISTS "fte" numeric(6,3);
--> statement-breakpoint

ALTER TABLE "employee_snapshots"
  ADD COLUMN IF NOT EXISTS "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- A leaver cannot have left before they were hired. Both nullable, and NULL on
-- either side makes the check pass, so a register that supplies only one date
-- is still importable.
DO $$ BEGIN
  ALTER TABLE "employee_snapshots" ADD CONSTRAINT "employee_snapshots_dates_ordered"
    CHECK ("termination_date" IS NULL OR "hire_date" IS NULL OR "termination_date" >= "hire_date");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
--> statement-breakpoint

-- FTE is a fraction of a full post. Above 1 is legitimate on registers that
-- express overtime as FTE, so only the lower bound is constrained.
DO $$ BEGIN
  ALTER TABLE "employee_snapshots" ADD CONSTRAINT "employee_snapshots_fte_positive"
    CHECK ("fte" IS NULL OR "fte" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
--> statement-breakpoint

-- --- Part 1b: the period control total (step 4's gate reads this) ----------

-- What the admin ticks the register against: the totals printed on the export
-- they uploaded. Nullable, because an upload that supplies none is still
-- valid — step 4 reports "not supplied" rather than treating absence as
-- agreement.
ALTER TABLE "payroll_periods"
  ADD COLUMN IF NOT EXISTS "control_total_gross" numeric(20,3);
--> statement-breakpoint

ALTER TABLE "payroll_periods"
  ADD COLUMN IF NOT EXISTS "control_total_net" numeric(20,3);
--> statement-breakpoint

-- --- Part 2: widen every money column to the currency's minor units --------

ALTER TABLE "employee_snapshots" ALTER COLUMN "gross_salary" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "employee_snapshots" ALTER COLUMN "net_salary" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "payroll_periods" ALTER COLUMN "total_gross" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "payroll_periods" ALTER COLUMN "total_net" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "period_component_totals" ALTER COLUMN "total" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "comparison_results" ALTER COLUMN "gross_delta" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "comparison_results" ALTER COLUMN "net_delta" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "annual_budgets" ALTER COLUMN "amount" TYPE numeric(20,3);
--> statement-breakpoint

ALTER TABLE "annual_budget_phasing" ALTER COLUMN "amount" TYPE numeric(20,3);
