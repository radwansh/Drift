# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Drift — multi-tenant SaaS for payroll. Three features share one data model:

- **Comparison** — upload a payroll file per period; the app matches employees across two periods, diffs salary components, flags anomalies, and renders a dashboard with an AI-written narrative.
- **Annual salaries** — calendar- or fiscal-year totals for one company, with a forecast for the rest of the year, department and statutory breakdowns, a budget, and written insights.
- **Employee File** — a read-only per-person payroll record assembled across periods, keyed on `employee_snapshots.employee_external_id`: every slot in the range with its kind, the gross-to-net bridge, the reconciliation tie-outs, the component history and the KPIs. It forecasts nothing and writes nothing, and there is **no AI narrative on it** — see `docs/EMPLOYEE_FILE_PLAN.md`.

pnpm workspaces + Turborepo. Node >= 22, pnpm pinned to 11.8.0 via `packageManager`.

## Commands

Run from the repo root unless noted.

```bash
pnpm install --frozen-lockfile    # lockfile is committed; keep it authoritative
pnpm dev                          # turbo dev -> next dev on apps/web (port 3000)
pnpm build                        # effectively just `next build`; see "No build step" below
pnpm typecheck                    # tsc --noEmit in all 5 packages; currently 0 errors
pnpm lint                         # eslint; currently 0 errors, 17 warnings (all in apps/web)
pnpm test                         # all three test projects
pnpm format                       # prettier --write across the repo
```

Turbo stops the whole run at the first failing task. To see every package's result, add `--continue`. It has to go to turbo, not through the `pnpm run` script — `pnpm typecheck -- --continue` forwards the flag to `tsc`, which fails with `TS5023`:

```bash
pnpm exec turbo typecheck --continue
```

### Tests

Vitest, in three places. The root `vitest.workspace.ts` covers `packages/*`; `apps/web` has its own `vitest.config.ts` and is **not** in that workspace, so `pnpm test` (turbo) is the only command that runs everything.

```bash
pnpm --filter @saas/payroll-core test                                       # one package
pnpm --filter @saas/payroll-core exec vitest run src/annual/forecast.test.ts # single file
pnpm --filter @saas/payroll-core exec vitest run -t "earnings balance"       # by name
pnpm --filter @saas/web exec vitest run test/annual-router.test.ts           # web (needs PGlite)
```

Web tests run against a real Postgres (PGlite, in-process) — see "Testing against a database" below.

### Database

Drizzle + Neon serverless Postgres. Scripts live in `@saas/db`, exposed at the root:

```bash
pnpm db:generate                  # drizzle-kit generate -> packages/db/src/migrations
pnpm db:migrate
pnpm db:seed                      # LOCAL ONLY — see "How a deployed database gets its schema"
pnpm db:backfill-period-totals    # rebuild per-period aggregates for existing history
```

`db:seed` writes three fictional companies. Check what `DATABASE_URL` resolves to before running it: Vercel's Preview and Development environments share one, so pointing at it from a laptop puts demo data in what every preview serves.

## Environment

`.env.example` documents every variable, but **two different files are read depending on the entry point**:

- `apps/web/.env.local` — Next.js (it does not auto-load `.env` from the monorepo root)
- `<repo root>/.env` — `packages/db/src/client.ts` and `drizzle.config.ts`, both hardcoded to `../../.env`

So DB/migration/seed scripts and the web app read different files. `DATABASE_URL` must be set in both for everything to work.

Only `DATABASE_URL` is needed to do real work. Clerk, Anthropic, Stripe, R2, Zoho, Resend and Upstash keys gate their own features, and each degrades rather than failing — see "Optional services degrade" below.

### How a deployed database gets its schema

**Nothing migrates at deploy time.** Vercel runs `next build` and nothing else — there is no build step, start-up hook or middleware that applies a migration. So a deploy can ship code that expects a schema its database does not have, and nothing notices on its own.

- **Production** is migrated deliberately, through `.github/workflows/migrate-production.yml`: `workflow_dispatch` only, gated twice — you type the word `migrate`, and the job names the **existing** `Production` environment so its required reviewer has to approve. The name must match repository settings exactly; naming an environment that does not exist makes GitHub create it on first run with no reviewers, which silently removes the gate. The run applies the migrations and then applies them again, and the second pass failing is a real failure — that is the only check that catches a migration which cannot survive a re-run.
- **Preview** gets its own Neon branch per pull request — created, migrated, and deleted when the pull request closes — through `.github/workflows/migrate-preview.yml`, **once `NEON_API_KEY` and `NEON_PROJECT_ID` are set as repository secrets.** They are not set today, so the workflow's guard step fails and names the missing secret and the command that sets it. It fails loudly on purpose: the first version of that workflow had no guard, never once succeeded, and spent months looking broken rather than unconfigured.

Until those secrets exist, a preview points at whatever `DATABASE_URL` its Vercel environment holds and migrating it is a manual act someone has to remember. Forgetting is what produced `column "control_total_gross" does not exist` on the periods list and the dashboard: the code was at migration 0011 and the database at 0008. That column arrives in `0009_snapshot_dimensions_and_minor_units` and is declared in `packages/db/src/schema/payrollPeriods.ts`, so drizzle names it in **every** generated SELECT against `payroll_periods` — one missing column broke every query on the table, not just the control-total feature.

**Nothing may run `pnpm db:seed` against a deployed database.** Vercel's Preview and Development environments share **one** `DATABASE_URL`, so that script run from a laptop writes into what preview serves — which is why Acme Corp, GlobalTech Ltd and EuroSoft GmbH sat in the shared preview/development database for five months. A preview or production database holds only what a user uploaded, and nothing else, ever. The preview workflow's seeding step is gone, and the rule is enforced in two places rather than only written down:

- **`packages/db/src/seed/index.ts` refuses to run against a non-local host**, printing the host it resolved either way, and `ALLOW_SEED=1` is the only override. This is the one that matters: the five-month incident was a laptop, and "check what `DATABASE_URL` resolves to first" is a rule that depends on remembering.
- **`ci.yml` fails a build when a non-comment line in `.github/workflows/*.yml` contains the literal `db:seed`.** That is narrower than it sounds — it does not scan composite actions under `.github/actions/**`, and it does not catch the script invoked by another name (`tsx src/seed/index.ts`). It closes the copied-step route, not every route.

**When drift happens anyway**, `apps/web/src/server/schema-drift.ts`, wired into `server/trpc.ts`, replaces the driver's sentence with "9 of 12 migrations are applied; … are not". It has to be, because `payroll-periods/page.tsx:285` and `dashboard/page.tsx:130` both render `{error.message}` verbatim — into a `Notice tone="danger"` since the Ink & Signal rebuild, an `AlertDescription` before it — and `app/error.tsx:25` does the same for anything that escapes a page. A raw Postgres string is a user-facing string. `GET /api/schema-status` reports the same applied-versus-expected without waiting for anyone to hit an error — 200 in step, 503 behind — and is the thing to check after a deploy and after a migration. It is listed in `middleware.ts`'s `PUBLIC_ROUTE_PATTERNS`, and must stay there: the matcher catches every path without a dot in it, so an unlisted route answers a 307 to `/sign-in`. It shipped unlisted, which made it useless for the one case it exists for — a database too far behind to serve the sign-in page either. `test/public-routes.test.ts` pins it. Both work out *which* migrations are pending from the **row count** in `drizzle.__drizzle_migrations`, because that table stores a hash and a timestamp and **not** the tag, so there is nothing to join on by name; drizzle applies strictly in journal order and writes one row each, so N rows means the first N entries of `migrations/meta/_journal.json` are applied and the rest are not.

## Architecture

### The comparison pipeline

`@saas/payroll-core` is pure, dependency-free domain logic — no DB, no network, no framework. `runComparison()` in `comparator.ts` composes the stages in order:

```
matcher      group both periods by employee externalId, pair them, collect duplicate ids
classifier   assign status: unchanged | increased | decreased | new | departed
differ       per-component deltas (absolute + percentage)
delta-calculator   null-safe arithmetic on gross/net
anomaly-detector   per-employee flags (info | warning | critical)
aggregator   roll everything into AggregatedSummary for the dashboard
```

Dashboard changes usually mean changing `AggregatedSummary` in `payroll-core/src/types.ts` and the corresponding `compute*` function, not the React components.

### The annual engine

`packages/payroll-core/src/annual/` is the other half of the domain logic, also pure. `computeSummary()` in `summary.ts` is the single entry point; everything else feeds it.

```
slots.ts      assignSlot/groupBySlot/splitCoverage — THE calendar model (see below)
periods.ts    generates a cadence's slot calendar for a year; de-duplicates re-uploads
classify.ts   component key -> Category, with the rule that matched
forecast.ts   projects remaining slots, and estimates missing past ones
headcount.ts  joiners/leavers/turnover
yoy.ts        like-for-like year-on-year, aligned by slot index
warnings.ts   structured warnings ({code, severity, title, detail, items, action})
scenario.ts   what-if layer on top of a computed forecast
fiscal.ts     fiscal-year boundaries; every year rule goes through here
```

**One slot model, used everywhere.** `assignSlot()` maps a payroll period onto a calendar slot (month, half-month, or nearest weekly/bi-weekly grid point). Coverage, labels, de-duplication, year-on-year and the prior-year forecast all go through it. Before it existed, five places matched periods to slots by exact end-date equality, so a 26th-to-25th payroll matched nothing and the same year simultaneously reported months missing, forecast one month twice, and labelled bars with raw ISO dates. **If you add anything that needs to know which period belongs where, call `assignSlot` — do not compare end dates.**

**Two balancing lines keep the bridge honest.** `other_earnings_balance` is gross minus the mapped earnings; `balance` is gross minus net minus the mapped deductions. Both are forecast like any other line. They exist because real uploads have unmapped columns, and without them the forecast silently omitted whatever was not categorised.

**`kind` on a period row is four-valued**: `actual`, `estimated` (a past slot with no upload, projected), `forecast` (the future), `missing` (a past gap left unestimated). The UI draws each differently; a missing month must never silently vanish from a chart.

The Employee File's `kind` is also four-valued and is a **different** four: `actual`, `duplicate`, `not_paid`, `missing` (`packages/payroll-core/src/employee/types.ts`). There is no `estimated`, because estimating one person's missing month is inventing a payment to an individual; and no `forecast`, because the file forecasts nothing. The two types are deliberately not shared — they look alike, and a substitution between them is exactly how an invented figure would reach one employee's record.

### Request flow

```
upload  -> apps/web/src/app/api/upload/route.ts
        -> server/upload/{parser,validate,processor}.ts
        -> employee_snapshots rows + period_component_totals aggregates
compare -> tRPC comparisons.run -> runComparison() -> comparison_runs + comparison_results
annual  -> tRPC annual.getSummary -> computeSummary() -> rendered by components/annual/*
employee file
        -> tRPC employeeFile.list / employeeFile.get
        -> packages/payroll-core/src/employee/* -> components/employee-file/*
```

tRPC is the only app API surface (`/api/trpc/[trpc]`); routers live in `apps/web/src/server/routers/`. The `api/webhooks/*` and `api/test-*` routes are the exceptions.

### Multi-tenancy and roles

Every tenant-scoped table carries `companyId`. There is **no row-level security and no automatic tenant filter** — scoping is manual in every procedure. Use the procedure that matches the write, from `apps/web/src/server/trpc.ts`:

| Procedure | Who | Use for |
|---|---|---|
| `publicProcedure` | anyone | unauthenticated endpoints |
| `protectedProcedure` | signed in | when you only need `ctx.userId` and `ctx.db` |
| `memberProcedure` | signed in | **the default.** Resolves the user once and puts `ctx.companyId` and `ctx.currentUser` on the context |
| `editorProcedure` | admin, manager | any company-wide write — component categories, the budget, the fiscal start, `payrollPeriods.ingest`/`.delete`, `annual.setAiEnabled`, `annual.generateInsights`, `settings.updateCompany`, and `integrations.configure`/`.disconnect` |
| `payDetailProcedure` | admin, manager | reading an individual's pay detail (`employees.*`, `annual.drillDownEmployees`, `employeeFile.*`) |
| `adminProcedure` | admin | reserved; nothing uses it after the Employee File change |

`payDetailProcedure` is deliberately not `editorProcedure`, even though the two role lists are identical today: `EDITOR_ROLES` means "may change company-wide settings", and sharing the constant would make a later change to who sets the budget silently change who reads every salary.

**`comparisons.getById` is the widest employee-level surface in the product, and it is a `memberProcedure`.** It returns every `comparison_results` row — employee name, gross, net, per-component deltas — to any signed-in member, viewers included, and the Dashboard and Detailed View are built on it. So the role table above describes `employees.*` and the annual drill-down, not the product's actual exposure of individual pay. Narrowing `comparisons.getById` would remove the Dashboard and Detailed View from viewers, which is a product decision rather than a tidy-up; do not change it as part of unrelated work.

**The table says what each procedure means, not that every endpoint uses the right one.** Two gaps remain, each found by reading the routers rather than by anything failing. Both are scoped to the caller's own `companyId`, so neither is a cross-tenant leak — they are role gaps, which is a smaller and different thing:

- **The whole `ai.*` router is `protectedProcedure`.** `getNarrative`, `getAnomalyRefinement`, `askQuestion` and `getAuditSummary` are open to any signed-in user, viewers included, so a viewer can spend a Claude call on the company's data. "AI generation" in the table above means `annual.setAiEnabled` and `annual.generateInsights` and nothing else.
- **`api/upload/route.ts` has no role check** — it tests `authResult.userId`, then writes an `upload_sessions` row for the caller's company and returns the file's header row; `payrollPeriods.getUploadUrl` is a `protectedProcedure` doing the same. A viewer still cannot land a period, because `payrollPeriods.ingest` is correctly `editorProcedure`, so the cost is an orphan session row and a column list rather than payroll data.

`settings.updateCompany` **used to be the third**, and that entry is gone because the hole is closed: the company form is wired, the write is `editorProcedure`, and `test/settings-router.test.ts` pins a viewer's refusal. Do not "fix" it again.

Prefer `memberProcedure` over `protectedProcedure` in new code: it supplies `companyId` and saves a query. Forgetting to scope by `companyId` is a cross-tenant data leak, not just a bug.

### Plans are a second axis, and `companies.settings` is not one capability

**A role is who the person is; a plan is what the company bought.** They are separate gates and the constants stay separate: `PAY_DETAIL_ROLES`/`EDITOR_ROLES` in `lib/roles.ts`, `INTEGRATION_PLANS` in `lib/plans.ts`. `NAV_ITEMS` carries `roles` and `plans` as two optional fields and `visibleNavItems(role, plan)` filters on both; **neither argument is optional and neither has a "do not filter" value** — `null` means "unknown" and closes the gate. The axis first shipped with `plan` optional so four one-argument assertions in a test needed no edit, which made a capability gate default to open with nothing enforcing it. Don't reintroduce that.

The plan comes from `companies.settings.plan` through `planOfSettings()`, read once per request by `currentAccount()` — which is still **one query**, a join on `users.clerk_user_id` picking up `companies.settings`, with `ensureUser` running only when the join finds nothing. `routers/integrations.ts` reads the same `hasIntegrations()` predicate, so the hidden sidebar entry, the page's panel and the router's refusal cannot disagree.

**Nothing in the app writes `plan`.** Every company reads `"free"`, so Integrations is hidden from everyone including the account owner — intended while the screen advertises five connectors that do not exist (there is no sync procedure and no sync code anywhere in the repo; `integrations.syncStatus` is a stub returning `not_synced` unconditionally and wants a `periodId` the page does not have). Enterprise today is a direct write: `UPDATE companies SET settings = settings || '{"plan":"enterprise"}'::jsonb WHERE id = '…'`.

**`companies.settings` is one jsonb column shared by five features, so "write the settings" is not one capability.** It holds `plan`, `stripeSubscriptionId`/`…Status`/`subscriptionPeriodEnd`, `integrations`, `fiscalStartMonth`, `aiEnabled` and `tolerances`. `settings.updateCompany` merges a patch into it with `jsonb ||` **inside the UPDATE** — atomic under the row lock — and deletes keys through a separate `unsetSettings` array, not RFC 7396's null-means-delete, which would leave no way to store a JSON `null`.

**Every writer of that column writes it in one statement.** The expressions live in `apps/web/src/server/company-settings.ts` — the non-object guard (`jsonb || jsonb` *appends* when either side is not an object, so a column holding a scalar would become an array and every `settings.plan` read would go quietly undefined), the merge, and the `- 'key'::text` delete whose cast is required because `jsonb - integer` removes an array element instead. `settings.updateCompany`, `annual.setFiscalStartMonth`, `annual.setAiEnabled`, `integrations.configure` and `integrations.disconnect` all use them; do not add a sixth writer that reads the column, edits the object in JS and writes it back. Such a writer does not lose a concurrent write to its *own* key — the second writer wins, as anyone would expect — it loses a concurrent write to a **different** key, billing state included, which is why nothing ever noticed. `integrations.configure`/`.disconnect` are the awkward pair: their edit is per array *element*, so they rebuild the array with `jsonb_agg` over `jsonb_array_elements` of the locked row rather than merging one key, which also means two admins connecting two different providers at once both land. `test/company-settings-atomic.test.ts` interleaves a second caller's write into the middle of each of the four, through `pglite-neon.ts`'s `beforeStatement` hook. It writes only the keys on `WRITABLE_SETTINGS_KEYS` (today: `tolerances`, the one key with a reader and no writer) and refuses the rest **by name**, pointing at whatever owns them. That allow-list is load-bearing: the merge replaced a whole-object write, and a merge accepting arbitrary keys would let any admin set `plan: "enterprise"` through the settings form and unlock Integrations for their own company. The replace could only ever destroy that key; the merge could grant it.

### Raw SQL: alias and parse, never cast

`db.execute()` returns untyped rows, and **Postgres returns the column name as written** — a `snake_case` column read as `row.camelCase` is `undefined`, with nothing to catch it. That shipped once and made the annual page throw `Invalid time value` for every company with data. The rule in `routers/annual.ts`:

1. Alias every column in the SQL: `period_type AS "periodType"`.
2. Parse the result with a zod schema via `parseRows(...)`.
3. Never `as unknown as SomeRow[]`.

**Never interpolate a value inside a SQL comment.** drizzle's `sql` template turns every `${}` into a bind parameter, and Postgres strips comments before planning — so the parameter is sent but never referenced and the whole query fails with `42P18 could not determine data type of parameter`. Keep interpolation in the statement.

### Two round trips per page view

`getSummary` costs **two batched round trips**: one to resolve cadence/currency/company, one `ctx.db.batch([...])` for everything else. `db.batch` on neon-http sends the whole array as a single HTTP request. It was ~13 sequential requests before.

The summary is memoised per inputs for 30s per instance, keyed including `companyId`. `apps/web/test/annual-router.test.ts` asserts the round-trip budget, so a new sequential `await` in that path will fail the test rather than quietly costing a request.

`employeeFile.list` and `employeeFile.get` cost **3 each** on the same pattern: the middleware's user lookup, one scope batch (`server/employee-file/scope.ts`), and one data batch — with the access-log insert riding inside the data batch, so logging the read costs nothing on the normal path. It is **not** immune to being skipped, though: both procedures have an early return for a scope with no periods to read (`IN ()` is a Postgres syntax error), and the list's used to return before the batch was built and log nothing at all. Each empty path now spends its third request on the insert alone, which keeps it at the budget rather than over it. `apps/web/test/employee-file-router.test.ts` asserts `toBe(3)` for all four paths, counting the middleware lookup, which is the convention `annual-router.test.ts` uses even though the prose above counts only the batches — exact rather than `<=`, since 0 passed a `<=` assertion too and a shim that stopped counting would have left the tests green. Neither Employee File procedure is memoised, deliberately: the list and the file are different pages with different inputs, so a memo would add a cache-invalidation surface and save nothing.

### Per-period aggregates, with a fallback

`period_component_totals` holds per-period, per-department component totals (with sign-split row counts). It is written at upload by `rebuildPeriodComponentTotals()`, before the period is marked `ready`, so a period is never visible without its aggregates.

The annual queries read that table and **fall back to aggregating `employee_snapshots` live** for any period with no rows in it. Keep the fallback: it is what makes a deploy safe before `pnpm db:backfill-period-totals` has caught up, and keeps periods written by older builds correct. Both halves must stay numerically identical — there is a test that takes a summary on each path and compares them.

**That dual path is specific to the annual feature. Do not copy it into the Employee File.** `period_component_totals` is per-period, per-**department**: it has no employee dimension and no gross or net columns, so it cannot answer a per-person question at all. The Employee File reads `employee_snapshots` exclusively — one path, nothing to write, and nothing to keep numerically identical.

### Duplicate employee rows: three answers, on purpose

One employee with two rows in one period is handled **three different ways** in this repo, and the inconsistency is recorded rather than fixed:

| Where | What it does |
|---|---|
| `comparator.ts:35` | **refuses** — throws `DuplicateEmployeeIdsError` |
| `routers/annual.ts:147` and `packages/db/src/aggregates/periodComponentTotals.ts:29` | keeps **one** row, via `DISTINCT ON (...) ORDER BY created_at DESC` |
| Employee File (`packages/payroll-core/src/employee/`) | **sums every row** and flags the slot `duplicate`, excluding it from every average and delta |

The fact that makes the middle answer indefensible: `processUpload` inserts every row of a period in **one statement** and `created_at` defaults to transaction time, so all the rows of a period share a timestamp and the `created_at DESC` tie-break picks an arbitrary row — possibly a different one between runs. There is no `DISTINCT ON` anywhere in the Employee File for that reason.

`payroll_periods.total_gross` is the sum of **every** row (`processor.ts:195` and `:225`), so summing duplicates is what ties to the register. **The Employee File is authoritative for the register tie-out**, and where duplicates exist it and the annual dashboard now disagree by design, by the value of the dropped rows. The file states that gap, its cause and which figure reconciles; do not "fix" one side without reading `docs/EMPLOYEE_FILE_PLAN.md` decision 5 first.

One more thing worth knowing before chasing this: **duplicate rows can no longer be uploaded.** `validateRows` treats a repeated employee id as an error and `payrollPeriods.ingest` refuses before writing, so duplicates in `employee_snapshots` are data from before that gate existed. `apps/web/test/employee-file-fixtures.test.ts` pins both halves.

### Testing against a database

`apps/web/test/pglite-neon.ts` wraps PGlite (real Postgres, in-process) in the shape `drizzle-orm/neon-http` expects, applies every migration, and counts round trips. Three details are load-bearing:

- **`numeric`, `date` and `timestamp` come back as strings**, as neon-http returns them. A driver returning JS numbers and Dates would hide exactly the class of bug described above.
- **`arrayMode` is honoured.** drizzle's `db.select()` and `db.query.*` map results positionally; always returning objects silently produces garbage for them while `db.execute()` looks fine.
- **Queries are lazy.** `db.batch` builds its queries then hands them to `client.transaction`, which is one HTTP request; counting at build time would over-report.

The auth middleware prefers `ctx.db` over `requireDb()`, which is what lets a test inject a database without `DATABASE_URL` set.

### Migrations are idempotent, by rule

drizzle keys `__drizzle_migrations` on a **hash of the file contents**, so editing an old migration makes it run again — on production. Every file in `packages/db/src/migrations` is therefore written to survive a re-run (`IF NOT EXISTS`, or constraints wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;`). Catch `duplicate_table` as well: adding a `UNIQUE` constraint whose backing index exists raises `42P07`, not `42P06`.

`apps/web/test/harness.test.ts` applies the whole folder three times and fails if any pass errors. See `packages/db/src/migrations/README.md` for the reasoning and for the `CREATE INDEX CONCURRENTLY` note.

### Optional services degrade, never break

`db` is `DbClient | null`: `packages/db/src/client.ts` returns `null` when `DATABASE_URL` is unset so the landing page renders without a database. Consequences:

- In tRPC, use a `*Procedure` and `ctx.db` — the middleware has already resolved it.
- In `publicProcedure` or any server-side module, call `requireDb()` yourself.
- Never use the raw `db` export in new code.

The same shape applies elsewhere, and new features should follow it:

- **AI** (`@saas/ai`) falls back to deterministic rule-based output whenever Claude is unavailable. `callClaude` returns `{ text, error, model }` — it reports failures rather than swallowing them, so a caller can tell "unavailable" from "returned nothing" and never caches a failure as an answer. `generateAnnualInsights` returns `{ bullets, source }` where `source` is `"ai" | "rules"`; the UI must not label rule-based text with a model name.
- **Rate limiting** (`apps/web/src/server/rate-limit.ts`) uses Upstash when configured and **fails open** otherwise, including on a Redis outage. A missing limiter must not deny a feature.
- The model id comes from `ANTHROPIC_MODEL` (default `claude-sonnet-5`). The old `CLAUDE_MODEL` variable was never read and is gone.

### Money

Postgres `numeric` -> Drizzle returns **strings**. Conversion happens at the boundary: `Number(s.grossSalary)` going into `payroll-core`, `String(gross)` coming back. `payroll-core` works in `number` throughout.

On screen, use the formatters in `apps/web/src/components/annual/annual-utils.ts` — `formatMoney`, `formatCompact`, `formatAxisMoney`, `formatDays`, `formatPct`, `formatRatio`. They all use `currencyDisplay: "code"`, so it is always `USD 1,234.56` and never `$1,234.56`; mixing the two in one card is the bug they exist to prevent. `formatCompact` has a billions step (an LBP company otherwise shows a clipped `600000.0M`), and `formatDays` rounds to one decimal (absence days are summed from floats and print as `44.540000000000006` raw).

**Not every number on a payroll screen is money.** `formatRatio` is for the ones that are not — an FTE above all. The Employee File's change log ran `formatMoney` over every numeric value, so a part-time conversion printed as `USD 1.00 → USD 0.50 (USD -0.50, -50.0%)`. For the same reason an FTE movement in `employee/changelog.ts` is compared against a fixed `0.001` epsilon and not `smallestUnit(decimals)`: on JPY, KRW, VND and XAF that unit is **1**, so a 1.0 → 0.5 change never cleared it and was never logged at all. A tooltip is a figure too — pass it through a formatter rather than `toFixed(2)`, which drops the fils on KWD and invents two decimals on JPY.

### Charts and accessibility

Wrap every chart in `components/annual/chart-frame.tsx`: it supplies `role="img"`, a label, and a visually hidden data table carrying the same numbers. Recharts emits an SVG with no semantics of its own.

Set chart colours with explicit `fill`/`stroke` props, **not** a Tailwind `className` — Recharts does not apply classes to legend marks, so they render black and disappear in dark mode.

`components/annual/chart-frame.tsx` and `annual-utils.ts` are **shared presentation primitives, not part of the gated annual dashboard** — the Employee File imports both in place rather than copying or moving them.

### Design system: Ink & Signal

The whole app — marketing and `(main)` — draws from the Clarivo design system. Its React implementation is `apps/web/src/components/cv` (import from `@/components/cv`); the tokens are `src/app/clarivo-tokens.css`, mapped for Tailwind in `tailwind.config.ts` as `cv-` utilities. The skill `.claude/skills/clarivo-design-system` carries the rules; `docs/design/` holds the brief, the screen map and the token map. The target screens are the canvas "Clarivo SaaS Redesign".

- **Colour means change.** Rust (`delta-up`) for increases, cobalt (`delta-down`) for decreases, grey for none, always with an arrow and a sign — use `<Variance>`. Status colours (`success`, `warning`, `danger`) only with an icon and a word. Danger is crimson, kept away from rust: a change is not an error. Nothing else gets a hue, and no button is filled with rust.
- **Two vocabularies, one palette.** `globals.css` maps shadcn's HSL variables (`--primary`, `--muted-foreground`…) onto the tokens, so `components/ui` and classes like `bg-card` repaint on their own. New code uses `cv-` utilities. Opacity modifiers do not work on `cv-` colours (a complete colour has no channels): use the `-soft` tokens or `bg-cv-scrim`. shadcn's `--accent` is a hover ground, not cobalt.
- **Themes.** Light on `:root`; Dark on `.dark` (next-themes), `[data-theme="dark"]` and `[data-cv-theme="dark"]`, which scopes a dark region: the side menu uses it. The marketing layout pins `data-theme="light"`. **Printing obeys the live theme**, which is an open issue rather than a decision: a panel keeps `bg-cv-surface`, that resolves dark under `.dark`, and the `print-color-adjust: exact` in `@media print` (there to stop Chrome erasing chart fills) prints it as drawn — so a board pack produced from dark mode comes out dark. Switch to light before printing until that is fixed.
- **Money** still goes through `formatCurrency` / `formatMoney`; pass `format` to `<Variance>` so a component never formats money itself.
- **Charts** take colours from `lib/chart-palette.ts` (`CHART`, `seriesColor`, `deltaColor`) as explicit `fill`/`stroke`; categories use `chart-1…6` in order and fold a seventh into "Other".
- **`test/design-system.test.ts`** fails on raw Tailwind palette colours, hex colours, `hsl(var(--…))` used as a colour and the legacy `increase-text`/`decrease-text`/`anomaly-*` class names, anywhere under `src/`. `lib/clerk-appearance.ts` is the one exemption: Clerk needs concrete hex values, which mirror the tokens there. Those legacy utilities no longer exist in `globals.css`, so the names are caught rather than silently working; `docs/design/TOKEN_MAP.md` names the replacement for each.
- **Type** is Instrument Sans (words) and Geist Mono (figures, ids, codes), self-hosted through `src/app/fonts.ts`. Sentence case everywhere; product names keep capitals (Dashboard, Detailed View, Employee File).

### `saved_views` is dead schema

Nothing in the app reads or writes `saved_views`. The only references are the table definition, its export from `packages/db/src/schema/index.ts`, and migration `0000`. **Column preferences actually live in `localStorage`** — under `saas-saved-views` for the detailed view (`components/detailed-view/saved-views.tsx`, which keeps `{id, name, columns}`) and `drift_employee_columns` for the Employee File list (`hooks/use-employee-columns.ts`). Persisting a new preference there is the pattern to follow; wiring `saved_views` up is a migration-shaped decision, not a tidy-up.

**`hooks/use-saved-views.ts` is dead too, and it is the trap here.** It is a complete hook over the key `drift_saved_views` with its own `SavedView` shape (`columnConfig`, `createdAt`) — and **nothing imports it**. The live component is the one named above, it writes a different key and a different shape, and this file said `drift_saved_views` for months. Read the component for the key, never the hook. Renaming either side to match the other would make every existing user's saved views unreadable — a silent data loss dressed as a tidy-up — so the two names stay and the doc is what moved.

The detailed view's column picker is also not reusable as a component: its model is `{component, visible, mode}` where `mode` is `current | previous | side_by_side | delta_only`, which is comparison semantics. Reusing it for a list renders four meaningless mode buttons per column, which is why the Employee File has its own.

### No build step for library packages

The four `packages/*` set `"main": "./src/index.ts"` and have **no `build` script** — they are consumed as raw TypeScript, listed in `apps/web/next.config.ts` under `transpilePackages`. So `pnpm build` only runs `next build`, and turbo's `dependsOn: ["^build"]` is a no-op for them. Nothing validates a package in isolation except `typecheck`.

### Two disconnected TypeScript configs

- Root `tsconfig.json` sets `strict` **plus `noUncheckedIndexedAccess`**, and `paths` pointing `@saas/*` at other packages' `src/`. The four `packages/*` extend it.
- `apps/web/tsconfig.json` does **not** extend the root. It is standalone, with no `noUncheckedIndexedAccess`, and duplicates the `@saas/*` paths itself.

Practical effects:

- Code in `packages/*` must satisfy `noUncheckedIndexedAccess`; the same code in `apps/web` need not. Indexing a `Record` or array there yields `T | undefined`.
- TypeScript narrows element access only for literal or `const` keys. `map[obj.prop]` does not narrow; hoist it first (`const k = obj.prop`).
- Prefer a closed key union (`Record<DistributionLabel, number>`) over `Record<string, number>` when the keys are known — `noUncheckedIndexedAccess` does not apply to non-index-signature types. `satisfies` is the other tool for this: annotating a lookup table as `Record<string, T>` adds an index signature and makes every member possibly undefined.
- `rootDir` was removed from the package tsconfigs. Putting it back reintroduces `TS6059` for any package that imports another package's source, which is how `@saas/ai` used to fail.

### Linting

`apps/web/eslint.config.mjs` is flat config; the script is `eslint .` (`next lint` is removed in Next 16). `eslint-config-next` is pinned to `^15` to match the Next major in use — v16 ships `eslint-plugin-react-hooks` v6, whose React-Compiler rules flag long-standing patterns across the whole app and are a separate piece of work.

## The annual review and its plan

`docs/ANNUAL_REVIEW_45c9f13.md` is a deep review of the annual feature with a 48-step fix plan; `docs/Annual_Dashboard_Spec.md` is the spec it checks against. Most of the design decisions above are the result of a numbered step, and commit messages on this branch cite them (`fix(annual): steps 10-21 …`). When changing annual code, check the review for the finding that produced the current shape before replacing it.

Steps 1–47 are done. Outstanding: **step 48** (the release itself — needs GitHub auth, a production database and a 24-hour watch). Acceptance checks stated as probe IDs (`P1`, `R5`, `AI2`) were verified against the described behaviour, because those probe files were never committed. Playwright snapshot checks (steps 32, 35, 47) are unrunnable here — no browsers, no baselines — though the fixtures themselves are covered by `packages/payroll-core/src/annual/qa-fixtures.test.ts`.

`.github/workflows/deploy.yml` is gone — it duplicated Vercel's Git integration and failed on every push. It was deleted in `68800ac`, which is on `main`; the three workflows left are `ci.yml`, `migrate-preview.yml` and `migrate-production.yml`. Do not add a deploy workflow back: Vercel builds from the Git integration, and a second one racing it is what this was.

## The Employee File plan and its spec

`docs/EMPLOYEE_FILE_PLAN.md` is a 34-step implementation plan in seven phases; `docs/EMPLOYEE_FILE_SPEC.md` is the payroll spec it checks against. Read it the same way as the annual review: **most of the shapes in this feature are the result of a numbered finding**, and the plan's section 1 lists eleven places where the spec and the codebase disagreed, each with what was done instead. Commit messages cite them (`feat(employee-file): …`, findings `F1`-`F11`).

The narrowings worth knowing before changing anything here: the list's flag column is the three SQL-expressible flags only (F5 — the identity breaches need the classifier and live on the file page); there is **no AI narrative and no "all clear" badge** (F11, spec section 10); the export, the dimension columns and filters, and the §7.4 id-change badge are deferred, each with its reason; and `annual.ts:1106`'s `MAX(r.employee_name)` is the **alphabetical** maximum rather than the latest, so do not copy it — use `(array_agg(employee_name ORDER BY period_end DESC, created_at DESC))[1]`.

## Other directories

- `samples/` — upload fixtures, with a README: `payroll_june_2026.csv` / `payroll_july_2026.csv` for the comparison (**July does not reconcile and the upload gate refuses it**, by design — see `samples/README.md`), `2025/` for the annual year, and `employee-file/` for the Employee File's duplicate-row and re-upload cases
- `Drift Website/` — standalone static landing page, unrelated to the Next.js app and outside the pnpm workspace
