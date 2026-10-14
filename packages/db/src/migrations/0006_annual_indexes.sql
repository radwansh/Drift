-- Step 27 / finding B1: nothing indexed the annual filters.
--
-- EXPLAIN of the main CTE showed sequential scans of payroll_periods and of
-- every tenant's employee_snapshots, and a page view ran about ten such queries.
-- On a shared table that means one company's dashboard reads every other
-- company's rows.
--
-- Column order matches how the annual queries filter: company_id and status are
-- always equality predicates, period_type and currency_code are the selected
-- cadence and currency, and period_end carries the year range — so it goes last,
-- where a range predicate can still use the index.
CREATE INDEX IF NOT EXISTS payroll_periods_annual_idx
  ON payroll_periods (company_id, status, period_type, currency_code, period_end);
--> statement-breakpoint

-- The snaps CTE does DISTINCT ON (payroll_period_id, employee_external_id)
-- ORDER BY ... created_at DESC, which this index serves directly: the leading
-- two columns match the DISTINCT ON, and the trailing DESC matches the sort, so
-- Postgres can walk the index instead of sorting the whole table.
CREATE INDEX IF NOT EXISTS employee_snapshots_period_employee_idx
  ON employee_snapshots (payroll_period_id, employee_external_id, created_at DESC);
--> statement-breakpoint

-- Audit reads are "this company, newest first".
CREATE INDEX IF NOT EXISTS annual_audit_log_company_created_idx
  ON annual_audit_log (company_id, created_at DESC);

-- NOTE for production: both indexes above are created without CONCURRENTLY,
-- which takes an ACCESS EXCLUSIVE lock for the duration of the build. That is
-- fine on a small table and during the first deploy. Once employee_snapshots is
-- large, build them by hand instead:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS employee_snapshots_period_employee_idx
--     ON employee_snapshots (payroll_period_id, employee_external_id, created_at DESC);
--
-- CONCURRENTLY cannot run inside a transaction block, so it cannot live in a
-- drizzle migration — the migrator wraps each file in one.
