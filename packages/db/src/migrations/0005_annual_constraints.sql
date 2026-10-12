-- Migration 0005: constraints, types and the audit log the annual router needs.
--
-- Written to be safely re-runnable (every statement is guarded), unlike 0004,
-- which fails on a second run with "relation annual_budgets already exists"
-- (finding B2). Step 30 addresses 0004 itself.
--
-- Normalise existing budget currencies to upper case BEFORE adding the ISO
-- check, or the constraint fails validation on existing rows.

UPDATE annual_budgets SET currency = UPPER(currency) WHERE currency <> UPPER(currency);
--> statement-breakpoint

-- B4: numeric(14,2) tops out near 1e12, so an LBP payroll could not be stored.
ALTER TABLE annual_budgets ALTER COLUMN amount TYPE numeric(20,2);
--> statement-breakpoint

ALTER TABLE annual_budgets ADD COLUMN IF NOT EXISTS basis varchar(20) NOT NULL DEFAULT 'gross';
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE annual_budgets ADD CONSTRAINT annual_budgets_currency_iso CHECK (currency ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE annual_budgets ADD CONSTRAINT annual_budgets_basis_valid
    CHECK (basis IN ('gross', 'employer_cost', 'net'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS annual_budget_phasing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES annual_budgets(id) ON DELETE CASCADE,
  month integer NOT NULL,
  amount numeric(20,2) NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE annual_budget_phasing ADD CONSTRAINT annual_budget_phasing_month_valid
    CHECK (month BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE annual_budget_phasing ADD CONSTRAINT annual_budget_phasing_budget_month_unique
    UNIQUE (budget_id, month);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- B3: the category column was a free varchar(40); the spec asked for a closed set.
DO $$ BEGIN
  ALTER TABLE component_categories ADD CONSTRAINT component_categories_category_valid CHECK (category IN (
    'base_salary','allowance','bonus_commission','overtime','other_earning',
    'income_tax','social_security_employee','other_deduction','absence_deduction',
    'social_security_employer','other_employer_cost','absence_days','other_quantity',
    'ignore','uncategorised'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

ALTER TABLE component_categories ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint

-- B5: a rule-based fallback was cached under the model's name, so the UI
-- presented deterministic text as AI output.
ALTER TABLE annual_insight_caches ADD COLUMN IF NOT EXISTS source varchar(10) NOT NULL DEFAULT 'rules';
--> statement-breakpoint

ALTER TABLE annual_insight_caches ADD COLUMN IF NOT EXISTS prompt_version varchar(20) NOT NULL DEFAULT 'v1';
--> statement-breakpoint

-- B8: no audit trail for company-wide category and budget changes.
CREATE TABLE IF NOT EXISTS annual_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity varchar(40) NOT NULL,
  entity_key varchar(200) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS annual_audit_log_company_idx ON annual_audit_log (company_id, created_at DESC);
