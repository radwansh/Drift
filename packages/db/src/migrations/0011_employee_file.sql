-- Employee File, phase B of docs/EMPLOYEE_FILE_PLAN.md.
--
-- Two things: an index led by the employee id, and a read log.
--
-- Hand-written rather than db:generate'd, because both are written with guards
-- drizzle-kit does not emit. It is `CREATE TABLE IF NOT EXISTS` plus four
-- `CREATE INDEX IF NOT EXISTS` and no constraints at all, so it is idempotent
-- by construction — which matters because drizzle keys __drizzle_migrations on
-- a hash of this file's contents, so editing it later makes it run again on
-- production.

-- B1. The per-employee index.
--
-- The only index on employee_snapshots was
-- employee_snapshots_period_employee_idx (payroll_period_id,
-- employee_external_id, created_at DESC), from 0006. It is led by the period,
-- so the per-employee-across-periods query this whole feature rests on cannot
-- use it. This one is led by the employee id, which is what every Employee File
-- query filters on first.
--
-- created_at is deliberately NOT in the index. This feature does no
-- DISTINCT ON (...) ORDER BY created_at DESC — the plan's D0 bans DISTINCT ON
-- from the feature entirely — so there is nothing for a third column to serve.
-- The column could not discriminate anyway: processUpload inserts every
-- snapshot of a period in one statement and created_at defaults to now(),
-- which is transaction time, so every row of a period shares a timestamp.
--
-- 0006's index stays and still serves the list query, which is driven by the
-- set of periods rather than by one employee.
CREATE INDEX IF NOT EXISTS employee_snapshots_employee_period_idx
  ON employee_snapshots (employee_external_id, payroll_period_id);
--> statement-breakpoint

-- B2. The read log.
--
-- A new table rather than an extension of annual_audit_log, for four reasons:
--
--   Shape. annual_audit_log is {entity, entity_key, old_value, new_value} — a
--   record of a CHANGE. A read has no old or new value, so two columns would be
--   permanently null, and entity_key would be overloaded into "E0002:2026:ytd",
--   which is a string nobody can query by employee.
--
--   Volume and retention. Category and budget edits happen a few times a month;
--   this takes a row per page view. annual_audit_log has no pruning. Two
--   retention policies cannot live on one table.
--
--   Exposure. annual.auditTrail is a memberProcedure returning the whole log
--   for the company with the actor's name joined, so putting reads there would
--   show every viewer who looked at whose salary — a worse privacy surface than
--   the thing the log exists to control.
--
--   Indexing. annual_audit_log is indexed for "this company, newest first". An
--   access review also asks "this employee, newest first" and "this user,
--   newest first".
--
-- No CHECK constraint on `action`, matching the repo's own precedent
-- (annual_audit_log.entity): a varchar with a comment and a zod enum at the
-- edge. That also keeps this file constraint-free. Anything constraint-shaped
-- added here later must be wrapped as
--   DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL;
--                             WHEN duplicate_table THEN NULL; END $$;
-- with BOTH handlers, because a UNIQUE whose backing index already exists
-- raises 42P07 duplicate_table, not 42P06 duplicate_object.
CREATE TABLE IF NOT EXISTS employee_file_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, matching annual_audit_log: deleting a user must not
  -- delete the evidence that they read something.
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- "view_file" | "view_list" | "export_file"
  action varchar(20) NOT NULL,
  -- NULL for a list read, which names no single person.
  employee_external_id varchar(100),
  period_type varchar(20) NOT NULL,
  currency_code varchar(3) NOT NULL,
  fiscal_year integer NOT NULL,
  -- "ytd" | "full_year" | "previous_year" | "slot"
  range_kind varchar(20) NOT NULL,
  slot_from integer,
  slot_to integer,
  -- Rows returned, so a bulk read is distinguishable from a single lookup.
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- "This company, newest first" — the log's own listing.
CREATE INDEX IF NOT EXISTS employee_file_access_log_company_idx
  ON employee_file_access_log (company_id, created_at DESC);
--> statement-breakpoint

-- "Who read this person's file" — the first question an access review asks.
CREATE INDEX IF NOT EXISTS employee_file_access_log_employee_idx
  ON employee_file_access_log (company_id, employee_external_id, created_at DESC);
--> statement-breakpoint

-- "What did this user read" — the second.
CREATE INDEX IF NOT EXISTS employee_file_access_log_user_idx
  ON employee_file_access_log (user_id, created_at DESC);

-- NOTE for production, repeating 0006's note for this feature's index.
--
-- employee_snapshots_employee_period_idx above is created without
-- CONCURRENTLY, which takes an ACCESS EXCLUSIVE lock on employee_snapshots for
-- the duration of the build. That is fine on a small table. Once the table is
-- large, build it by hand first and let IF NOT EXISTS find it already there:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS employee_snapshots_employee_period_idx
--     ON employee_snapshots (employee_external_id, payroll_period_id);
--
-- CONCURRENTLY cannot run inside a transaction block, and the migrator wraps
-- each file in one, so it can never live in a migration.
--
-- Not added: a trigram index for the list's free-text filter. ILIKE '%alice%'
-- cannot use a btree index, and pg_trgm needs CREATE EXTENSION — privileges the
-- migration may not have, and PGlite support this repo has not verified. The
-- ILIKE runs over the already-period-filtered set, so its cost is bounded by
-- headcount x slots in range: about 2,160 rows on samples/2025, 120,000 at
-- 5,000 employees over 24 slots. Acceptable now; named here rather than guessed
-- at later.
