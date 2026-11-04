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
pnpm lint                         # eslint; currently 0 errors, ~41 warnings
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
pnpm db:seed
pnpm db:backfill-period-totals    # rebuild per-period aggregates for existing history
```

## Environment

`.env.example` documents every variable, but **two different files are read depending on the entry point**:

- `apps/web/.env.local` — Next.js (it does not auto-load `.env` from the monorepo root)
- `<repo root>/.env` — `packages/db/src/client.ts` and `drizzle.config.ts`, both hardcoded to `../../.env`

So DB/migration/seed scripts and the web app read different files. `DATABASE_URL` must be set in both for everything to work.

Only `DATABASE_URL` is needed to do real work. Clerk, Anthropic, Stripe, R2, Zoho, Resend and Upstash keys gate their own features, and each degrades rather than failing — see "Optional services degrade" below.

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
| `editorProcedure` | admin, manager | any company-wide write (categories, budget, settings, AI generation) |
| `payDetailProcedure` | admin, manager | reading an individual's pay detail (`employees.*`, `annual.drillDownEmployees`, `employeeFile.*`) |
| `adminProcedure` | admin | reserved; nothing uses it after the Employee File change |

`payDetailProcedure` is deliberately not `editorProcedure`, even though the two role lists are identical today: `EDITOR_ROLES` means "may change company-wide settings", and sharing the constant would make a later change to who sets the budget silently change who reads every salary.

**`comparisons.getById` is the widest employee-level surface in the product, and it is a `memberProcedure`.** It returns every `comparison_results` row — employee name, gross, net, per-component deltas — to any signed-in member, viewers included, and the Dashboard and Detailed View are built on it. So the role table above describes `employees.*` and the annual drill-down, not the product's actual exposure of individual pay. Narrowing `comparisons.getById` would remove the Dashboard and Detailed View from viewers, which is a product decision rather than a tidy-up; do not change it as part of unrelated work.

Prefer `memberProcedure` over `protectedProcedure` in new code: it supplies `companyId` and saves a query. Forgetting to scope by `companyId` is a cross-tenant data leak, not just a bug.

### Raw SQL: alias and parse, never cast

`db.execute()` returns untyped rows, and **Postgres returns the column name as written** — a `snake_case` column read as `row.camelCase` is `undefined`, with nothing to catch it. That shipped once and made the annual page throw `Invalid time value` for every company with data. The rule in `routers/annual.ts`:

1. Alias every column in the SQL: `period_type AS "periodType"`.
2. Parse the result with a zod schema via `parseRows(...)`.
3. Never `as unknown as SomeRow[]`.

**Never interpolate a value inside a SQL comment.** drizzle's `sql` template turns every `${}` into a bind parameter, and Postgres strips comments before planning — so the parameter is sent but never referenced and the whole query fails with `42P18 could not determine data type of parameter`. Keep interpolation in the statement.

### Two round trips per page view

`getSummary` costs **two batched round trips**: one to resolve cadence/currency/company, one `ctx.db.batch([...])` for everything else. `db.batch` on neon-http sends the whole array as a single HTTP request. It was ~13 sequential requests before.

The summary is memoised per inputs for 30s per instance, keyed including `companyId`. `apps/web/test/annual-router.test.ts` asserts the round-trip budget, so a new sequential `await` in that path will fail the test rather than quietly costing a request.

`employeeFile.list` and `employeeFile.get` cost **3 each** on the same pattern: the middleware's user lookup, one scope batch (`server/employee-file/scope.ts`), and one data batch — with the access-log insert riding inside the data batch, so logging the read costs nothing and cannot be skipped by an early return. `apps/web/test/employee-file-router.test.ts` asserts `<= 3` for both, counting the middleware lookup, which is the convention `annual-router.test.ts` uses even though the prose above counts only the batches. Neither Employee File procedure is memoised, deliberately: the list and the file are different pages with different inputs, so a memo would add a cache-invalidation surface and save nothing.

### Per-period aggregates, with a fallback

`period_component_totals` holds per-period, per-department component totals (with sign-split row counts). It is written at upload by `rebuildPeriodComponentTotals()`, before the period is marked `ready`, so a period is never visible without its aggregates.

The annual queries read that table and **fall back to aggregating `employee_snapshots` live** for any period with no rows in it. Keep the fallback: it is what makes a deploy safe before `pnpm db:backfill-period-totals` has caught up, and keeps periods written by older builds correct. Both halves must stay numerically identical — there is a test that takes a summary on each path and compares them.

**That dual path is specific to the annual feature. Do not copy it into the Employee File.** `period_component_totals` is per-period, per-**department**: it has no employee dimension and no gross or net columns, so it cannot answer a per-person question at all. The Employee File reads `employee_snapshots` exclusively — one path, nothing to write, and nothing to keep numerically identical.

### Duplicate employee rows: three answers, on purpose

One employee with two rows in one period is handled **three different ways** in this repo, and the inconsistency is recorded rather than fixed:

| Where | What it does |
|---|---|
| `comparator.ts:35` | **refuses** — throws `DuplicateEmployeeIdsError` |
| `routers/annual.ts:162` and `packages/db/src/aggregates/periodComponentTotals.ts:29` | keeps **one** row, via `DISTINCT ON (...) ORDER BY created_at DESC` |
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

On screen, use the formatters in `apps/web/src/components/annual/annual-utils.ts` — `formatMoney`, `formatCompact`, `formatAxisMoney`, `formatDays`, `formatPct`. They all use `currencyDisplay: "code"`, so it is always `USD 1,234.56` and never `$1,234.56`; mixing the two in one card is the bug they exist to prevent. `formatCompact` has a billions step (an LBP company otherwise shows a clipped `600000.0M`), and `formatDays` rounds to one decimal (absence days are summed from floats and print as `44.540000000000006` raw).

### Charts and accessibility

Wrap every chart in `components/annual/chart-frame.tsx`: it supplies `role="img"`, a label, and a visually hidden data table carrying the same numbers. Recharts emits an SVG with no semantics of its own.

Set chart colours with explicit `fill`/`stroke` props, **not** a Tailwind `className` — Recharts does not apply classes to legend marks, so they render black and disappear in dark mode.

`components/annual/chart-frame.tsx` and `annual-utils.ts` are **shared presentation primitives, not part of the gated annual dashboard** — the Employee File imports both in place rather than copying or moving them.

### `saved_views` is dead schema

Nothing in the app reads or writes `saved_views`. The only references are the table definition, its export from `packages/db/src/schema/index.ts`, and migration `0000`. **Column preferences actually live in `localStorage`** — `drift_saved_views` for the detailed view (`apps/web/src/hooks/use-saved-views.ts`) and `drift_employee_columns` for the Employee File list (`use-employee-columns.ts`). Persisting a new preference there is the pattern to follow; wiring `saved_views` up is a migration-shaped decision, not a tidy-up.

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

`.github/workflows/deploy.yml` should be deleted (it duplicates Vercel's Git integration and fails); the removal was blocked locally.

## The Employee File plan and its spec

`docs/EMPLOYEE_FILE_PLAN.md` is a 34-step implementation plan in seven phases; `docs/EMPLOYEE_FILE_SPEC.md` is the payroll spec it checks against. Read it the same way as the annual review: **most of the shapes in this feature are the result of a numbered finding**, and the plan's section 1 lists eleven places where the spec and the codebase disagreed, each with what was done instead. Commit messages cite them (`feat(employee-file): …`, findings `F1`-`F11`).

The narrowings worth knowing before changing anything here: the list's flag column is the three SQL-expressible flags only (F5 — the identity breaches need the classifier and live on the file page); there is **no AI narrative and no "all clear" badge** (F11, spec section 10); the export, the dimension columns and filters, and the §7.4 id-change badge are deferred, each with its reason; and `annual.ts:1113`'s `MAX(employee_name)` is the **alphabetical** maximum rather than the latest, so do not copy it — use `(array_agg(employee_name ORDER BY period_end DESC, created_at DESC))[1]`.

## Other directories

- `samples/` — upload fixtures, with a README: `payroll_june_2026.csv` / `payroll_july_2026.csv` for the comparison (**July does not reconcile and the upload gate refuses it**, by design — see `samples/README.md`), `2025/` for the annual year, and `employee-file/` for the Employee File's duplicate-row and re-upload cases
- `Drift Website/` — standalone static landing page, unrelated to the Next.js app and outside the pnpm workspace
