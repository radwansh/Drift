-- Step 31 / finding B7: per-period aggregates, so the annual read path stops
-- unnesting every employee's components JSON on every page view.
--
-- Written when a period is uploaded and rebuilt by the backfill script
-- (packages/db/src/backfill/periodComponentTotals.ts). The annual router reads
-- this table and falls back to the live unnest for any period that has no rows
-- here yet, so it is correct before the backfill has run.

CREATE TABLE IF NOT EXISTS period_component_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  department varchar(200) NOT NULL,
  component_key varchar(200) NOT NULL,
  total numeric(20,2) NOT NULL,
  neg_rows integer NOT NULL DEFAULT 0,
  pos_rows integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE period_component_totals
    ADD CONSTRAINT period_component_totals_period_department_key_unique
    UNIQUE (payroll_period_id, department, component_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS period_component_totals_period_idx
  ON period_component_totals (payroll_period_id);
