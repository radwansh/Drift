# Employee File — implementation plan

*Architecture pass, 1 November 2026, against `feat/llms-blog-and-capture`.*
*Input: `docs/EMPLOYEE_FILE_SPEC.md` (the requirement) and `CLAUDE.md` (the conventions).*
*34 steps in 7 phases. Each step names the files it touches, what changes, and how it is verified.*

---

## 0. Decisions taken as given

These came from the owner and are not re-opened. They are restated because several steps
below only make sense against them.

1. **Access: admin and manager, both full pay detail**, through a **new** procedure over
   `memberProcedure` — not `editorProcedure`. The same role set today, a different
   meaning tomorrow.
2. **Ships live. No launch switch.**
3. **Sidebar: first item, above Dashboard.** Role gating has to be introduced as part of
   this work, because `NAV_ITEMS` has none at all.
4. **Default list scope: everyone paid in the selected range.** Leavers appear, badged.
5. **Duplicates: sum both rows and flag loudly.** No `DISTINCT ON` on employee rows
   anywhere in this feature. The repo-wide disagreement is recorded, not fixed.
6. **Reads are logged.** Manager access is company-wide because Clarivo stores no
   reporting line; the log is the control that makes that defensible.

---

## 1. Where the spec and the codebase disagree

The spec's author worked from the schema and the sample data and did not read the whole
app. Eleven things need correcting or re-costing before anyone implements against it.
Each is cited so a reviewer can check it without taking my word.

### F1 — `saved_views` is dead schema; the column picker is not reusable as a component

§3.2 says the column picker is "persisted in `saved_views`" and should be reused.

Nothing in the app reads or writes `saved_views`. The only references are the table
definition, its export from `packages/db/src/schema/index.ts`, and migration `0000`.
Column preferences actually live in `localStorage` under `drift_saved_views`
(`apps/web/src/hooks/use-saved-views.ts:18`). And the picker's model is
`{component, visible, mode}` where `mode` is `current | previous | side_by_side |
delta_only` — comparison semantics with no meaning for a list column, so reusing the
component would render four meaningless mode buttons per column.

**Do:** reuse the *pattern*, not the component. A new `employee-column-picker.tsx` with
its own key union, and a `use-employee-columns` hook over `localStorage`. Do not wire
`saved_views` up as part of this feature; record it in CLAUDE.md as dead schema so the
next reader is not misled the same way.

### F2 — The spec contradicts itself about `components/annual/*`

§2.5 forbids rendering `components/annual/*` in v1. §4.4 requires every chart to be
wrapped in `components/annual/chart-frame.tsx`, and §2.2 requires the `annual-utils.ts`
formatters. Both cannot hold.

**Do:** resolve in favour of CLAUDE.md. `chart-frame.tsx` and `annual-utils.ts` are
shared presentation primitives, not the gated dashboard; import them in place. Do **not**
move them to `components/shared/` in v1 — that touches `annual-bridge`,
`annual-headcount-chart`, `annual-periods-chart` and `annual-statutory` for no
behavioural gain. §2.5's real target is `annual-dashboard.tsx` and the company-level
tiles, and those stay out.

### F3 — The `export_history` pattern cannot carry an employee-file export

§4.8 says to reuse it. `exportHistory.comparisonRunId` is
`uuid(...).notNull().references(comparisonRuns.id)`
(`packages/db/src/schema/exportHistory.ts`). An employee-file export has no comparison
run, so the row cannot be written at all.

**Do:** export is deferred out of v1 (see the cut list). When it lands it needs either a
nullable `comparison_run_id` or its own table — a migration either way. The spec treats
the export as nearly free; it is not.

### F4 — "Employee pay is admin-only" is already false

§1.2 frames the change as overriding an admin-only rule. That rule does not hold today:
`comparisons.getById` is `memberProcedure`
(`apps/web/src/server/routers/comparisons.ts:149`) and returns every `comparison_results`
row — employee name, gross, net, per-component deltas — to any signed-in member,
**including a viewer**. The Dashboard and the Detailed View are built on it.

**Do:** relaxing `employees.*` to admin+manager opens nothing that is not already open to
viewers through a different door. Say so in the plan and in CLAUDE.md. Recommend the
comparisons gap as a separate, product-level decision — closing it would remove the
Dashboard and Detailed View from viewers, which is not an architecture call. Do not touch
it here.

### F5 — The list's flag column, filter and default sort do not fit the stated budget

§3.2 col 3, §3.3's `hasFlag`, and §3.4's "one query plus one count" are mutually
incompatible. Two of the four §4.3 checks need the classifier, which is a TypeScript
vocabulary (`packages/payroll-core/src/annual/classify.ts`). Sorting the whole company by
worst severity *before* pagination therefore means pulling every employee's every slot's
`components` jsonb into Node on every list view: 180 x 12 = 2,160 rows on `samples/2025`,
but 2,000 x 12 = 24,000 jsonb rows at a plausible customer size, per page view.

**Do:** split the flag set by where it can be computed.

- In SQL, for every employee: `net > gross + q`, `net < -q`, and the duplicate-row
  marker. All three are pure column arithmetic, and they are exactly what §12.3
  assertion 10 requires to be visible in the list without opening a file.
- In TypeScript, for the file page only: the two identity-breach checks
  (`earnings_not_gross`, `deductions_not_net`) and the anomaly flags.
- Default sort becomes "critical (SQL-computed) first, then name", and the column header
  says which flags it counts.

This narrows §3.2 col 3 and §3.3's `hasFlag`. See §9 for the recommendation and the
follow-up that would widen it back (a per-period flags table written at upload).

### F6 — The spec never says what an in-tenant id with no rows in range answers

§1.3 covers the out-of-tenant case (NOT_FOUND, so the error does not confirm the id
exists). It is silent on an id that exists but has nothing in the selected range — a
leaver opened in the current year.

**Do:** NOT_FOUND only when the id has no rows in **any** ready period for the company.
An id with no rows in *this range* renders a valid, empty file naming the ranges that do
have data. Otherwise every bookmark breaks each January.

### F7 — K8's slot count is silently wrong for weekly cadences

§6.1 K8 uses the length of `generateExpectedPeriods(cadence, year, anchor, fsm)`. For
`weekly` and `bi_weekly`, that function seeds its grid from `anchor ?? interval.start`
(`packages/payroll-core/src/annual/periods.ts`), so an unanchored call counts from
1 January and can be one slot out — 52 against 53.

**Do:** always pass the first covered period's `periodStart` as the anchor, as the annual
engine does. Named here because omitting it produces a plausible wrong number.

### F8 — §7.4 id-change detection is the most expensive detection in the feature

Same normalised name, overlapping department, disjoint coverage, recurring pay within q.
Done naively that is a pairwise pass over the company's roster on every file view.

**Do:** bucket by normalised name first (one pass to build a name to ids map over the
range), then compare only within a bucket. Even so it buys the least per line of code of
anything marked **E**, and it sits above the component matrix in the cut list.

### F9 — Discovered dimension columns are unbounded, and untested against real data

§3.2 col 12 asks for one column per existing dimension key. `dimensions` is open-ended;
a register with eight keys produces eight extra columns. Separately, nothing in
`apps/web/src` reads `dimensions` today except the upload processor, and §12.1 confirms
no sample register carries any — so every dimension feature in this spec is unexercised
against real data.

**Do:** cap the visible dimension columns at the five keys with the highest non-null
coverage and put the rest behind the picker. Treat the dimension surface as N-priority
and ship it with the `monthly-usd` fixture, not before it.

### F10 — Do not copy `MAX(employee_name)`

`annual.ts:1113` does `MAX(r.employee_name) AS "employeeName"` in `drillDownEmployees`.
That is the **alphabetical** maximum, not the latest — wrong for §7.12's "display the
latest name, keep every prior name".

**Do:** `(array_agg(employee_name ORDER BY p.period_end DESC, p.created_at DESC))[1]`.
The existing line is a pre-existing defect in the annual drill-down; fixing it is a
one-line follow-up, out of scope here, but it must not be copied.

### F11 — No AI narrative in v1

§9 permits written text on the page. Nothing requires it, and every sentence costs a rule
in §9 plus acceptance assertion 12.

**Do:** ship no narrative. Assertion 12 is then vacuously true and §9's rules are
unviolated rather than untested. See §9.

### Verified facts the steps below rely on

- The only index on `employee_snapshots` is `employee_snapshots_period_employee_idx` on
  `(payroll_period_id, employee_external_id, created_at DESC)` (migration `0006`). It is
  led by the period, so the per-employee-across-periods query this feature rests on
  cannot use it.
- `created_at` cannot break a duplicate-row tie. `processUpload` inserts every snapshot of
  a period in **one statement** (`apps/web/src/server/upload/processor.ts:246`) and the
  column defaults to `now()`, which is transaction time — identical for every row. So
  `DISTINCT ON (...) ORDER BY created_at DESC` in `annual.ts:162` and
  `packages/db/src/aggregates/periodComponentTotals.ts:29` picks an arbitrary row, and
  may pick a different one between runs. Recorded, not fixed (decision 5).
- `payroll_periods.total_gross` is the sum of **every** row (`processor.ts:195` and
  `:225`), which is why summing duplicates is what ties to the register.
- `annualSalariesLive` has six read sites, all marketing. Nothing here is gated. The pure
  helpers in `packages/payroll-core/src/annual/` are required, not gated.
- `period_component_totals` has no employee dimension and no gross/net columns, so it is
  unusable here. The Employee File reads `employee_snapshots` exclusively — there is no
  dual path to write and none to keep numerically identical. This must go in CLAUDE.md,
  because the annual feature's fallback rule invites copying it.

---

## 2. Phase A — access, policy and navigation (5 steps)

Lands first and lands together. A1, A2 and A5 are **one commit**: splitting them leaves
the repository carrying two contradictory policies, which is the thing §1.2 asks us to
fix.

### A1. The new procedure

**File:** `apps/web/src/server/trpc.ts`

Add, below `editorProcedure`:

```ts
/**
 * Roles that may read an individual's pay detail.
 *
 * Deliberately NOT EDITOR_ROLES, even though the two lists are identical today.
 * EDITOR_ROLES means "may change company-wide settings"; this means "may read
 * every salary in the company". Sharing the constant would make a later change
 * to who may set the budget silently change who may read every salary.
 */
export const PAY_DETAIL_ROLES = ["admin", "manager"] as const;

export const payDetailProcedure = memberProcedure.use(async ({ ctx, next }) => { ... });
```

The thrown message must not contain the words "admin role": two existing tests match on
`/FORBIDDEN|admin role/i` and the new message has to be distinguishable. Use
`"Reading individual pay detail requires the admin or manager role."`

In the same file, **correct `adminProcedure`'s comment**. Its current text — "a manager
who can edit company settings should not automatically be able to read every salary" — is
the policy being reversed. Replace it with what is true after this change: `adminProcedure`
is reserved for actions only an admin may take, and after A2 nothing in the app uses it.
Keep it rather than delete it: user and role administration belongs behind it and
currently is not (`auth.inviteUser` hand-rolls its own `role !== "admin"` check), and
deleting the export would widen this change.

Name chosen over `employeeFileProcedure` because A2 puts `employees.*` and
`annual.drillDownEmployees` behind it too, and those are not the Employee File.

**Verify:** typecheck; A3's tests.

### A2. Move the existing employee-level reads onto it

**Files:** `apps/web/src/server/routers/employees.ts`,
`apps/web/src/server/routers/annual.ts`

Yes — the three existing `employees.*` procedures relax to the same level, and so does
`annual.drillDownEmployees`. Reasoning, since the brief asks for it:

1. The Employee File shows strictly **more** than any of them: a full year of gross, net,
   every component, every deduction, per person. A manager who can read that but cannot
   list one period's roster is an incoherent seam, and it would force role-conditional
   rendering on a drill-down that shows a subset of what they already have.
2. The rule being preserved is already not a rule (F4): a *viewer* reads per-employee
   gross, net and component deltas through `comparisons.getById`. Keeping `employees.*`
   admin-only protects nothing while costing coherence.
3. Leaving `drillDownEmployees` on `adminProcedure` reproduces the same seam one screen
   over, for the same data, in the same product.

Also in `employees.ts`:

- Rewrite the header comment block. It currently states the policy being reversed. The
  replacement must say: admin and manager, both full detail; `employee_snapshots` carries
  no `companyId` so scoping is an ownership check on the period or a join to it, never a
  filter on the snapshot table; an out-of-tenant row answers NOT_FOUND, not FORBIDDEN.
  Keep those last two — they are still true and still load-bearing.
- **Fix `search`:** `like` becomes `ilike` (line 97-98). Postgres `like` is
  case-sensitive, so `alice` does not match `Alice Johnson` today. Two-line change,
  imported from `drizzle-orm`.

**Verify:** A3.

### A3. Update the tests that pin the old policy

**Files:** `apps/web/test/tenant-scoping.test.ts`,
`apps/web/test/annual-router.test.ts`

Two suites assert the policy being reversed and will go red:

- `tenant-scoping.test.ts:153-165` — "a manager cannot read employee-level pay" becomes
  "a manager can"; the viewer case stays but its regex `/FORBIDDEN|admin role/i` must
  change, because the new message says "admin or manager role".
- `annual-router.test.ts:400-416` — "refuses a viewer and a manager reaching employee
  rows" becomes "refuses a viewer, allows a manager and an admin". Its inline comment
  states the old rationale and must be rewritten, not just the assertion.

Add, in `tenant-scoping.test.ts`: a case proving `search` is now case-insensitive
(`alice` matches `Alice Johnson`) — otherwise the `ilike` fix has no test and will be
reverted by the next person who "tidies" it.

**Verify:** `pnpm --filter @saas/web exec vitest run test/tenant-scoping.test.ts test/annual-router.test.ts`

### A4. Role-gated navigation

**Files:** `apps/web/src/lib/constants.ts`,
`apps/web/src/components/shared/sidebar.tsx`,
`apps/web/src/app/(main)/layout.tsx`

`NAV_ITEMS` is a flat `as const` with no gating whatsoever, so every item renders for
every signed-in user. Without gating, a viewer sees an Employee File link that throws
FORBIDDEN on click.

1. `constants.ts`: add `{ label: "Employee File", href: "/employees", icon: "Users" }` as
   the **first** entry, and add an optional `roles` field to the item shape. `roles`
   absent means everyone; `roles: PAY_DETAIL_ROLES` on the new entry. Do not add `roles`
   to the other six — their current behaviour is unchanged, and changing it is a separate
   decision.
2. `sidebar.tsx`: import `Users` from `lucide-react` and add `Users: <Users className="h-5 w-5" />`
   to `iconMap`. **This is the trap §1.3 names:** `iconMap` is a literal lookup, so an
   icon string that is not a key renders no icon and no error. Then filter
   `NAV_ITEMS` by the role prop. Active state needs no change — the sidebar already
   compares `"/" + pathname.split("/")[1]`, so `/employees/E0002` highlights the item.
3. `layout.tsx`: it is already `force-dynamic` but queries nothing. It must resolve the
   role: `auth()`, then `ensureUser(requireDb(), userId)`, then pass `role` into
   `<Sidebar role={...} />`. On any failure pass the **least** privileged value, so a
   lookup failure hides the link rather than showing a broken one.

The sidebar is a client component, so the alternative is a `trpc.auth.getMe` query inside
it — one extra request on every page in `(main)` plus a flash of the ungated nav. The
layout prop is one indexed lookup on a `UNIQUE` column and is already on a dynamic path.

**Gating here is cosmetic.** The real control is A1's procedure plus E1's server-side page
check. Say that in the code comment, or someone will later "simplify" the procedure check
away because the link is hidden.

**Verify:** no automated browser test exists in this repo. Assert the data instead:
a unit test over `NAV_ITEMS` that every `icon` string is a key of `iconMap` (exported for
the purpose) and that the Employee File entry is index 0 with `roles` set. That catches
the icon trap mechanically and is the one thing a review will not catch by eye.

### A5. CLAUDE.md role table and policy text

**File:** `CLAUDE.md`

In the same commit as A1 and A2. Three edits in the "Multi-tenancy and roles" section:

- Add a row: `payDetailProcedure | admin, manager | reading an individual's pay detail`.
- Correct the `adminProcedure` row. "individual employee data" is no longer true after A2
  and was never true (F4). Replace with "reserved; nothing uses it after the Employee
  File change".
- Add two sentences recording F4: that `comparisons.getById` is a `memberProcedure`
  returning per-employee pay to viewers, that it is therefore the widest employee-level
  surface in the product, and that narrowing it is a product decision rather than a
  tidy-up.

**Verify:** read-through. There is no test for CLAUDE.md, which is exactly why the stale
comment in `trpc.ts` survived to become the problem §1.2 had to raise.

---

## 3. Phase B — database (3 steps)

Independent of Phase A. Can run in parallel.

### B1. The per-employee index

**File:** `packages/db/src/migrations/0011_employee_file.sql` (new)

```sql
CREATE INDEX IF NOT EXISTS employee_snapshots_employee_period_idx
  ON employee_snapshots (employee_external_id, payroll_period_id);
```

Led by the employee id, which is what every query in this feature filters on first. The
existing `0006` index stays and still serves the list query, which is driven by the period
set.

`created_at` is deliberately **not** in the index: this feature does no
`DISTINCT ON ... created_at DESC`, so there is nothing to serve, and the column cannot
discriminate anyway (§1 verified facts).

Repeat `0006`'s production note verbatim in the file, for this index:

```sql
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS employee_snapshots_employee_period_idx
--   ON employee_snapshots (employee_external_id, payroll_period_id);
```

`CONCURRENTLY` cannot live in a migration — the migrator wraps each file in a
transaction — so on a large table build it by hand first and let `IF NOT EXISTS` find it.

**Not added:** a trigram index for the free-text filter. `ILIKE '%alice%'` cannot use a
btree index, and `pg_trgm` needs `CREATE EXTENSION`, which needs privileges the migration
may not have and which PGlite support for is unverified. The ILIKE runs over the
already-period-filtered set, so the cost is bounded by headcount x slots in range: 2,160
rows on `samples/2025`, 120,000 at 5,000 employees over 24 slots. Acceptable now, named as
a future concern in the plan rather than guessed at.

### B2. The access log table

**Files:** `packages/db/src/migrations/0011_employee_file.sql` (same file),
`packages/db/src/schema/employeeFileAccessLog.ts` (new),
`packages/db/src/schema/index.ts`

**Decision: a new table, not an extension of `annual_audit_log`.** Four reasons:

1. **Shape.** `annual_audit_log` is `{entity, entityKey, oldValue, newValue}` — a record of
   a *change*. A read has no old or new value, so two columns would be permanently null,
   and `entityKey` would be overloaded into `"E0002:2026:ytd"`, which is a string nobody
   can query by employee.
2. **Volume and retention.** Category and budget edits happen a few times a month; a read
   log takes a row per page view. `annual_audit_log` has no pruning (the insight cache
   got `pruneInsightCache` for exactly this reason). The two need different retention
   policies, and one table cannot have two.
3. **Exposure.** `annual.auditTrail` is a `memberProcedure` that returns the whole log for
   the company with the actor's name joined. Putting reads in there would show every
   viewer *who looked at whose salary* — a worse privacy surface than the thing the log
   exists to control — and would bury the settings-change entries it was built for.
4. **Indexing.** `annual_audit_log` is indexed for "this company, newest first". A read
   log also needs "this employee, newest first" and "this user, newest first", which are
   the two questions an access review actually asks.

```sql
CREATE TABLE IF NOT EXISTS employee_file_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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
```

Three indexes, all `IF NOT EXISTS`: `(company_id, created_at DESC)`,
`(company_id, employee_external_id, created_at DESC)`, `(user_id, created_at DESC)`.

`user_id` is `ON DELETE SET NULL`, matching `annual_audit_log`: deleting a user must not
delete the evidence that they read something.

**No CHECK constraint on `action`.** The repo's own precedent (`annual_audit_log.entity`)
is a `varchar` with a comment and a zod enum at the edge. That also sidesteps the trap the
brief names: a `UNIQUE` or any constraint whose backing index already exists raises
`42P07 duplicate_table`, **not** `42P06 duplicate_object` — so anything constraint-shaped
added here later must be wrapped as
`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;`
with **both** handlers. We add no constraints, so the migration is `CREATE TABLE IF NOT
EXISTS` plus four `CREATE INDEX IF NOT EXISTS` and is idempotent by construction.

Schema module mirrors `annualAuditLog.ts` exactly, including the `(t) => [index(...)]`
form, and is exported from `schema/index.ts`.

### B3. The journal entry, and the two tests that police it

**Files:** `packages/db/src/migrations/meta/_journal.json`,
`apps/web/test/harness.test.ts`

The journal drives `drizzle-kit migrate`; `applyMigrations` in `test/pglite-neon.ts`
globs the folder and sorts. **They must agree**, and `harness.test.ts`'s "migration
journal (step 9)" suite asserts it on both axes: tag list equality against the sorted
file list, and `idx` equal to the file's own four-digit prefix. So:

```json
{ "idx": 11, "version": "7", "when": <ms, greater than 1792018723845>, "tag": "0011_employee_file", "breakpoints": true }
```

A file with no entry passes every glob-based test and then never runs on production; an
entry with no file makes `drizzle-kit migrate` fail outright. Neither is visible from the
globbing side, which is why the test exists.

No `meta/00NN_snapshot.json` is needed — snapshots stop at `0004` and every hand-written
migration since (`0005`-`0010`) has only a journal entry. This is hand-written, not
`db:generate`d, because the index and table are written with guards that drizzle-kit does
not emit.

Then extend the existing `describe("annual indexes (step 27)")` block with an EXPLAIN
assertion for the new index:

```ts
it("serves the per-employee history query with an index scan", async () => {
  const text = await plan(`
    SELECT gross_salary FROM employee_snapshots
    WHERE employee_external_id = 'E7'
      AND payroll_period_id IN (SELECT id FROM payroll_periods LIMIT 50)
  `);
  expect(text).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
  expect(text).toContain("employee_snapshots_employee_period_idx");
});
```

That block's existing seed already gives the selectivity this needs: 15,000 snapshot rows
across 300 periods with 50 distinct external ids, so one id selects ~2% of the table and
the planner should prefer the index. It also runs `ANALYZE`, without which the assertion
would say nothing.

**Verify:** `pnpm --filter @saas/web exec vitest run test/harness.test.ts`. The
triple-apply idempotency test and the journal test both cover `0011` automatically.

---

## 4. Phase C — domain logic (7 steps)

### Where the line falls

**In `packages/payroll-core/src/employee/` (new, pure, no DB, no React):** everything that
turns a set of snapshot rows plus a slot calendar into facts — slot kinds, per-slot
category totals, the balancing lines, the KPIs with their suppression reasons, presence
spans, the change log, the flags. All of it is a function of its inputs, all of it is
testable without Postgres, and all of it is the half that has to be right.

**In `apps/web`:** SQL, zod row schemas, tRPC shape, URL state, formatting, layout.
Nothing arithmetical. The `Number(string)` boundary conversion happens in the router, once
per value, on the way in; `String(...)` on the way out if anything ever goes back (nothing
does — the feature is read-only).

**Everything calendar-shaped goes through `assignSlot`.** Not one end-date comparison
anywhere in this phase. `generateExpectedPeriods` produces R; `dedupePeriods` kills
re-uploads; `assignSlot` places each survivor; off-cycle runs sharing a slot merge the way
`groupBySlot` merges them. `fiscal.ts` owns every year boundary.

**`noUncheckedIndexedAccess` applies here and not in `apps/web`.** Three traps to plan for
rather than discover: `rows[i]` is `T | undefined` (hoist before narrowing);
`expected[index - 1]` for "the previous slot" is `T | undefined` and the first slot is the
case that bites; and any lookup table must be a closed union (`Record<Category, number>`)
rather than `Record<string, number>`, because annotating it as the latter adds an index
signature and makes every member possibly undefined — use `satisfies` where a literal is
needed.

### C1. Types

**File:** `packages/payroll-core/src/employee/types.ts`

```ts
export type EmployeeSlotKind = "actual" | "duplicate" | "not_paid" | "missing";
```

Four values, matching §2.3 — and deliberately **not** the annual engine's
`PeriodKind` (`actual | estimated | forecast | missing`). The two sets look alike and mean
different things: there is no `estimated` here because §10 forbids estimating one person's
missing month, and no `forecast` because the file forecasts nothing. A shared type would
invite exactly the substitution that produces an invented payment to an individual. Add a
comment saying so, next to the type.

Then `EmployeeSlotRow` (slot, kind, rowCount, gross, net, byCategory, byKey, earnBal,
netBal, recurring, variable, mixedSignKeys, department, name, fte, dimensions,
mergedRunCount), `PresenceSpan`, `ChangeLogEntry`, `EmployeeFlag`, `EmployeeFileResult`,
and a discriminated `Kpi<T> = { ok: true; value: T } | { ok: false; reason: KpiSuppression }`.

That last one is the most important decision in the phase: **suppression is part of the
return type, not a UI convention.** §6.3 lists nine KPIs that mislead and the presentation
each requires. If `averageGrossPerPaidPeriod` returns `number`, a component can print it
with no window label and nothing fails. If it returns `Kpi<number>` with
`reason: "insufficient_history" | "duplicate_slots_excluded" | "employer_costs_not_mapped"
| "fte_not_mapped" | "peers_below_five" | "uncategorised_non_zero" | "spans_gap"`, the
suppression is unavoidable and the reason is renderable.

### C2. Slot assignment and kinds

**File:** `packages/payroll-core/src/employee/slots.ts`

```ts
export function buildEmployeeSlots(opts: {
  expected: readonly ExpectedSlot[];              // R
  periods: readonly AnnualPeriodInput[];          // already deduped by dedupePeriods
  cadence: PeriodType;
  rows: readonly EmployeeSnapshotRow[];           // one per DB row, NOT deduped
}): EmployeeSlotRow[]
```

One output row per slot in R, in calendar order. Never only the slots with data.

- slot not in C (no period assigned) -> `missing`. Shown, labelled, excluded from every
  denominator, never 0, never dropped.
- slot in C, zero rows for e -> `not_paid`. Shown, labelled, excluded from rate
  denominators, **counted** in covered slots, because the absence is evidence.
- slot in C, exactly one row -> `actual`.
- slot in C, more than one row -> `duplicate`. `gross` is the **sum of all rows**, which is
  what ties to the register and to `payroll_periods.total_gross`; `rowCount` and the
  individual rows are carried through for display; the slot is excluded from K5-K8 and
  from every delta.

Several periods on one slot merge (off-cycle bonus run, correction run), summing money,
with `mergedRunCount` carried so the UI can say "2 runs merged".

### C3. Per-slot totals and the two balancing lines

**File:** `packages/payroll-core/src/employee/totals.ts`

Per slot, build `ComponentAggregate[]` from the employee's rows — `total` = sum over rows
where the key is present and non-null, `negRows`/`posRows` = counts of each sign — then
call the **existing** `buildCategoryTotals(components, resolve, ambiguityOf)`.

Reusing it rather than re-summing is the point: it already applies `Math.abs` to deduction
and employer categories, already excludes quantities and `ignore` from money, and already
reports `mixedSignKeys` when a key has both signs. Re-implementing any of that is how the
Employee File ends up disagreeing with the annual dashboard about the same column.

`resolve` is the three-step resolution of §2.2: the company's saved
`component_categories.category`, else `classifyComponent(key)`, else `uncategorised`.
One classifier, one answer.

Then, per slot: `E`, `D`, `W` via `sumMoney` over `EARNING_CATEGORIES`,
`EMPLOYEE_DEDUCTION_CATEGORIES`, `EMPLOYER_COST_CATEGORIES`; and the two balancing lines,
which are the whole of blocking gap B1:

- `earnBal = gross - E` — the per-employee twin of `other_earnings_balance`
- `netBal = gross - net - D` — the per-employee twin of `balance`

Both are returned always and rendered as their own labelled lines whenever non-zero. On
`samples/2025`, E0002's `earnBal` is 3,604.74 of expense reimbursements for the year —
1.3% of that person's pay, which without the line simply vanishes from "total earnings".

`recurring = base_salary + allowance`; `variable = bonus_commission + overtime +
other_earning`. Both per slot.

Every zero test and every change test uses `q = smallestUnit(minorUnits(currency))`, never
a hardcoded 0.01. Three decimals for KWD, none for JPY.

**Verify (C2+C3):** `packages/payroll-core/src/employee/totals.test.ts` reproducing §8.1's
worked example for E0002 exactly: K1 276,202.12; D 68,872.56; `netBal` 0.00; `earnBal`
3,604.74; recurring 241,827.18; variable 30,770.20; and
241,827.18 + 30,770.20 + 3,604.74 = 276,202.12. If that test passes, B1 is discharged.

### C4. Flags — reconciliation and anomalies, by reuse

**File:** `packages/payroll-core/src/employee/flags.ts`

Two existing engines do this work. Neither is called the obvious way, and both reuses are
worth stating precisely, because re-implementing either produces a third answer.

**`reconcileRegister` (reconcile.ts), called once per employee per currency block, with
the slots as its "rows".** Its input is `{ rows: ReconcileRow[], decimals, rowNumbers,
answeredCategories }` where each row is `{employeeId, gross, net, components}`. Pass one
pseudo-row **per covered slot**, with `employeeId` = the slot label. Then:

- `breaches` comes back per slot, with `expected`, `actual` and `difference` — exactly
  §4.3's "the slot, the expected figure, the register's figure and the difference", for all
  four checks (`earnings_not_gross`, `deductions_not_net`, `net_exceeds_gross`,
  `negative_net`), on **every** slot in range rather than only the latest. That is §7.16.
- `mixedSignColumns` comes back computed **per column across the range**, which is
  precisely §7.15's "when a key has both signs for this employee in range" — and it is not
  obtainable by calling the function per slot, because sign inference is a
  column-across-rows pass. That is the reason for the pseudo-row trick.
- A column it cannot read already suppresses that row's identity-2 verdict, which is
  §7.15's "suppress the deduction-rate KPIs for the affected slots" for free.
- `totals.unplaced` for the range should equal the sum of per-slot `earnBal` from C3,
  because both model unplaced money as sitting on the earnings side. Assert it in a test:
  a cheap cross-check that C3 and `reconcile.ts` have not drifted.

Tolerance is the currency's minor unit, absolute, via `decimals = minorUnits(currency)`.
Not a percentage — 2% of a 20M payroll hides 400,000.

**`detectAnomalies` (anomaly-detector.ts), per consecutive covered-slot pair.** It takes
`(current: EmployeeRecord | null, previous: EmployeeRecord | null, output: ComparisonOutput,
opts)`. Build the pair with a small local helper: `EmployeeRecord` is trivially
constructible from a slot row, and `ComparisonOutput` needs `componentDeltas` from
`diffComponents(current, previous, decimals)` plus gross/net deltas from `calculateDelta`.

**Do not call `runComparison`.** It throws `DuplicateEmployeeIdsError`
(`comparator.ts:35`) — correct for a register-wide comparison, wrong here, where
decision 5 says the file sums and flags instead. It also matches whole registers, which is
not what is being compared.

Skip any pair where either side is `duplicate`: summing two rows looks like a doubling and
would fire `net_change` spuriously. A pair spanning a `missing` slot is computed between
the two **covered** slots and marked "spans a gap", matching `spansGap` in `headcount.ts`.

Tolerances come from `companies.settings` with `DEFAULT_TOLERANCES` as the fallback, and
the result carries **which** was used — a 20% net threshold is a company policy, not a law
of payroll.

Finally, **do not** reintroduce the zero-valued-component rule. It produced 3,166 flags
across the twelve `samples/2025` registers, all one rule, none actionable. §7.14's
distinction is the replacement: absent renders blank, a real 0 renders `0.00`, absent to a
value is "component added", 0 to a value is a movement.

### C5. Presence, status and the three "possibly" labels

**File:** `packages/payroll-core/src/employee/presence.ts`

- **Presence spans** from slot indexes: a run of paid slots, a gap of one or more
  `not_paid` slots, then another run. **Never** across `missing` slots — a gap in uploads
  is not a gap in employment, and conflating them invents a leaver. Two or more spans
  gives a `Rehired` badge and **no single tenure figure**.
- **Status** per §3.1/§3.2: Active / Left `<slot>` / Joined `<slot>` / Rehired / Not paid
  in range, always naming the slot it is derived from.
- **`final settlement`** on the last paid slot when any of: `termination_date` falls in the
  slot window; a component whose classifier rule is `one-off-earning` is present; or the
  employee does not appear in the next **covered** slot. Excluded from K5-K8 and from any
  "largest increase" ranking, with the one-off components itemised.
- **`possibly prorated`** on the first paid slot when `hire_date` falls inside the slot
  window, **or** its recurring pay is below the next slot's by more than q with no
  base-rate change between them. The label is "possibly prorated", never "prorated":
  proration cannot be proven without a working-day calendar, which Clarivo does not have.
- **`id may have changed`** / **`id may be reused`** per §7.4 and §7.12: both detected and
  reported, never resolved. No table exists to store a merge decision, so a merge is not
  expressible even if someone wanted one. Bucket by normalised name first (F8).
- **Tenure** only when `hire_date` is mapped, and never across a gap. `hire_date` usually
  carries the *latest* hire date, overwriting the first spell — so where it differs between
  spells, both dates become a change-log entry rather than one number.

### C6. KPIs

**File:** `packages/payroll-core/src/employee/kpis.ts`

K1-K16 for v1. Every one returns `Kpi<T>` from C1, so §6.3's required presentation is
enforced by the type rather than by a reviewer noticing. Specifically:

- **K3 coverage** is computed first and everything else derives from it: paid = `|P(e)|`,
  covered = `|C|`, expected = `|R|`, not paid = `|C| - |P(e)|`, not uploaded =
  `|R| - |C|`. §8.2 is the arithmetic that matters: E0001, paid Jan-Nov, 50,242.51 over 11
  slots is 4,567.50; over 12 calendar slots it is 4,186.88, understating by exactly one
  twelfth. **Every denominator is `|P(e)|` excluding `duplicate` slots, never `|R|`.**
- **K5** returns the mean **and** the slots it excluded, so the UI can name the one-off
  periods beside it. It is never presented alone as "monthly salary".
- **K6** picks `p*` = the latest slot in `P(e)` that is neither `duplicate`, nor
  `possibly prorated`, nor `final settlement`, and returns the slot label with the value.
  With no such slot it suppresses, with the reason.
- **K8** = K6 x `slotsPerYear`, where `slotsPerYear` is the length of
  `generateExpectedPeriods(cadence, year, anchor, fsm)` **with the anchor passed** (F7) —
  12, 24, 26/27, 52/53, generated, never hardcoded. Carries the `annualised` scope label
  and names the slot. It refuses to annualise anything but K6's `p*`: annualising E0002's
  March gives 483,150.24 against an actual year of 276,202.12, a 74.9% overstatement, and
  that is one row of real fixture data.
- **K9** suppresses below three paid periods and always carries the window
  ("over 9 paid periods").
- **K12** is labelled "observed, this employee, this range" and never names a country, a
  rate or a threshold.
- **K13/K14** suppress to `employer_costs_not_mapped` when no component in range
  classifies to an employer category — **never 0** — and K14 additionally suppresses when
  `uncategorised` is non-zero in range, because one mapped employer line plus one unmapped
  reads as a low on-cost rate rather than as missing data.
- **K11** reports quantity components under their own register names. `absence_days` and
  `other_quantity` both hold counts, and a register with an "Overtime Hours" column puts
  hours in `other_quantity` — so nothing infers days from a category.

Deferred, with the reason recorded in code: K17-K25 (N), and K26-K29 (blocked — no
per-employee forecast in the engine, no per-employee budget, no contracted hours, no
statutory rate table).

### C7. Change log, and package wiring

**Files:** `packages/payroll-core/src/employee/changelog.ts`,
`packages/payroll-core/src/employee/index.ts`,
`packages/payroll-core/src/index.ts`

Derived, never stored. One entry per detected change between consecutive **covered**
slots: base rate, allowance, new component, removed component, department, dimension,
name, FTE, currency, cadence, first appearance, last appearance. A change is
`|delta| > q`.

An entry across a `missing` slot reads "between Mar and May (Apr not uploaded)". Every
entry states **what moved**, never why — Clarivo holds no reason codes, so "promotion",
"merit review" and "cost-of-living adjustment" are not in the vocabulary at all.

§8.1's July event is the test case, and it is why a rate change is named per component:
base +4.20%, housing +4.20%, transport and meal flat, recurring pay +4.06%. The run-rate
percentage is not the increase percentage.

Then `export * from "./employee"` in the package index, beside `./annual`.

**Verify (C4-C7):** unit tests per module, plus `pnpm typecheck` — which is the only thing
that validates a `packages/*` module at all, since none of them has a build step.

---

## 5. Phase D — the query layer (5 steps)

### D0. The shape, and why there is no `snaps` CTE

Decision 5 bans `DISTINCT ON` from this feature. `annual.ts`'s `validPeriodsCte` contains
two of them: one on `payroll_periods` for re-uploads, one on `employee_snapshots` for
duplicate employee rows. The second is the one that must go. The first could stay — it is
the `dedupePeriods` rule, which §7.1 requires — but it also relies on the
`created_at DESC` tie-break, which works for periods (they genuinely have different insert
times) and is the very mechanism that cannot work for rows.

**Decision: no `DISTINCT ON` at all. De-duplicate periods in TypeScript with
`dedupePeriods()` and pass the surviving ids into the data query.** This is better than a
narrow exception:

- `dedupePeriods` is the function the engine already owns, so SQL and the engine cannot
  disagree about which upload won.
- `countSupersededUploads()` then gives §7.1's "1 superseded upload ignored" count exactly,
  with no second implementation.
- The data query becomes `WHERE payroll_period_id IN (<explicit binds>)`, which is served
  by B1's index and reads obviously.
- It removes `created_at` from SQL entirely, which is the honest position given the
  tie-break is broken.

Two traps in that query. Build the id list with
`sql.join(ids.map((i) => sql`${i}`), sql`, `)` rather than passing a JS array, so each id
is its own bind parameter and no array-type inference is involved. And **guard the empty
case**: `IN ()` is a Postgres syntax error, so a scope with no surviving periods returns
an empty result before any SQL runs.

### D1. Share the row-parsing helpers

**Files:** `apps/web/src/server/parse-rows.ts`, `apps/web/src/server/routers/annual.ts`

`Numeric`, `IntLike`, `toIsoDate` and `toIsoTimestamp` are private to `annual.ts` today.
Every query in D3/D4 needs all four, for the reason `parse-rows.ts` exists in the first
place: PGlite and neon-http both return `numeric`, `date` and `timestamp` as **strings**,
deliberately, because a driver handing back JS numbers and Dates hides exactly the C1
class of bug.

Move the four into `parse-rows.ts` and re-export from `annual.ts` so nothing else changes.
A second copy is a second thing to keep in step with the alias-and-parse rule, which is
the argument `parse-rows.ts` and `server/categories.ts` were both extracted on.

`toIsoDate` matters specifically: Postgres `date` arrives as `"YYYY-MM-DD"` and must be
kept verbatim. `new Date("2026-10-31")` in a negative-offset browser is 30 October, and
`assignSlot` then places the period in the wrong month.

### D2. Scope resolution — round trip 1

**File:** `apps/web/src/server/employee-file/scope.ts` (new)

One function, shared by both procedures, mirroring `annual.ts`'s setup batch. One
`ctx.db.batch([...])` of three queries:

1. The company row: `settings` (for `fiscalStartMonth` and the anomaly tolerances) and
   `currency_code`.
2. Every ready period for the company with `period_end` in a **three** calendar-year
   window (`year-1` to `year+2`), projecting `id, period_type, period_start, period_end,
   currency_code, created_at, total_gross, total_net, control_total_gross,
   control_total_net`. Three years because §5.1's "previous year" range needs `year-1`, and
   a fiscal year spans two calendar years. The control totals ride along for R5 and R3 at
   zero extra cost.
3. The company's saved `component_categories`.

The fiscal start month arrives **in this same batch**, so it cannot be used to build this
query's SQL — the window is deliberately wide and the fiscal filter is applied in
TypeScript with `fiscalYearOf`, exactly as `annual.ts` does and for the same reason.

Everything else is then pure:

- `normaliseFiscalStartMonth` -> `fiscalYearInterval` / `fiscalYearLabel`
- cadences and currencies ordered by frequency, so index 0 is the most frequent; the
  company's own currency wins when the year has data in it
- **the default year** = `fiscalYearOf(latest ready period's period_end, fsm)`, not the
  fiscal year containing today (§2.4). If the newest upload is Oct 2026 and today is Feb
  2027, defaulting to today's fiscal year opens an empty file on a company with eighteen
  months of data. When the default is not the fiscal year containing today, the header
  says so: `FY2026/27 · latest data Oct 2026`
- `dedupePeriods` + `countSupersededUploads`
- `generateExpectedPeriods(cadence, year, firstCoveredStart, fsm)` -> R, **with the
  anchor** (F7)
- `assignSlot` per surviving period -> C, with off-cycle runs merged per slot

Returns `{ scopeOptions, periodType, currency, fiscalYear, label, expected, coveredSlots,
periodIdsInRange, supersededCount, fiscalStartMonth, savedCategories, tolerances,
decimals, periodTotals }`.

Note what is **not** here: no fallback to `period_component_totals`. It has no employee
dimension, so there is no second path. Put a comment saying so — the annual feature's
dual-path rule is two files away and invites copying.

### D3. `employeeFile.list` — round trip 2

**File:** `apps/web/src/server/routers/employee-file.ts` (new)

```ts
list: payDetailProcedure.input(z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  range: z.enum(["ytd", "full_year", "previous_year", "slot"]).default("ytd"),
  slotIndex: z.number().int().positive().optional(),
  periodType: PeriodTypeSchema.optional(),
  currency: CurrencyCodeSchema.optional(),
  scope: z.enum(["paid_in_range", "currently_employed", "everyone_on_record"]).default("paid_in_range"),
  q: z.string().max(200).optional(),
  departments: z.array(z.string().max(200)).max(50).optional(),
  dimensions: z.record(z.string().max(100), z.array(z.string().max(200)).max(50)).optional(),
  hasFlag: z.enum(["critical", "duplicate"]).optional(),
  sort: z.enum(["flags", "name", "range_gross", "latest_gross", "paid_periods"]).default("flags"),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}))
```

One `ctx.db.batch([...])` of six queries, all against `employee_snapshots` joined to the
surviving period ids:

1. **The page.** Grouped by `employee_external_id`, ordered, limited, offset. Columns, all
   SQL-expressible: latest name via
   `(array_agg(employee_name ORDER BY p.period_end DESC, p.created_at DESC))[1]` (**not**
   `MAX` — F10); latest department the same way; `COUNT(DISTINCT p.id)` paid periods;
   `SUM(gross_salary)` range gross; latest gross and latest net via the same `array_agg`
   trick on `p.period_end`; last paid `period_end` (the slot label is resolved in
   TypeScript by `assignSlot`, never by comparing end dates); `COUNT(*) FILTER (WHERE
   net_salary > gross_salary)` and `FILTER (WHERE net_salary < 0)` as the critical flag
   counts; and a duplicate marker from
   `COUNT(*) > COUNT(DISTINCT p.id)` per employee, which is exactly "more than one row in
   some period".
2. **The count**, same predicates.
3. **Departments in scope**: `DISTINCT COALESCE(department, 'Unassigned')`.
4. **Dimension keys**: `SELECT DISTINCT k FROM ... CROSS JOIN LATERAL jsonb_object_keys(dimensions) k`.
5. **Dimension values per key**, with a per-key `LIMIT` and a flag when truncated, so a
   high-cardinality key degrades to free text instead of rendering a 4,000-item picker.
   A key with zero values gets **no picker at all** (§3.3) — not an empty one.
6. **The access-log insert** (D5).

Every column aliased as `"camelCase"` in the SQL, every result through `parseRows` with a
zod schema, never `as unknown as`. No value interpolated inside a SQL comment: drizzle
turns every `${}` into a bind parameter and Postgres strips comments before planning, so
the parameter is sent and never referenced and the query dies with
`42P18 could not determine data type of parameter`.

Tenancy: `employee_snapshots` carries no `companyId`. Scoping is the join to
`payroll_periods` — and in this design the period ids were already resolved under
`company_id = ctx.companyId` in D2, so the id list itself is the tenant boundary. Say that
in a comment: it is correct but it is not obvious, and "forgetting to scope by companyId is
a cross-tenant data leak, not just a bug".

Free text searches **every** name the id has carried in range, not only the latest, with
`ILIKE` — `employees.search` uses `like` today, so `alice` does not match `Alice Johnson`
(A2 fixes that procedure too). Department matching is "in **any** slot in range", and the
UI must state that rule, or transfers are hidden.

Scope semantics: `paid_in_range` = `P(e)` non-empty (default); `currently_employed` = the
employee appears in the latest covered slot in scope and `termination_date` is null or
later than that slot's end; `everyone_on_record` = a row in any ready period in scope.
Under `currently_employed` the footer states the excluded count — "14 people paid in
FY2026 are not currently employed" — because a filter that drops rows without saying how
many is how a payroll total gets signed off short.

### D4. `employeeFile.get` — one procedure, not five

**File:** `apps/web/src/server/routers/employee-file.ts`

```ts
get: payDetailProcedure.input(z.object({
  externalId: z.string().min(1).max(100),
  year: z.number().int().min(2000).max(2100).optional(),
  range: z.enum(["ytd", "full_year", "previous_year", "slot"]).default("ytd"),
  slotIndex: z.number().int().positive().optional(),
  periodType: PeriodTypeSchema.optional(),
  currency: CurrencyCodeSchema.optional(),
}))
```

**One procedure returning the whole assembled file**, not one per section. Each procedure
costs its own middleware lookup plus its own scope batch; five sections would be fifteen
round trips for one page. The annual router made this mistake once (about thirteen
sequential requests per view) and the fix was the same shape.

Round trip 2 is one `ctx.db.batch([...])` of three:

1. **Every snapshot row for this employee across the surviving period ids** — not
   de-duplicated, every row, including duplicates. Projects `payroll_period_id, id,
   employee_name, department, gross_salary, net_salary, currency_code, components,
   hire_date, termination_date, fte, dimensions`. This is the query B1's index exists for.
2. **An existence probe**: does this id have a row in *any* ready period for the company,
   outside this range? That answers F6 — NOT_FOUND only when the id is unknown to the
   company; otherwise an empty file naming the ranges that do have data.
3. **The access-log insert** (D5).

Then it is all pure: `buildEmployeeSlots` -> `totals` -> `flags` -> `presence` -> `kpis` ->
`changelog`, and the result is returned whole.

**One currency block per currency** when the employee has rows in more than one (§7.9).
Each block has its own `minorUnits`, so a KWD block keeps three decimals and a JPY block
none, and there is **no combined figure anywhere** — no FX, no "equivalent". Same for a
cadence change (§7.10): one scope per cadence, never merged, because `assignSlot` run with
the wrong cadence collapses two semi-monthly slots into one month.

**R3 is reported, not hidden.** `payroll_periods.total_gross` comes from D2. Where the sum
of employee grosses differs from it, the file says which cause applies — duplicate rows
(§7.3) or a non-deduped re-upload (§7.1). And R6: `period_component_totals` applies
`DISTINCT ON (employee_external_id)` while this feature sums every row, so with duplicates
present the two **differ by the dropped rows**. The Employee File is authoritative for the
register tie-out, and the gap is displayed rather than reconciled away.

**No prior-year query in v1.** K22 (year on year) is N and is deferred, which keeps this
batch at three.

### D5. The access-log write, and registration

**Files:** `apps/web/src/server/routers/employee-file.ts`,
`apps/web/src/server/routers/index.ts`

**Decision: the insert rides in the same `db.batch` as the data queries.** It therefore
costs **zero** extra round trips, and it cannot be skipped by an early return or forgotten
on a new code path, because it is a member of the array the procedure is built from.

Two consequences, both stated deliberately:

- It logs the **attempt**, not the successful render. For an id the company does not have,
  the queries still succeed and return nothing, so the row survives — and an attempted
  read of an unknown id is precisely what an access review wants to see. Logging only
  successes would hide probing.
- `db.batch` on neon-http is one transaction, so an error in a later query rolls the log
  row back. Every other member of the batch is a read, so that can only happen on a bug,
  not on a data condition. Noted rather than engineered around; the alternative is a
  separate awaited insert, which takes the budget from 3 to 4 on the most-viewed screen in
  the feature.

`row_count` is backfilled on the response, not in SQL — the insert records the request;
the count of rows returned is written as `0` and the honest reading is "a read of this
scope happened". If a precise count matters later, make it a second table or a follow-up
update; do not spend a round trip on it now.

Register `employeeFile: employeeFileRouter` in the app router.

**Verify (D1-D5):** `apps/web/test/employee-file-router.test.ts` — see F2 in Phase F.

### Round-trip budgets

| Route | Requests | What they are |
|---|---|---|
| `employeeFile.list` | **3** | middleware user lookup; D2 scope batch; D3 list batch (6 queries + the log insert) |
| `employeeFile.get` | **3** | middleware user lookup; D2 scope batch; D4 data batch (3 queries incl. the log insert) |

Same budget as `getSummary`, and asserted the same way. Note that `annual-router.test.ts`
asserts `<= 3`, *including* the middleware lookup — CLAUDE.md's "two batched round trips"
counts only the batches. Use the test's convention, not the prose's, or the number will
look wrong.

No memo in v1. `getSummary`'s 30-second per-instance memo exists because `getSummary`,
`getInsights` and `exportWorkbook` all resolve the same summary; here the list and the file
are different pages with different inputs, so a memo would add a cache-invalidation
surface and save nothing. Revisit if the export lands.

---

## 6. Phase E — UI (6 steps)

### E1. Routes

**Files:** `apps/web/src/app/(main)/employees/page.tsx`, `loading.tsx`, `error.tsx`,
`apps/web/src/app/(main)/employees/[externalId]/page.tsx`, `loading.tsx`, `error.tsx`

Both under `(main)`. Both carry `export const dynamic = "force-dynamic"` even though the
layout already sets it — belt and braces, because a statically rendered protected page has
already leaked a cached auth response in this product.

All six files, matching `annual-salaries/`, which has `page`, `loading` and `error`. A
missing `error.tsx` means a thrown FORBIDDEN surfaces as the root error boundary.

Server components, following the annual page's shape: `auth()`, redirect to `/login` only
when genuinely not signed in, `ensureUser` in a try/catch with an `AccountUnavailable`-style
panel rather than a redirect. (A redirect to a public route gets honoured by Clerk's
`afterSignInUrl` and presents as a silent bounce to the dashboard, with the reason lost —
the bug `AccountUnavailable` was written to fix.)

Then a **server-side role check**: a viewer who navigates directly to `/employees` gets a
clean "not available for your role" panel, not a tRPC error toast. This is the real
control; A4's nav gating is cosmetic.

The URL key is the **external id**, never a snapshot UUID — a snapshot id changes every
period, so a bookmark would rot monthly. `encodeURIComponent` in, `decodeURIComponent`
out: ids like `EMP/0012` and `0012 A` exist in real registers, and an unencoded slash
silently becomes a second path segment, which also breaks the sidebar's
`"/" + pathname.split("/")[1]` active-state match.

### E2. The list shell and URL state

**Files:** `apps/web/src/components/employee-file/employee-list.tsx` (client),
`employee-list-footer.tsx`

The parent owns the URL. Range and year go in the query string (`?year=2026&range=ytd`) so
a file can be linked and reopened the same way — and so the selector stays where the user
put it, which is the bug `docs/Annual_Dashboard_Spec.md` was written to fix. Follow
`year-selector.tsx`'s contract: the child takes an `onChange` and never calls
`router.replace` itself, because two components navigating at once means the hardcoded one
clobbers the one that preserved the rest of the query string.

Under the list title, one line of text: **a manager sees every employee in the company.**
Clarivo stores no reporting line, so "manager" cannot mean "my team", and the role name
implies a scoping that does not exist. One sentence is cheaper than a support ticket.

The footer carries the coverage line and, under `currently_employed`, the excluded count.

### E3. Filters

**File:** `apps/web/src/components/employee-file/employee-list-filters.tsx`

Scope as a **visible segmented control**, never a hidden default. Range selector. Free text
through the existing `use-debounce` hook. Department multi-select, with its "matches if the
employee was in that department in any slot in range" rule stated in the UI.

Dimension pickers are **discovered, not hardcoded**: rendered from D3's query 4/5 output,
one picker per key that has at least one value, with "(not set)" offered as a value —
meaningful because the upload writes a blank cell as an absent key rather than `""`
(`processor.ts:190`), so "has no location" is a real, queryable state. A key with no values
gets no picker. There is no Location filter unless that company has a Location column.

Currency and cadence are a **scope selector**, not a filter: changing one recomputes
everything, and values are never mixed.

### E4. Columns

**Files:** `apps/web/src/components/employee-file/employee-columns.tsx`,
`employee-column-picker.tsx`, `apps/web/src/hooks/use-employee-columns.ts`

Columns 1-9 default-visible in the spec's order. Columns 10-13 behind the picker.

Per F1: a new picker with its own `ColumnKey` union, persisted in `localStorage` under
`drift_employee_columns`. Not the existing component (its `mode` dimension is meaningless
here) and not `saved_views` (dead schema).

Two rules that are easy to get wrong and expensive to find. **Money columns sort on the
parsed number, never the formatted string** — `"USD 9.00"` sorts above `"USD 10.00"` as
text. And the FTE column renders **only** when some row in scope has a non-null `fte`,
because an always-blank column is worse than no column; same rule for the dimension
columns, capped per F9.

### E5. The file page sections

**Files:** `apps/web/src/components/employee-file/employee-file-header.tsx`,
`employee-summary-band.tsx`, `employee-reconciliation.tsx`, `employee-period-table.tsx`,
`employee-component-matrix.tsx`, `employee-change-log.tsx`, `employee-exceptions.tsx`

Top to bottom in the spec's priority order — a payroll admin opening one employee is
usually mid-query with the register open beside them.

Money is formatted **only** through `components/annual/annual-utils.ts`: `formatMoney`,
`formatCompact`, `formatAxisMoney`, `formatDays`, `formatPct`. They all use
`currencyDisplay: "code"`, so it is always `USD 1,234.56` and never `$1,234.56`, and
mixing the two in one card is the bug they exist to prevent. `formatCompact` has the
billions step an LBP block needs; `formatDays` rounds to one decimal because absence days
are summed from floats and print as `44.540000000000006` raw. No component in this folder
calls `Intl` directly.

Specifics worth pinning:

- **Header:** `hire_date`, `termination_date` and `fte` appear only when mapped. When not,
  the header says `Hire date not mapped` **once**, rather than an em dash that reads like
  "no hire date on file".
- **Summary band:** each figure carries its scope label from `SCOPE_LABELS`. Employer cost
  reads `Employer costs not mapped` when nothing classifies there — **never 0**.
- **Reconciliation strip:** the four checks per slot, with `earnBal` shown as its own
  labelled line whenever non-zero. `samples/payroll_july_2026.csv` breaches the earnings
  identity for E001 (300.00), E005 (20.00) and E017 (200.00) — 520.00 in total — and
  Clarivo ingested it, dashboarded it and wrote a narrative about it without a word. This
  strip is where that becomes visible per person.
- **Period table:** one row per slot in R, in calendar order, never only the slots with
  data. Slot labels come from `ExpectedSlot.label` through `shortPeriodLabel`, never a raw
  ISO date. Gross and net are **blank** for `missing` and `not_paid`, with the reason on
  hover — the two are different facts and must render differently. The delta column is
  against the previous **covered** slot, and shows an em dash with a "spans a gap" mark
  when the previous slot is `missing`.
- **Duplicate slot wording**, verbatim from §7.3, because the ambiguity has to be stated
  rather than implied: "2 rows for this employee in this period. The total shown is the
  sum, which matches the register. If the second row is a duplicated export, both this
  figure and the period total are overstated."
- **Component matrix:** rows are component keys **as the register names them**, grouped by
  category with `CATEGORY_LABELS` headers, uncategorised last under "Not categorised" with
  a link to the category manager. Blank for absent; `0.00` only when the register really
  says zero. `classifyComponentWithReason(key).rule` on hover, as the category manager
  already does. This is the cheapest thing in the feature to build and the artefact a
  payroll admin actually wants.
- **No "all clear" badge.** On a file where half the slots are `missing`, "all clear" is
  false. The coverage line is the honest label.

### E6. The chart

**File:** `apps/web/src/components/employee-file/employee-period-chart.tsx`

A stacked column chart of the period table's own numbers by category — **one computation
rendered twice**, never two (R4). Pass the same array to the table and the chart.

Wrapped in `ChartFrame` from `components/annual/chart-frame.tsx`, which supplies
`role="img"`, a label and a visually hidden data table carrying the same figures. Recharts
emits an SVG with no semantics of its own, so without the frame a screen reader sees an
empty box.

Colours set with explicit `fill`/`stroke` props, **never** a Tailwind `className` —
Recharts does not apply classes to legend marks, so they render black and vanish in dark
mode. Follow `annual-periods-chart.tsx`, including its `url(#hatch-missing)` pattern for
gaps.

**Missing slots break the series. They are never plotted as zero.**

---

## 7. Phase F — tests (5 steps)

### F1. Engine tests

**Files:** `packages/payroll-core/src/employee/*.test.ts`

Pure, hand-built inputs, no database, following `annual/test-utils.ts` and
`annual/qa-fixtures.test.ts`. This is where most of the correctness lives, because it is
where the arithmetic lives, and it runs in milliseconds.

Covers: §8.1's E0002 worked example to the cent; §8.2's denominator; the four slot kinds;
duplicate-sum-and-exclude; dedupe and the superseded count; presence spans; final
settlement and possible proration; the change log; the `earnBal` vs
`reconcileRegister().totals.unplaced` cross-check; and `Kpi` suppression for every reason
in the union.

### F2. Router tests against PGlite

**File:** `apps/web/test/employee-file-router.test.ts` (new)

Seeded like `annual-router.test.ts`: two companies, three roles each, `createCaller` with
`{ userId, db }`.

- **Role matrix:** admin ok, manager ok, viewer FORBIDDEN, on both procedures.
- **Tenancy:** another company's `externalId` answers NOT_FOUND, never FORBIDDEN.
- **Round-trip budget:** `expect(ctx.roundTrips()).toBeLessThanOrEqual(3)` for each
  procedure, after `ctx.resetRoundTrips()`. This is the test that makes an added
  sequential `await` fail instead of quietly costing a request, and it is the direct
  equivalent of `annual-router.test.ts`'s "resolves a full summary in at most 3 HTTP
  requests".
- **String-typed values:** every `numeric`, `date` and `timestamp` comes back as a string
  from `pglite-neon.ts` deliberately, as neon-http does. The zod schemas must accept
  `z.union([z.string(), z.number()]).transform(Number)` and dates must stay
  `"YYYY-MM-DD"`. A test asserting the parsed result is a `number` and the date is
  unshifted is what catches a reintroduced `as unknown as`.
- **Access log:** a row exists after a successful read **and** after a read that returns
  nothing.
- **Duplicate and re-upload paths** against real inserts, because both depend on what
  `processUpload` actually writes: identical `created_at` for every row of one insert, and
  `total_gross` as the sum of all rows.

### F3. Migration and index tests

**File:** `apps/web/test/harness.test.ts` (extended)

Covered by B3: the EXPLAIN assertion for the new index, plus the existing triple-apply
idempotency test and the journal/file-list test, which pick `0011` up automatically.

### F4. Policy tests

**Files:** `apps/web/test/tenant-scoping.test.ts`,
`apps/web/test/annual-router.test.ts` (both edited)

Covered by A3. These are **changes to existing assertions**, not additions, and they are
the only mechanical record of the policy decision.

### F5. UI logic tests

**File:** `apps/web/test/employee-file-ui.test.ts` (new)

Following `annual-ui.test.ts`, which tests the parts that do not need a browser — this
repo has no Playwright baselines and no browsers, so snapshot and axe checks are out.

Covers: the chart series builder never emits 0 for a `missing` slot; money sort
comparators run on parsed numbers; no formatter output contains `$`; the FTE and dimension
columns are absent when unmapped; `NAV_ITEMS` icons are all keys of `iconMap` and the
Employee File entry is index 0 with `roles` set (A4).

---

## 8. Fixtures — which of §12.2's seventeen are v1

§12.2 says the fixtures are "a precondition for the feature, not a follow-up", and §12.1
is right that the current samples cover roughly a third of the traps. But seventeen
seeded CSV generators is a larger body of work than the feature, and most of them test the
*engine*, not the Employee File's own layer.

**So: nine for v1, eight deferred, and most of the nine as engine fixtures rather than
CSVs.** The split is by one test: does this fixture exercise behaviour that is new in this
feature and not already covered elsewhere?

### v1 — required (9)

| Fixture | Form | Why it cannot wait |
|---|---|---|
| `gap` | engine | `missing` vs `not_paid` is the single most important modelling decision in the feature (§2.3) and every denominator depends on it |
| `duplicate-row` | **CSV, through the real upload** | Decision 5's whole behaviour. Must go through `processUpload` because the identical-`created_at` fact and `total_gross` as the sum of all rows are properties of the writer, not of the engine |
| `reupload` | **CSV, through the real upload** | Same reason: `processUpload` always inserts, nothing deletes, both are `ready`. An engine fixture would assume the thing under test |
| `leaver-settlement` | engine | §7.6 drives K6 and every average; a wrong final slot reads as a 300% rise |
| `joiner-prorated` | engine | §7.7, the mirror image, and the "possibly" wording |
| `rehire` | engine | §7.5 presence spans, and the `not_paid` vs `missing` distinction again from the other side |
| `transfer` | engine | §7.8; attributing a year to the latest department moves two departments' totals after an upload containing no new money |
| `impossible` | engine | §7.16 and acceptance assertion 10 — the only two `critical` flags, and the ones that must be visible from the list |
| `mixed-sign` | engine | §7.15's suppression. Untested suppression logic is how a wrong rate ships looking right |

### Deferred, with the reason (8)

| Fixture | Why it can follow |
|---|---|
| `monthly-usd` (dimensions, FTE, hire/termination dates) | Ships **with** columns 11-13, K18-K20 and the dimension filters, which are all N and all deferred together (F9). Building the fixture before the feature tests nothing |
| `kwd-semimonthly` | `assignSlot` on `bi_monthly`, `minorUnits` and three-decimal survival are already covered by `annual/qa-fixtures.test.ts` and `money-precision.test.ts`. The marginal risk this feature adds is in its own slot-kind layer, which `gap` and `rehire` cover. Add it when the first three-decimal customer appears |
| `lbp-weekly` | Same: `formatCompact`'s billions step and generated 52/53 counts are existing coverage. F7's anchor bug is the real weekly risk and is a one-line unit test, not a fixture |
| `id-change` | §7.4 is in the cut list above the component matrix (F8). Fixture follows the feature |
| `reused-id` | §7.12's second half; detection only, no total changes either way, so a wrong answer is cosmetic rather than arithmetic |
| `renamed-column` | §7.13; same — a note on two rows, no figure moves. K1 is unchanged by construction |
| `retro` | §7.11's arithmetic is already asserted by the E0002 worked example in F1, which contains the real one-offs |
| `multilingual` | Tests `classify.ts`, which has its own test file and its own vocabulary tests. Nothing in this feature changes the classifier |

All nine v1 fixtures are anonymised and synthetic. The two CSVs follow the existing
generator pattern in `packages/db/src/fixtures/annual2025.ts` — seeded, reproducible,
byte-identical on a re-run, with a README stating what the engine should make of them. Add
them under `packages/db/src/fixtures/employeeFile/` with a script entry beside
`samples:annual-2025`.

**One warning about the two CSV fixtures.** `samples/payroll_june_2026.csv` and
`payroll_july_2026.csv` are the only existing CSVs usable as upload fixtures, and July
breaches the earnings identity by 520.00 — which means **the reconciliation gate refuses
it** (`reconciliation-gate.test.ts`, and `provision-and-ingest.test.ts` had to correct its
own sheet for exactly this reason). A duplicate-row or re-upload fixture must either
reconcile or be ingested by a path that does not run the gate. Decide which when writing
it; the gate refusing the fixture for an unrelated reason is a confusing afternoon.

### §12.3 acceptance assertions, mapped to tests

| # | Assertion | Discharged by |
|---|---|---|
| 1 | Sum of slot gross = register gross per employee, to the minor unit | F1, E0002 worked example; F2 against real inserts |
| 2 | Sum over employees = `payroll_periods.total_gross`, except in `duplicate-row` and `reupload` where the difference is reported | F2 (both CSV fixtures); D4's R3 output asserted |
| 3 | `gap`: 12 slots, 3 `missing`, K5 denominator <= 9, no zero plotted, coverage names Apr/Nov/Dec | F1 (`gap`) for the figures; F5 for the chart series |
| 4 | `rehire`: two spans, no single tenure, `Rehired` badge, `not_paid` counted in covered and excluded from paid | F1 (`rehire`) |
| 5 | `transfer`: departments split 6/6 and sum to K1 | F1 (`transfer`) |
| 6 | `duplicate-row`: slot is `duplicate`, both rows listed, total is the sum, K5-K8 exclude it | F1 + F2 (CSV) |
| 7 | `reupload`: K1 identical with and without the superseded upload; superseded count 1 | F2 (CSV), via `dedupePeriods` + `countSupersededUploads` |
| 8 | `kwd-semimonthly`: 0.001 detected, 24 slots, three decimals everywhere | **Partially deferred.** The q-sensitivity and minor-unit halves are unit-tested in F1 with a KWD currency; the 24-slot fixture follows |
| 9 | `leaver-settlement`: K6 is pre-settlement recurring; final slot labelled and excluded | F1 (`leaver-settlement`) |
| 10 | `impossible`: two `critical` flags, both visible in the list without opening a file | F1 for the detection; F2 asserting `list` returns the critical counts (this is the assertion that forces F5's SQL-side flags, and the reason the split in F5 is safe) |
| 11 | No screen, export or narrative combines two currency codes in one total | F1 (per-currency blocks, no combined figure in the type) + F5 |
| 12 | Every AI sentence names a real component, no cause, no country, no statutory rate | **Vacuous in v1** — no narrative ships (F11) |

---

## 9. Phase G — documentation (3 steps)

### G1. CLAUDE.md

**File:** `CLAUDE.md`

Beyond A5's role-table edits (which ship in A1's commit), seven additions:

1. **Project section:** the Employee File as a third feature on the same data model —
   "a read-only per-person payroll record assembled across periods, keyed on
   `employee_snapshots.employee_external_id`".
2. **Request flow block:** add a line —
   `employee file -> tRPC employeeFile.list / employeeFile.get -> packages/payroll-core/src/employee/* -> components/employee-file/*`.
3. **A new "Duplicate employee rows: three answers" note**, recording the inconsistency
   the owner asked to be documented rather than fixed, with pointers: `comparator.ts:35`
   refuses with `DuplicateEmployeeIdsError`; `annual.ts:162` and
   `packages/db/src/aggregates/periodComponentTotals.ts:29` keep one row via
   `DISTINCT ON ... created_at DESC`; the Employee File sums all rows and flags the slot.
   And the fact that makes the middle answer indefensible: `processUpload` inserts every
   row of a period in one statement, so `created_at` is identical across them and the
   tie-break picks arbitrarily. State that the Employee File is authoritative for the
   register tie-out and that the gap against the aggregates is displayed, not hidden.
4. **Per-period aggregates section:** one line that `period_component_totals` has no
   employee dimension, so the Employee File reads `employee_snapshots` exclusively and has
   **no** dual path to keep numerically identical. The annual fallback rule is two
   paragraphs away and invites copying.
5. **Round-trip section:** the Employee File's budget (3 each) and the test that holds it.
6. **One line in the slot-model section:** the Employee File's `kind` is four-valued but a
   *different* four from the annual `PeriodKind` — no `estimated`, no `forecast`, because
   estimating one person's missing month invents a payment to an individual.
7. **Two corrections of fact** the next reader will otherwise trip over, both found while
   planning: `saved_views` is dead schema and column preferences live in `localStorage`
   (`use-saved-views.ts`); and `comparisons.getById` is a `memberProcedure` returning
   per-employee pay to viewers, which is the widest employee-level surface in the product
   regardless of what the role table says.

Also add the plan to the docs list the way `ANNUAL_REVIEW_45c9f13.md` is listed, so the
next person changing this code finds the finding that produced the current shape.

### G2. Migrations README

**File:** `packages/db/src/migrations/README.md`

Add a short section for `0011` under "Large tables: build indexes by hand", giving the
`CREATE INDEX CONCURRENTLY IF NOT EXISTS` form for
`employee_snapshots_employee_period_idx`. The existing section only names the `0006`
index, and the next person to hit a lock on `employee_snapshots` will look here.

### G3. The samples README

**File:** `samples/README.md`

What the two new CSV fixtures contain and what the engine should make of them, matching
the existing convention. Include the gate warning from §8.

---

## 10. Sequencing, parallelism and the cut list

### What can run in parallel

Three tracks, independent of each other:

- **Track 1 (Phase A):** access, policy, nav. Self-contained. One commit for A1+A2+A3+A5.
- **Track 2 (Phase B):** the migration. Touches only `packages/db` and one test.
- **Track 3 (Phase C):** the engine. Touches only `packages/payroll-core`. Needs nothing
  from the other two and is testable in isolation — this is the largest and riskiest
  track, so starting it first is right.

### What must be serial

```
A1  ->  D3/D4            (the procedures need the gate to exist)
B1  ->  F3               (the EXPLAIN test needs the index)
B2  ->  D5               (the log insert needs the table)
C   ->  D4               (the router assembles engine output)
D1  ->  D3/D4            (shared row parsers)
D2  ->  D3/D4            (shared scope resolution)
D   ->  E2-E6            (the UI needs the procedure shapes)
E1  ->  E2               (routes before the components they host)
```

F1 runs alongside C, test-first where it is cheap to. F2 cannot start before D5. G can be
written any time and should land with the commit it describes, not after.

### Cut list, in the order I would cut

1. **Export (§4.8).** Already N, and F3 shows the `export_history` reuse is not free.
2. **The change log (§4.6).** The spec marks it **E** and I am recommending against that.
   It is the most code per unit of value in the feature — twelve entry types, each with
   its own detection and wording — and it is **fully derivable later** from data already
   on the page. The period table plus the component matrix already answer "when did this
   change and by how much"; the change log only presents it more conveniently. Cut it
   before cutting anything that affects a figure.
3. **§7.4 id-change and §7.12 reused-id detection.** Detection only; no total moves either
   way (F8). The status badge degrades from `Left Jun 2026 (id may have changed)` to
   `Left Jun 2026`, which is a smaller loss than it reads.
4. **The dimension filters and columns 10-13.** No register in the product carries a
   dimension, so this ships untested against real data (F9).
5. **§7.13 possible-rename detection.** Same class as 3.
6. **The component matrix (§4.5).** Cut last of the optional things, because it is the
   cheapest thing in the feature to build and the artefact a payroll admin actually asks
   for. Cutting it is a bad trade; it is on the list only because it is cuttable.

**Never cut:** the four slot kinds, the coverage line, the two balancing lines, the
reconciliation strip, K1-K4, the duplicate sum-and-flag, and the access log. Those are
B1-B3 of the spec plus the control that makes manager access defensible. A version without
them is not a smaller Employee File, it is a misleading one.

---

## 11. Risk

### 1. The list view's flag column, filter and sort — the biggest risk

Highest-probability failure in the plan, and the one most likely to be discovered late,
because it works beautifully on `samples/2025` (180 employees) and degrades on a real
customer. Default-sorting the whole company by worst flag severity requires computing
every employee's every slot's category totals before pagination, which means pulling
24,000 jsonb rows into Node per list view at 2,000 employees.

**Mitigation in the plan:** F5's split — critical flags and the duplicate marker in SQL
for everyone, identity breaches on the file page only, default sort "critical first then
name", header stating what it counts.

**The proper fix, as a follow-up:** a derived `employee_period_flags` table written at
upload beside `rebuildPeriodComponentTotals`, which already runs there and already has the
"write it while the data is hot" argument. That makes the full flag set a cheap indexed
lookup, satisfies §7.16's "a historical breach is visible when it is being investigated"
without a scan, and makes `hasFlag` and the severity sort trivially correct. It costs a
migration, a backfill script and the dual-path burden CLAUDE.md warns about — which is why
it is v2 and not v1, but it should be specced before the first customer above ~500
employees.

### 2. Two screens in one product showing different grosses, by design

Decision 5 makes the Employee File sum duplicate rows while `period_component_totals` and
the annual dashboard keep one. Where duplicates exist these **now disagree on purpose**,
and the difference is the value of the dropped rows. That is the right answer for a
register tie-out and it is a genuine support burden: "the Employee File says 304,049.86
and the dashboard says 299,000".

**Mitigation:** R6 is not optional. The file must name the gap, its cause and its amount,
and say which figure ties to the register. The CLAUDE.md note (G1.3) is the other half —
the next person to see the discrepancy must find the decision rather than "fix" one side.

### 3. The engine phase is large and lands as one lump

Phase C is seven modules and most of the feature's correctness. If it is built
bottom-to-top and integrated at the end, the first real signal arrives late.

**Mitigation:** build C1-C3 and ship a file page that renders *only* the identity header,
the coverage line and the period table against real data before writing C4-C7. That is a
walkable screen, it discharges B2 (the `missing`/`not_paid` distinction) and most of B1
(the balancing lines), and it makes every later module an addition rather than an
integration.

### 4. Role relaxation is irreversible in practice

Once managers can read every salary, taking it back is a visible removal of access.
`launch.securityPoints.accessByRole` is currently `false`, so the marketing claim is not
yet made — do not turn it on in this change, because what ships here is *wider* access
plus a log, not narrower access, and the public sentence should be written against the
final state.

### 5. Things that are more expensive than the spec makes them look

- **The access log is the easy part; access *review* is not.** The table and the write are
  an afternoon. Nobody can read it without a screen, and §1.2's claim — that the log is
  what makes company-wide manager access defensible — is only true once somebody can
  actually review it. Plan a minimal admin-only view, or be honest that the control is
  "the data exists if asked for".
- **`encodeURIComponent` on the external id** sounds trivial and silently breaks the
  sidebar's active-state match and Next's route matching when an id contains a slash.
  Worth a unit test on the two real-world shapes (`EMP/0012`, `0012 A`).
- **Three-year setup window.** D2 fetches three calendar years of period rows to support
  the previous-year range across a fiscal boundary. Slim projection, but it is not the
  one-year window the annual router uses, so the index behaviour is not identical. Check
  the plan with EXPLAIN before assuming.
- **`reconcileRegister`'s pseudo-row trick** is the cleverest reuse in the plan and
  therefore the one most likely to be "simplified" by a later reader into a per-slot call,
  which silently loses all mixed-sign detection. It needs a comment saying why, and the
  test from C4 asserting mixed-sign detection across slots is what keeps it honest.

---

## 12. What I am recommending against, or narrowing

Collected in one place, because each is a deviation from the spec and each needs the
owner's eye.

1. **F5 — narrow the list's Flags column** to SQL-computable flags (critical + duplicate),
   narrow `hasFlag` to the same, and change the default sort to "critical first, then
   name". The spec's version does not fit its own round-trip budget at customer scale.
   §12.3 assertion 10 is still fully discharged.
2. **F11 — no AI narrative in v1.** §9's seven rules are all correct and all cost
   something to honour. Shipping no sentences satisfies assertion 12 trivially and removes
   an entire failure surface from a screen whose job is arithmetic.
3. **Cut the change log (§4.6), which the spec marks E.** Fully derivable later from data
   already on the page; the most code per unit of value in the feature.
4. **Defer eight of the seventeen fixtures** (§8), against the spec's "precondition, not a
   follow-up". Six of the eight test the engine or the classifier, which have their own
   coverage; two ship with the N features they exist for.
5. **Reuse the column-picker *pattern*, not the component**, and do not wire up
   `saved_views` (F1). The spec's premise about where preferences are persisted is wrong.
6. **Defer the export (§4.8)** — the stated reuse is blocked by a `NOT NULL` foreign key
   (F3) and needs its own migration.
7. **Treat the dimension surface as N** and ship it with the `monthly-usd` fixture (F9).
   No register in the product carries a dimension today.
8. **Relax `annual.drillDownEmployees` too**, which the spec does not mention. Leaving it
   admin-only reproduces the same seam one screen over, for the same data.
9. **Do not touch `comparisons.getById`** (F4), even though it is the real hole. Closing it
   removes the Dashboard and Detailed View from viewers, which is a product decision.
   Record it; do not fix it inside this change.
10. **Add `?year=` and `?range=` to the URL but keep the cookie out of it.** The annual
    page reads `drift_annual_year` as a fallback; a second cookie keyed to a different
    feature is one more thing to desynchronise. URL only.

One thing in the spec I judge **unbuildable as written**: §3.4's budget for the list
("one query plus one count") simultaneously with §3.2 col 3's Flags column and the
severity default sort. Not expensive — incompatible. Everything else in the spec is
buildable; the items above are judgements about cost and order, not feasibility.
