# Migrations

`pnpm db:migrate` runs `drizzle-orm/neon-http/migrator` over this folder, in the
order given by `meta/_journal.json`.

## Every migration here is idempotent, on purpose

The migrator records applied migrations in `__drizzle_migrations`, keyed by a
**hash of the file's contents**. So editing a migration that has already run
makes its hash unknown and the migrator applies it again. That is not
hypothetical — it is what happens to any production database the next time
someone corrects a typo in an old migration.

Every file is therefore written so a second (or third) run is a no-op:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- constraints wrapped in
  `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;`

`duplicate_table` matters as well as `duplicate_object`: adding a `UNIQUE`
constraint creates a backing index, and if that index already exists Postgres
raises `42P07 duplicate_table`, not `42P06 duplicate_object`.

`apps/web/test/harness.test.ts` enforces this — it applies the whole folder to a
fresh PGlite database three times and fails if any pass errors. Add a migration
without guards and that test goes red.

## 0004 was rewritten (step 30, finding B2)

`0004_pink_blindfold.sql` originally used bare `CREATE TABLE`, so a second run
failed with `relation "annual_budgets" already exists`. A retried deploy, or a
`DATABASE_URL` re-pointed at a database that already had the tables, could not
get past it.

The review offered two options: rewrite it with `IF NOT EXISTS` if it had not
reached production, or leave it and note the problem here. It was rewritten,
which is safe in either case **because the rewrite is itself idempotent** — on a
database that already applied the old version, the new version runs again and
does nothing. 0000 and 0001 were guarded at the same time for the same reason.
0002 (`ALTER COLUMN ... SET DATA TYPE`) is naturally idempotent; 0003 already
had guards.

## Large tables: build indexes by hand

`0006_annual_indexes.sql` creates its indexes without `CONCURRENTLY`, which
takes an `ACCESS EXCLUSIVE` lock for the duration of the build. That is fine on
a small table. Once `employee_snapshots` is large, create the index out of band
first and let the migration's `IF NOT EXISTS` find it already there:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS employee_snapshots_period_employee_idx
  ON employee_snapshots (payroll_period_id, employee_external_id, created_at DESC);
```

`CONCURRENTLY` cannot run inside a transaction block, and the migrator wraps
each file in one, so it can never live in a migration.

## Per-period aggregates (step 31)

`0007_period_component_totals.sql` adds `period_component_totals`. It is written
when a period is uploaded; for history that predates it, run:

```bash
pnpm db:backfill-period-totals            # periods with no aggregates yet
pnpm db:backfill-period-totals --force    # rebuild everything
```

The annual queries read this table and fall back to aggregating
`employee_snapshots` live for any period that has no rows in it, so deploying
before the backfill finishes is safe.
