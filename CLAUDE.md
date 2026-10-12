# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Drift — multi-tenant SaaS for payroll. Two features share one data model:

- **Comparison** — upload a payroll file per period; the app matches employees across two periods, diffs salary components, flags anomalies, and renders a dashboard with an AI-written narrative.
- **Annual salaries** — calendar- or fiscal-year totals for one company, with a forecast for the rest of the year, department and statutory breakdowns, a budget, and written insights.

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

Turbo stops the whole run at the first failing task. To see every package's result, add `--continue`:

```bash
pnpm typecheck -- --continue
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

### Request flow

```
upload  -> apps/web/src/app/api/upload/route.ts
        -> server/upload/{parser,validate,processor}.ts
        -> employee_snapshots rows + period_component_totals aggregates
compare -> tRPC comparisons.run -> runComparison() -> comparison_runs + comparison_results
annual  -> tRPC annual.getSummary -> computeSummary() -> rendered by components/annual/*
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
| `adminProcedure` | admin | individual employee data |

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

### Per-period aggregates, with a fallback

`period_component_totals` holds per-period, per-department component totals (with sign-split row counts). It is written at upload by `rebuildPeriodComponentTotals()`, before the period is marked `ready`, so a period is never visible without its aggregates.

The annual queries read that table and **fall back to aggregating `employee_snapshots` live** for any period with no rows in it. Keep the fallback: it is what makes a deploy safe before `pnpm db:backfill-period-totals` has caught up, and keeps periods written by older builds correct. Both halves must stay numerically identical — there is a test that takes a summary on each path and compares them.

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

## Other directories

- `samples/` — `payroll_june_2026.csv` / `payroll_july_2026.csv`, usable as upload fixtures
- `Drift Website/` — standalone static landing page, unrelated to the Next.js app and outside the pnpm workspace
