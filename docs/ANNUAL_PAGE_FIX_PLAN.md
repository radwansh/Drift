# Annual Salaries page — why it fails, and the steps to fix it

Review date: 2026-10-13. Branch `fix/annual-steps` @ `bbe1bfd`.

> **Status: steps 1–4 implemented**, covered by
> `apps/web/test/provision-and-ingest.test.ts` (12 tests). Provisioning
> (`apps/web/src/server/ensure-user.ts`), the explicit failure state on the
> annual page, the `payrollPeriods.ingest` path, and the periods page reading
> from the server are all in. An upload now survives a reload and appears in
> the annual summary.
>
> Step 4 required two things from step 7 to be pulled forward, because pointing
> the page at the server makes them reachable: `payrollPeriods.delete` is now
> scoped by company (finding 4a) and moved to `editorProcedure`, and a scoped
> `deleteAll` backs "Clear All", which previously promised to delete everything
> but only emptied a React context.
>
> **Still outstanding, and one is a live data leak:** see finding 4e below —
> `comparisons.run` reads two periods and all their employee snapshots by id
> with no company check. Steps 5–8 remain, and the comparison Dashboard still
> reads the in-memory store, so **Compare only works for periods uploaded in
> the current browser session**; for a period loaded from the server it lands
> on an empty dashboard. That is the last piece of the store's removal
> (step 3.4).

Reported symptoms:

1. Clicking **Annual Salaries** shows a spinner, then lands on **Dashboard**.
2. The page never shows figures, despite seven 2026 payroll periods having been uploaded.

Both are reproduced and explained below. Neither is a bug in the annual
feature itself — the annual engine is correct and is proven so by tests added
with this review. The cause is that **the upload UI and the annual dashboard
are not connected to each other**: the dashboard reads Postgres, and the upload
UI never writes to it.

---

## Finding 1 — the bounce to Dashboard is a redirect chain

`apps/web/src/app/(main)/annual-salaries/page.tsx:30` looks the signed-in user
up in the database:

```ts
const currentUser = await db.query.users.findFirst({
  where: eq(users.clerkUserId, authResult.userId),
});
if (!currentUser) redirect("/login");     // line 33
```

With no matching `users` row the page redirects to `/login`. `/login` is a
public route in `apps/web/src/middleware.ts`, so Clerk does not challenge an
already-signed-in visitor; instead `<SignIn>` honours
`afterSignInUrl="/dashboard"` from `apps/web/src/app/layout.tsx:17` and sends
the user to the dashboard.

That is the whole observed behaviour:

```
click Annual Salaries
  -> loading.tsx renders the spinner while the server component runs
  -> users row not found          (page.tsx:33)
  -> redirect("/login")
  -> already signed in, afterSignInUrl                (layout.tsx:17)
  -> /dashboard
```

The spinner is `apps/web/src/app/(main)/annual-salaries/loading.tsx`. Nothing
is broken in it; it is simply showing while a server component decides to
redirect.

### Why there is no `users` row

Nothing in the application ever creates one. Verified by searching every
insert into `users` or `companies`:

- `auth.createCompany` (`apps/web/src/server/routers/auth.ts:21`) is the only
  code that inserts a company and its first user — and **no UI calls it**.
- There is no Clerk webhook. `apps/web/src/app/api/webhooks/` contains only
  `zoho`.
- `(main)/layout.tsx` does no provisioning.

So a fresh Clerk sign-up has an authenticated session and **zero database
presence**. Annual Salaries is the only page that notices, because it is the
only page that resolves a `users` row during a server render. The others fail
differently or not at all:

| Page | Behaviour today |
|---|---|
| Dashboard | Works — pure client component, reads an in-memory store, never touches the DB |
| Payroll Periods | Works — same in-memory store, with `companyId: "c1"` hardcoded (`page.tsx:44`) |
| Annual Salaries | Redirects away (the reported bug) |
| Settings, Detailed, Integrations | tRPC `NOT_FOUND` — these call `users.findFirst` too |

This is why the app feels like it works until you open Annual Salaries.

---

## Finding 2 — the uploads never reached the database

`apps/web/src/components/payroll-periods/upload-modal.tsx` makes **no network
call of any kind**. There is no `fetch`, no tRPC mutation, no `/api/upload`
request anywhere in the file. "Confirm Import" (`handleNextStep`, step 4,
lines 320–358) does this:

```ts
setProcessing(true);
timeoutRef.current = setTimeout(() => {
  ...
  addPeriod({ id: `upload-${Date.now()}-...`, label, employees, ... });
  setSaved(true);
  setStep(5);
}, 2500);        // the "Processing your payroll data..." spinner is a timer
```

The file is parsed in the browser (`FileReader` + `xlsx`), the 2.5-second
"Processing your payroll data…" is a `setTimeout`, and the result is pushed
into `usePayrollStore`. That store is a plain React context holding `useState`
(`apps/web/src/lib/payroll-store.tsx:28`) — not localStorage, not the server.

Consequences:

- The seven uploaded periods exist only in the memory of that one browser tab.
  **A hard refresh loses them.** They are not recoverable and will have to be
  uploaded again once the fix is in.
- `payroll_periods` is empty, so `yearsWithData` in
  `annual-salaries/page.tsx:35` returns nothing.
- Even with Finding 1 fixed, the page would correctly render an empty year.

### The server-side pipeline exists, and is dead code

A complete, correct ingestion path is already written and **called from
nowhere**. Each of these is defined exactly once and has no callers:

- `parseFile` — `apps/web/src/server/upload/parser.ts:9`
- `validateRows` — `apps/web/src/server/upload/validate.ts:29`
- `processUpload` — `apps/web/src/server/upload/processor.ts:39`

`processUpload` does exactly what the annual dashboard needs: inserts the
period, inserts `employee_snapshots`, calls `rebuildPeriodComponentTotals()`,
then flips the period to `ready` — in that order, so a period is never visible
without its aggregates.

`apps/web/src/app/api/upload/route.ts` is also not the ingestion path. It
creates an `upload_sessions` row, splits the CSV to count lines, returns the
headers, and stops. Nothing calls it either.

So the fix is mostly **wiring**, not new domain logic.

---

## Finding 3 — the forecast requirement already works

The requirement — that a part-filled year is still selectable and is forecast
to a full year, labelled as a forecast — is already satisfied by the engine.
Proven by `packages/payroll-core/src/annual/partial-year.scenario.test.ts`,
added with this review. Nine scenarios, all passing on the first run, with the
clock pinned to 2026-10-13 to match the reported case:

| Scenario | Result |
|---|---|
| 7 of 12 months uploaded | to-date 700K, forecast 500K, **full year 1.2M** |
| All 12 slots present | 7 `actual`, 5 projected, **no slot dropped**, none left `missing` |
| Projected months labelled | month names, never raw ISO dates |
| Stated as projected | assumptions/warnings prose matches `forecast|estimat|project` |
| Bridge consistency | `totalEmploymentCost == gross + employerCosts` on all three lines |
| 1 of 12 months | still forecasts a full 1.2M year |
| Gap in the middle (Mar/Apr missing) | treated as a gap, not as the end of the year |
| Empty year | 0, no `NaN`, no crash |
| Fully uploaded year | forecast 0, full year 1.2M, all `actual` |

Once real data reaches the database, this behaviour appears on screen. No
engine change is required for the stated requirement.

One genuine gap remains: `availableYears` (`annual-salaries/page.tsx:50`) is
`years-with-data ∪ {current year}`. A **partial** year is selectable as soon as
it has one period, so the requirement holds. But a year with *no* uploads
cannot be selected, which blocks viewing a prior year for year-on-year
comparison. Step 6 widens it.

---

## Finding 4 — defects that become reachable once the UI is wired

These are latent today only because no UI writes to the database. They become
live bugs the moment Step 3 lands.

**4a. Cross-tenant delete.** Neither delete scopes by company:

- `apps/web/src/server/routers/payroll-periods.ts:103` — `delete(payrollPeriods).where(eq(payrollPeriods.id, input.id))`
- `apps/web/src/server/routers/column-mappings.ts:73` — same shape

Any signed-in user can delete any tenant's payroll period given its UUID.
`CLAUDE.md` calls this out as a data leak rather than a bug; the same applies
to a destructive write. Note `list` on the same router *is* scoped correctly
(`payroll-periods.ts:26`), so this is an oversight, not a pattern.

**4b. `payrollPeriods.create` writes a period with no data.**
`payroll-periods.ts:56` inserts a period with `status: "ready"` but no
`employee_snapshots` and no `period_component_totals`. Such a period makes its
year appear in the year selector while contributing nothing to any total. Use
`processUpload` instead, or have this procedure write snapshots too.

**4c. `inviteUser` can only ever succeed once.** `auth.ts:71` inserts
`clerkUserId: ""`, but `users.clerk_user_id` is `UNIQUE`
(`packages/db/src/migrations/0000_cheerful_miek.sql:134`). The second invite
violates the constraint. Use `NULL` — which requires making the column
nullable — or a per-invite placeholder.

**4e. `comparisons.run` leaks another tenant's employee data.** Found while
doing step 4. `apps/web/src/server/routers/comparisons.ts:29` fetches both
periods by id with no company filter, then selects every
`employee_snapshots` row for them and returns the full comparison —
per-employee names, departments, and pay. Unlike 4a this needs no UI: it is an
exposed `protectedProcedure`, so any signed-in user who can name two period
UUIDs gets their contents. It is also the more serious of the two, because a
read leaks data where the delete only destroyed it. The fix is the same shape:
resolve `ctx.companyId` (move to `memberProcedure`) and add it to both period
lookups.

**4d. The year selector double-navigates and drops params.**
`apps/web/src/components/annual/year-selector.tsx:35` does
`router.replace('/annual-salaries?year=${next}')`, discarding `cadence`,
`currency` and `method`. It also fires alongside the parent's own
`router.replace` in `annual-dashboard.tsx` `setParams` — two navigations per
change, racing, with the hardcoded one clobbering the parent's.

---

## The fix, in order

Each step is independently verifiable. Steps 1–3 are what make the page work;
4–7 are correctness and hardening.

### Step 1 — provision a company and user for a signed-in account

The unblocking change. `users.clerk_user_id` is `UNIQUE`, so an idempotent
upsert is race-safe.

Add `ensureUser(db, clerkUserId)` to `apps/web/src/server/` that:

1. selects the `users` row for `clerkUserId` and returns it if present;
2. otherwise inserts a company and a first `admin` user in one transaction,
   with `ON CONFLICT (clerk_user_id) DO NOTHING`, then re-selects.

Call it from `apps/web/src/server/trpc.ts` in the `memberProcedure`
middleware (so every tRPC path self-heals) and from
`annual-salaries/page.tsx` in place of the bare `findFirst`.

Chosen over the alternatives because it is idempotent, needs no new secret,
and repairs accounts that already exist — including the reporter's. A Clerk
`user.created` webhook is the conventional approach but would not help any
account created before it was added, and silently leaves the user stuck if a
delivery fails. Add one later as an optimisation, not as the fix.

Note the product decision this encodes: one personal company per signed-in
user. If accounts should instead join an existing company by invitation, that
flow has to exist first (see 4c) and this step must defer to it rather than
auto-creating.

*Verify:* a fresh Clerk account can open `/annual-salaries` and sees an empty
year with a "no data" state — not a redirect.

### Step 2 — never silently redirect away from the page

Even with Step 1, redirecting on a failed lookup is the wrong behaviour: it is
indistinguishable from a broken link and it loses the error. In
`annual-salaries/page.tsx`, keep `redirect("/login")` only for
`!authResult.userId`. If the user is authenticated but has no row after
Step 1's `ensureUser`, render an explicit message instead of redirecting.

*Verify:* temporarily force the lookup to fail; the page explains itself and
stays put.

### Step 3 — make the upload write to the database

The fix for "shows nothing". The pipeline exists; connect it.

1. Add a `payrollPeriods.ingest` mutation (an `editorProcedure` — it is a
   company-wide write) taking the parsed rows, the mappings, and the period
   metadata, and calling `validateRows` then `processUpload` with
   `ctx.companyId`. Alternatively finish `/api/upload/route.ts` so it calls
   `parseFile` → `validateRows` → `processUpload`; prefer the tRPC mutation
   for consistency with the rest of the app surface.
2. In `upload-modal.tsx`, replace the two `setTimeout` fakes
   (lines 302 and 322) with real calls: step 3→4 validates, step 4→5 ingests.
   Await the real result; surface real validation errors and a real failure
   state rather than always showing "Upload complete!".
3. Report the server's row counts and totals on step 5 instead of the
   client-side `validationResult`.
4. Decide the fate of `usePayrollStore`. The comparison Dashboard still reads
   it, so it cannot simply be deleted — but it must stop being the system of
   record. Either have the Dashboard read `comparisons.run` from the server,
   or keep the store as a view-cache populated *from* the server response.

*Verify:* upload a file from `samples/`, then confirm with
`select count(*) from payroll_periods` and `from employee_snapshots`, and that
the period reaches `status = 'ready'` with `period_component_totals` rows.

### Step 4 — make the Payroll Periods page read the database

`(main)/payroll-periods/page.tsx` maps the in-memory store and hardcodes
`companyId: "c1"` and `status: "ready"` (lines 42–58). Switch it to
`trpc.payrollPeriods.list`, which is already correctly scoped and paginated.
Until this lands, the user cannot see what is actually stored.

*Verify:* an uploaded period survives a hard refresh and appears with its real
status.

### Step 5 — fix the year selector

In `year-selector.tsx`, delete the `router.replace` at line 35 and let the
parent own the URL through `onYearChange`. `annual-dashboard.tsx` already
calls `setParams({ year, cadence: null, currency: null })`, which preserves the
other params and navigates once. Keep the cookie write.

*Verify:* change the year with a non-default cadence and forecast method
selected; both survive, and the network tab shows one navigation.

### Step 6 — let any sensible year be selected

To satisfy "I should still be able to select that year" for years with no
uploads at all, widen `availableYears` in `annual-salaries/page.tsx:50` to the
union of years-with-data, the current year, and the current year ± 1. A year
with no data renders the empty state, and a prior year becomes reachable for
year-on-year comparison.

*Verify:* with only 2026 data, 2025 is selectable and renders an empty year
rather than being absent from the list.

### Step 7 — close the defects from Finding 4

- Add `eq(table.companyId, ctx.companyId)` to both deletes (4a) and move them
  to `memberProcedure`/`editorProcedure` so `ctx.companyId` is available.
- Either route `payrollPeriods.create` through `processUpload` or have it
  write snapshots and aggregates (4b).
- Fix the invite placeholder against the `UNIQUE` constraint (4c).

*Verify:* a test asserting that deleting another company's period id returns
`NOT_FOUND` and leaves the row intact — the same shape as the existing
cross-tenant tests in `apps/web/test/annual-router.test.ts`.

### Step 8 — look at the page

Ten annual components were rewritten across steps 32–41 and **none has ever
been rendered in a browser**; the Playwright checks for steps 32, 35 and 47
have never run here (no browsers, no baselines). Once Steps 1–3 are in, upload
the two files in `samples/` and walk the page: KPI cards, the periods chart
with `estimated`/`forecast`/`missing` styling, the bridge, departments, YoY,
insights, export. Expect to find layout problems that no unit test can catch.

---

## What this does not change

The annual engine, its SQL, and its tests. `computeSummary` and everything
under `packages/payroll-core/src/annual/` are correct for the reported
scenario, and the round-trip budget, aggregate-vs-live equivalence, and
migration idempotency guarantees described in `CLAUDE.md` are unaffected by
any step above.

Current state: `pnpm typecheck` 0 errors across 5 packages; `pnpm lint` 0
errors, 41 warnings; `pnpm test` 265 passing (198 payroll-core, 19 ai, 48 web).
