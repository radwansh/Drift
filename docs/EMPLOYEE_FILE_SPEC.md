# Employee File — payroll specification

*Payroll review, 1 November 2026. Written against the code on `feat/llms-blog-and-capture`.*
*This is the input to the architecture agent. It specifies behaviour and arithmetic. It contains no code and changes none.*

---

## 0. Verdict first

The feature as the owner described it — a sidebar entry above Dashboard, a filterable list of employees, a per-employee breakdown defaulting to the current year — is buildable today from `employee_snapshots` alone. Nothing at its core needs the annual engine's gated surface (§2.5).

Three things stop a payroll manager signing off a pay run from this screen unless they are in v1, and none of them was in the owner's description:

| Blocking gap | Why it blocks sign-off |
|---|---|
| **B1. The per-employee bridge must balance, and show its balancing lines.** Mapped earnings + unmapped balance = gross; net + mapped deductions + balance = gross. | Otherwise the file shows a gross and a net nobody can tie to the register, and unmapped columns vanish. In `C:\ClaudeCode\samples\2025`, employee E0002's expense-reimbursement lines total **USD 3,604.74** for the year and classify as `uncategorised`: 1.3% of that person's year would silently disappear from any "total earnings" figure. Arithmetic in §8.1. |
| **B2. "No upload for this month" and "not paid this month" are different facts and must render differently.** | Conflating them invents either a leaver or a zero. A zero in the denominator of an average understates it by exactly the share of missing slots; §5.2, §8.2. |
| **B3. Duplicate rows for one employee in one period must be surfaced, never resolved silently.** | Clarivo already holds two incompatible answers: the comparison engine **refuses** (`DuplicateEmployeeIdsError` in `C:\ClaudeCode\packages\payroll-core\src\comparator.ts`), while `C:\ClaudeCode\apps\web\src\server\routers\annual.ts` and `C:\ClaudeCode\packages\db\src\aggregates\periodComponentTotals.ts` keep one row via `DISTINCT ON … ORDER BY created_at DESC`. The Employee File must not become a third, quieter answer. §7.3. |

Everything else is marked **E** (essential for v1) or **N** (nice to have, and which release it belongs in is the architect's call).

---

## 1. Scope, audience, access

### 1.1 What the feature is

A read-only, per-person payroll record assembled across periods and keyed on `employee_snapshots.employee_external_id`. It answers four questions a payroll admin asks daily and that Clarivo cannot answer at all today:

1. What have we paid this person this year, and does it tie to the register?
2. When did their pay change, by how much, and which component moved?
3. Which of their components are recurring and which were one-offs?
4. Is anything in their record arithmetically impossible, or unexplained?

It is not an HR record, not a system of record, and never writable (§10).

### 1.2 Access — and a policy conflict that must be resolved in the same change

The owner decided: **admin and manager**, both see full pay detail. The code currently says the opposite.

- `C:\ClaudeCode\apps\web\src\server\routers\employees.ts` is `adminProcedure` throughout, with the stated rule *"a manager who may edit company settings should not automatically be able to read every salary."*
- `C:\ClaudeCode\apps\web\src\server\trpc.ts` rejects non-admins with *"Employee-level figures require the admin role."*

Required (**E**):

- Add a **new** procedure for this read over `memberProcedure` (so `ctx.companyId` is already resolved). Do **not** reuse `editorProcedure`. `EDITOR_ROLES = ["admin", "manager"]` is the same role set today, but it means "may change company-wide settings"; sharing the constant means a later change to who may edit the budget silently changes who may read every salary.
- Update the comment block in `employees.ts` in the same commit, so the repository does not carry two contradictory policies.
- **"Manager" does not mean "my team."** Clarivo stores no reporting line (§11). A manager sees every employee in the company. Put that in one line of UI text under the list title rather than letting the role name imply scoping that does not exist.
- Log the read: who viewed or exported which employee's file, for which range, when. `annual_audit_log` records category and budget *changes*, not reads; this needs its own table (§11). It is small, and it is what makes the accountability claim on `/security` true for the most sensitive screen in the product.

### 1.3 Navigation and routes

- `NAV_ITEMS` in `C:\ClaudeCode\apps\web\src\lib\constants.ts`: insert `{ label: "Employee File", href: "/employees", icon: "Users" }` as the **first** entry, above Dashboard.
- **Trap:** `C:\ClaudeCode\apps\web\src\components\shared\sidebar.tsx` resolves icons through a literal `iconMap`. A nav item whose icon string is not a key renders with no icon and no error. Add the import and the map entry in the same commit.
- Active state needs no change: the sidebar compares `"/" + pathname.split("/")[1]`, so `/employees/E0002` highlights the item.
- Routes: `/employees` (list) and `/employees/[externalId]` (file), both under `(main)`, both `export const dynamic = "force-dynamic"`. A statically rendered protected page has already leaked a cached auth response in this product (`docs/Annual_Dashboard_Spec.md`, global rule 4).
- The URL key is the **external id**, not a snapshot UUID: a snapshot id changes every period, so a bookmark would rot monthly. URL-encode it — ids like `EMP/0012` and `0012 A` exist in real registers. Every fetch re-checks tenancy; an out-of-tenant id answers NOT_FOUND, never FORBIDDEN, so the error does not confirm the id exists (the rule `employees.ts` already follows).

---

## 2. The data contract

### 2.1 What exists, and what each field costs to use

| Field | Source | What this feature must know |
|---|---|---|
| `employee_external_id` | `employee_snapshots` | The only stable key. **Not** unique per period — §7.3. |
| `employee_name` | per period | Can change (marriage, re-transliteration). Latest in range for display; all prior values searchable and in the change log. |
| `department` | per period, nullable | One employee can hold several across a year. `'Unassigned'` is the convention `period_component_totals` already uses for null. |
| `hire_date`, `termination_date` | nullable | Present only if the company mapped a column. Constraint `employee_snapshots_dates_ordered` guarantees termination ≥ hire when both exist. Absent in every current sample. |
| `fte` | `numeric(6,3)`, nullable | Constraint permits > 1 (registers that express overtime as FTE), so never treat > 1 as corrupt. |
| `components` | `jsonb`, keys are the register's own column names | A value may be `null` (blank cell) or a number. `null` ≠ 0 — §7.14. |
| `gross_salary`, `net_salary` | `numeric(20,3)` | Drizzle returns **strings**. Scale 3 so a KWD fils survives. |
| `currency_code` | per period | Never summed across values. |
| `dimensions` | `jsonb`, open-ended | Location, cost centre, grade, job title, contract type — **only if mapped**. Discovered, never assumed. Blank cells are omitted rather than stored as `""`, so "has no location" is a real, queryable state. |
| period window, cadence, `status`, `control_total_gross/net` | `payroll_periods` | `status = 'ready'` only. The control totals are what the admin asserted the register printed. |

`period_component_totals` is per-period **per-department**, with no employee dimension and no gross/net columns. It is therefore **unusable** for this feature: every figure comes from `employee_snapshots`. State that in the implementation plan so nobody builds a half-fallback.

### 2.2 Notation used by every formula in this document

- **Scope** — one `(period_type, currency_code)` pair at a time, as the annual engine does. A company with more than one gets a selector; values are never combined.
- **R** — the ordered expected slots for the selected range, from `generateExpectedPeriods(cadence, year, anchor, fiscalStartMonth)` in `C:\ClaudeCode\packages\payroll-core\src\annual\periods.ts`.
- **Ready, deduped periods** — `payroll_periods` with `status = 'ready'` in scope, deduplicated by `(period_type, period_start, period_end)` keeping the newest `created_at` (the `dedupePeriods` rule). Each survivor is placed on a slot by `assignSlot()` — **never by comparing end dates**.
- **C ⊆ R** — covered slots: slots with at least one period assigned. Several periods on one slot (an off-cycle bonus run, a correction run) are merged, as `groupBySlot` does.
- **P(e) ⊆ C** — slots in which employee *e* has at least one snapshot row.
- **rows(e,p)** — every snapshot row for *e* across the periods assigned to slot *p*.
- **gross(e,p)** = Σ `Number(gross_salary)` over rows(e,p); **net(e,p)** likewise.
- **comp(e,p,k)** = Σ `Number(components[k])` over rows(e,p) where the key is present and non-null; *absent* when no row carries it.
- **cat(k)** = the company's saved `component_categories.category` if any, else `classifyComponent(k)` (`C:\ClaudeCode\packages\payroll-core\src\annual\classify.ts`), else `uncategorised`. The same three-step resolution the annual engine uses — one classifier, one answer, or the two features will disagree about the same column.
- **E(e,p)** = Σ comp over keys with cat ∈ `EARNING_CATEGORIES`.
- **D(e,p)** = Σ |comp| over keys with cat ∈ `EMPLOYEE_DEDUCTION_CATEGORIES` (absolute value, matching `buildCategoryTotals`).
- **W(e,p)** = Σ |comp| over keys with cat ∈ `EMPLOYER_COST_CATEGORIES`.
- **earnBal(e,p)** = gross(e,p) − E(e,p) — the per-employee twin of `other_earnings_balance`.
- **netBal(e,p)** = gross(e,p) − net(e,p) − D(e,p) — the per-employee twin of `balance`.
- **recurring(e,p)** = Σ comp over keys with cat ∈ {`base_salary`, `allowance`}.
- **variable(e,p)** = Σ comp over keys with cat ∈ {`bonus_commission`, `overtime`, `other_earning`}.
- **q(cur)** = `smallestUnit(minorUnits(cur))` — 0.01 USD, 0.001 KWD, 1 JPY. Every "is this zero" and "did this change" test uses q, never a hardcoded 0.01.
- Money crosses the boundary exactly once: `Number(string)` on read, the `annual-utils.ts` formatters on write. Those use `currencyDisplay: "code"`, so every figure reads `USD 1,234.56`, never `$1,234.56`, and the two conventions are never mixed in one card.

### 2.3 Per-employee-slot `kind` — four values, as CLAUDE.md requires

| kind | Condition | Rendered as |
|---|---|---|
| `actual` | slot ∈ C, exactly one row in rows(e,p) | the value |
| `duplicate` | slot ∈ C, `rows(e,p)` has more than one row | the value, flagged, excluded from every rate and average |
| `not_paid` | slot ∈ C, `rows(e,p)` empty | an explicit "not paid" cell — this is a **fact** |
| `missing` | slot ∈ R, slot ∉ C | a gap — **unknown**. Never 0, never dropped from the slot list |

This distinction is the single most important modelling decision in the feature. §5.2, §7 and §8 depend on it.

### 2.4 "Current year" when the company runs a fiscal year

`companies.settings.fiscalStartMonth`, read through `normaliseFiscalStartMonth`, is the only source. Every boundary comes from `C:\ClaudeCode\packages\payroll-core\src\annual\fiscal.ts` (`fiscalYearInterval`, `fiscalYearOf`, `fiscalMonths`, `fiscalYearLabel`). A fiscal year is labelled by the calendar year it starts in: start month 4 makes fiscal 2026 run 2026-04-01 to 2027-03-31, labelled `FY2026/27`.

**Default year = `fiscalYearOf(latest ready period's period_end, fiscalStartMonth)`, not the fiscal year containing today (E).** If the newest upload is October 2026 and today is February 2027, defaulting to today's fiscal year opens an empty file on a company with eighteen months of data. When the default is not the fiscal year containing today, the header says so: `FY2026/27 · latest data Oct 2026`.

### 2.5 What `annualSalariesLive` does and does not gate

The switch in `C:\ClaudeCode\apps\web\src\config\launch.ts` is read at six call sites, every one of them marketing: three in `app\llms.txt\route.ts`, and one each in `components\marketing\sections\alerts.tsx`, `features.tsx` and `pricing.tsx`. **No route in the signed-in app reads it.** It gates **public copy**, not library code. Therefore:

- Using the pure helpers in `packages/payroll-core/src/annual/` — `assignSlot`, `generateExpectedPeriods`, `dedupePeriods`, the `fiscal.ts` functions, `classifyComponent`, `buildCategoryTotals`, `CATEGORY_LABELS` — is **not gated and is required**. One calendar model, one classifier.
- Calling `annual.getSummary`, or rendering `components/annual/*`, is **not permitted in v1**: that surface is company-level rather than per-employee, has never been walked through in a browser (the reason the switch is off), and coupling a shipping feature to an unreleased one makes the release of either conditional on the other. Reuse the *formatters* from `annual-utils.ts` — they are presentation helpers, not the gated feature.
- Anything requiring `forecast.ts`, `scenario.ts` or `annual_budgets` is out of v1 and marked **blocked** in §6.4 with the reason.

---

## 3. The list view

### 3.1 Default scope, and why

**Default: "Paid in range", with the range set to the current fiscal year to date (E).** An employee is listed when `P(e)` is non-empty.

The payroll question is "who did we pay", and that is the only scope whose row count can be reconciled against anything. Three scopes, as a visible segmented control, never a hidden default:

| Scope | Definition | What it is for |
|---|---|---|
| **Paid in range** (default) | `P(e) ≠ ∅` | reconciling a year, a quarter or one period |
| **Currently employed** | *e* appears in the latest covered slot in scope, and `termination_date` is null or later than that slot's end | "who is on the payroll now" |
| **Everyone on record** | *e* has a row in any ready period in scope, ignoring the range | finding a leaver from two years ago |

**A leaver never simply vanishes (E).** Under "Paid in range" a mid-year leaver appears with a `Left` badge and their last paid slot. Under "Currently employed" they are excluded — but the list footer states the count: *"14 people paid in FY2026 are not currently employed. Switch to Paid in range to see them."* A filter that drops rows without saying how many is how a payroll total gets signed off short.

### 3.2 Columns

Default-visible, in this order. Each earns its place by a decision it supports without opening the file.

| # | Column | Why it earns its place | Pri |
|---|---|---|---|
| 1 | **Employee** — name, external id beneath | Names repeat and change; the id is the matching key and the thing you quote to the payroll provider | E |
| 2 | **Status** — Active / Left *slot* / Joined *slot* / Rehired / Not paid in range | The most common reason a figure looks wrong | E |
| 3 | **Flags** — count, worst severity first | Criticals must be findable from the list, or the exceptions are only visible one employee at a time | E |
| 4 | **Department** (latest in range) | The grouping used everywhere else in the product | E |
| 5 | **Last paid slot** — the `ExpectedSlot` label, e.g. `Oct 2026` | Distinguishes a leaver from a gap in uploads at a glance | E |
| 6 | **Latest gross**, with currency code | The figure a manager recognises from the register | E |
| 7 | **Latest net** | What left the bank | E |
| 8 | **Paid periods** — `n / m`, m = covered slots in range | The denominator, on the face of the list. Without it, every average in the product is a trap | E |
| 9 | **Range gross** — Σ gross(e,p) over P(e) | Cost of this person so far this year | E |
| 10 | **Recurring pay** — recurring(e, latest clean paid slot) | The run rate, separated from a bonus month; the number an increase decision is made against | N |
| 11 | **FTE** | Rendered only when some row in scope has a non-null `fte`. An always-blank column is worse than no column | N |
| 12 | Discovered dimensions — location, cost centre, grade, job title, contract type | One column per key that actually exists | N |
| 13 | **Hire date / tenure** | Only when `hire_date` is mapped, and read §7.5 before computing tenure | N |

Columns 10–13 sit behind the existing column-picker pattern (`C:\ClaudeCode\apps\web\src\components\detailed-view\column-picker.tsx`, persisted in `saved_views`); reuse it rather than inventing a second mechanism. Money columns sort on the parsed number, never the formatted string. Default sort: worst flag severity, then name.

### 3.3 Filters

| Filter | Mechanics | Pri |
|---|---|---|
| **Free text** — name or external id | **Case-insensitive.** `employees.search` uses Drizzle's `like`, which in Postgres is case-sensitive, so `alice` does not match `Alice Johnson` today — use `ilike`. And search **every** name the id has carried in range, not only the latest, or a renamed employee is unfindable under the name the requester knows. | E |
| **Department** — multi-select | Distinct `COALESCE(department, 'Unassigned')` over the periods in scope. Because department is per-period, the filter must state its rule: *matches if the employee was in that department in **any** slot in range*. Anything else hides transfers. | E |
| **Employment status** | The four values from §3.1/§3.2 | E |
| **Range selector** | §5. Drives every figure on the page | E |
| **Dimension filters — discovered, not hardcoded** | Enumerate the keys that exist (`jsonb_object_keys(dimensions)` across snapshots in scope), then the distinct values per key. Render a picker **only** for a key with at least one value. "Location" is one such key and may be absent; when it is, there is no location filter and no empty one. Offer "(not set)" as a value, which is meaningful because blanks are omitted at upload rather than stored as `""`. | E |
| **Has a flag** — critical / warning / info | How an admin actually works a pay run | E |
| **Received component X in range** — overtime, a bonus, a named allowance | Cheap from `components`, and it is the question behind half of all payroll queries ("who got overtime in July?") | N |
| **Pay band** — latest gross between X and Y | Review and budget conversations | N |
| **Currency / cadence** | A **scope** selector, not a filter: changing it recomputes everything, and values are never mixed | E |

All filtering and pagination happen in SQL, scoped by `companyId` **through the join to `payroll_periods`** — `employee_snapshots` carries no `companyId`, scoping is manual in every procedure, and forgetting it is a cross-tenant leak rather than a bug. Raw SQL follows the house rule: alias every column as `"camelCase"`, parse with zod via `parseRows`, never `as unknown as`.

### 3.4 Indexing and round trips

The only index on the table is `employee_snapshots (payroll_period_id, employee_external_id, created_at DESC)` (`packages\db\src\migrations\0006_annual_indexes.sql`). Its leading column is the period, so **the per-employee history query this whole feature rests on cannot use it.** Add an index led by the employee id — `(employee_external_id, payroll_period_id)` — written `IF NOT EXISTS`, and repeat that file's production note: on a large table build it by hand with `CREATE INDEX CONCURRENTLY`, which cannot live in a drizzle migration because the migrator wraps each file in a transaction.

Budget: the list is one query plus one count; the file is one query for the employee's rows in range plus one for the calendar inputs. `db.batch([...])` sends an array as a single HTTP request on neon-http. `apps\web\test\annual-router.test.ts` already asserts a round-trip budget for the annual page; add the equivalent for these two routes so an added sequential `await` fails a test instead of quietly costing a request.

---

## 4. The employee file

Priority order top to bottom. A payroll admin opening one employee is usually mid-query, with the register open beside them.

### 4.1 Identity header (E)

Latest name, external id, latest department, employment status with the slot it is derived from, scope (cadence + currency), and the dimensions that exist as labelled chips. `hire_date`, `termination_date` and `fte` appear only when mapped; when not, the header says `Hire date not mapped` once rather than showing an em dash that reads like "no hire date on file".

### 4.2 Year summary band (E) — the default view

Six figures, each with its scope label (`To date` / `Full year`, reusing `SCOPE_LABELS`) so nothing is mistaken for a full year it does not cover:

1. Gross paid in range, and `n of m periods paid` beneath it.
2. Net paid in range.
3. Employee deductions in range, split into income tax / employee social security / other / absence.
4. Employer cost in range — or `Employer costs not mapped` when no component in range classifies to an employer category. **Never 0.**
5. Recurring pay at the latest clean period, with the slot named.
6. Variable and one-off pay in range, as an amount and a share of gross.

### 4.3 Reconciliation strip (E)

Four per-employee checks, run per slot using the identities in `C:\ClaudeCode\packages\payroll-core\src\reconcile.ts` with tolerance q(cur):

| Check | Identity |
|---|---|
| Earnings tie to gross | E(e,p) + earnBal(e,p) = gross(e,p), and `earnBal` is shown as its own labelled line whenever it is non-zero |
| Deductions tie to net | net(e,p) + D(e,p) + netBal(e,p) = gross(e,p) |
| Net not above gross | net(e,p) ≤ gross(e,p) + q |
| Net not negative | net(e,p) ≥ −q |

A breach is a finding with the slot, the expected figure, the register's figure and the difference. `samples\payroll_july_2026.csv` breaches the first identity for three employees — E001 by 300.00, E005 by 20.00, E017 by 200.00, 520.00 in total — and Clarivo ingested it, built a dashboard on it and wrote a narrative about it without a word. The Employee File is where that becomes visible per person.

### 4.4 The period table (E) — the core artefact

One row per slot in R, in calendar order, never only the slots that have data.

| Column | Notes |
|---|---|
| Slot label | from `ExpectedSlot.label` via `shortPeriodLabel`; never a raw ISO date |
| `kind` | the four values from §2.3, as a visible badge |
| Gross, Net | blank for `missing` and `not_paid`, with the reason on hover |
| Recurring / Variable / One-off | split by category, so a bonus month is legible |
| Deductions | total, expandable to the four deduction categories |
| Absence days | `formatDays`, only when an `absence_days` component exists |
| Δ gross vs previous **covered** slot | absolute and percent; `—` when the previous slot is `missing`, and the row is marked "spans a gap" |
| Flags | per-slot anomaly and reconciliation flags |

Below it, a stacked column chart of the same numbers by category. Every chart is wrapped in `components\annual\chart-frame.tsx` (role, label, and a visually hidden data table carrying the same figures), and colours are set with explicit `fill`/`stroke`, never a Tailwind class — Recharts does not apply classes to legend marks and they render black in dark mode. Missing slots break the series; they are never plotted as zero.

### 4.5 Component history matrix (E)

Rows are component keys **as the register names them**, grouped by category with `CATEGORY_LABELS` headers; columns are the slots in R; cells are values. This is the artefact a payroll admin actually wants — *when did the housing allowance start, and what was it before July* — and it is the cheapest thing in the feature to build.

Rules: blank for absent, `0.00` only when the register really says zero (§7.14); uncategorised keys are grouped last under "Not categorised", with a link to the category manager; the classifier's matched rule is available per key on hover, as the category manager already does.

### 4.6 Change log (E)

Derived, not stored. One entry per detected change between consecutive **covered** slots, each with the slot, the before and after values, and the delta:

base rate change · allowance change · new component · removed component · department change · dimension change (e.g. location, cost centre) · name change · FTE change · currency change · cadence change · first appearance · last appearance.

A change log entry across a `missing` slot is labelled "between Mar and May (Apr not uploaded)". The entry states **what moved**, never why: Clarivo has no reason codes (§11).

### 4.7 Exceptions (E)

The flags from `C:\ClaudeCode\packages\payroll-core\src\anomaly-detector.ts`, computed for **every** consecutive covered-slot pair in range, not only the latest pair: negative net, net above gross, net movement beyond tolerance, base-rate movement beyond tolerance, a new component with value, a missing employer contribution. Tolerances come from `companies.settings` with `DEFAULT_TOLERANCES` as the fallback, and the tile states which was used — a 20% net threshold is a company policy, not a law of payroll.

### 4.8 Export (N, but strongly recommended)

CSV and XLSX of the period table and the component matrix, with the scope, range, currency and coverage counts written into the sheet, not just the filename. An exported figure with no stated scope is how a forecast ends up in a board pack labelled as an actual. Reuse the `export_history` pattern; write the access log row from §1.2.

---

## 5. Period selection

### 5.1 Ranges to offer

| Range | Definition | Pri |
|---|---|---|
| **Current year to date** (default) | the fiscal year of §2.4, slots up to the latest covered slot | E |
| **Full current year** | all of R, with future slots shown as `missing` rather than forecast | E |
| **Previous year** | `year − 1`, same cadence and currency | E |
| **A single period** | one slot | E |
| **Last 3 / 6 / 12 covered slots** | rolling, counted over covered slots so a gap does not shorten the window silently | N |
| **Custom slot range** | start and end slot inside one cadence and currency | N |
| **All history** | every ready period in scope. If that would span more than one cadence or currency, it is refused with the choices listed, never silently merged | N |

The selected range is in the URL (`?year=2026&range=ytd`) so a file can be linked and reopened the same way, and so the year selector stays where the user put it — the bug `docs/Annual_Dashboard_Spec.md` was written to fix.

### 5.2 Gaps

A missing month must never silently vanish. Concretely:

1. The slot list is always R, from `generateExpectedPeriods`, not the list of periods that happen to exist.
2. A slot with no upload is `missing`: shown, labelled, and **excluded from every denominator**. It is never 0 and never skipped.
3. A covered slot where the employee has no row is `not_paid`: shown, labelled, and also excluded from rate denominators, but it **is** counted in "covered slots", because the absence is evidence (the person was not paid that period).
4. Any delta or average whose window contains a `missing` slot is labelled "spans a gap", matching `spansGap` in `C:\ClaudeCode\packages\payroll-core\src\annual\headcount.ts`.
5. Coverage is stated once at the top of the file: `9 of 12 periods uploaded · 8 paid · 1 not paid · 3 not uploaded (Apr, Nov, Dec)`.
6. The Employee File forecasts nothing. A future slot is `missing`, not an estimate (§10).

---

## 6. KPIs

Audience codes: **O** business owner, **M** manager, **A** payroll admin. All sums are over the selected range, in one currency, rounded for display with `minorUnits(currency)`.

### 6.1 Essential (E)

| # | KPI | Formula | For | Decides |
|---|---|---|---|---|
| K1 | Gross paid in range | Σ over p ∈ P(e) of gross(e,p) | O M A | The cost of this person so far; the figure that ties to the register |
| K2 | Net paid in range | Σ over p ∈ P(e) of net(e,p) | O A | Cash actually paid to this person |
| K3 | Coverage | paid = \|P(e)\|; covered = \|C\|; expected = \|R\|; not paid = \|C\| − \|P(e)\|; not uploaded = \|R\| − \|C\| | A | Whether any other figure on the page can be trusted |
| K4 | Gross-to-net bridge | gross = net + D + netBal, per slot and for the range; and gross = E + earnBal | A | Where gross went; the sign-off check |
| K5 | Average gross per paid period | K1 ÷ \|P(e)\|, excluding `duplicate` slots from both | M A | Whether a period is out of line with the person's own norm |
| K6 | Recurring pay (latest) | recurring(e, p*) where p* is the latest slot in P(e) that is neither `duplicate`, nor flagged prorated (§7.7), nor flagged final settlement (§7.6) | O M A | The run rate; the base for an increase decision |
| K7 | Base rate and its history | comp(e,p,k) for cat(k) = `base_salary`, per slot; a change is \|Δ\| > q | M A | Approving and auditing increases |
| K8 | Annualised recurring pay | K6 × slotsPerYear, where slotsPerYear = \|generateExpectedPeriods(cadence, year, anchor, fsm)\| — 12, 24, 26/27, 52/53, generated, never hardcoded | O | Budgeting a role. Labelled **annualised, not paid** |
| K9 | Variable pay share | Σ variable(e,p) ÷ K1 | O M | How much of this person's pay is discretionary |
| K10 | Overtime amount and intensity | Σ comp where cat = `overtime`; intensity = that ÷ Σ comp where cat = `base_salary` | M A | Staffing and rota decisions |
| K11 | Absence | money = Σ \|comp\| where cat = `absence_deduction`; days = Σ comp where cat = `absence_days`; share = money ÷ K1 | M A | Attendance follow-up. Days only when a days column is mapped |
| K12 | Effective deduction rate, and effective income-tax ratio | Σ D ÷ K1; and Σ comp where cat = `income_tax` ÷ K1 | A | Spotting a changed tax code or a missed exemption. **Never labelled as a statutory rate** (§6.3) |
| K13 | Total employment cost | Σ over p ∈ P(e) of (gross(e,p) + W(e,p)) | O M | True cost of the person. **Needs an employer-contributions column**; with none, the tile reads `Employer costs not mapped` |
| K14 | Employer on-cost rate | Σ W ÷ K1 | O | Pricing a hire, quoting a day rate. **Needs an employer-contributions column** |
| K15 | Exceptions | counts by severity from §4.7 plus §4.3 breaches | A | What to fix before the run is signed |
| K16 | Last paid slot and employment status | derived per §3.1 and §7.5 | O M A | Whether a leaver is still being paid, or a joiner was missed |

### 6.2 Nice to have (N)

| # | KPI | Formula | For | Decides |
|---|---|---|---|---|
| K17 | Pay increases in range | count of slots where base changed by more than q; cumulative % = (base at last paid slot ÷ base at first paid slot − 1) × 100 | M | Review cycles; whether an uplift was applied |
| K18 | Tenure | months between `hire_date` and (`termination_date` ?? latest covered slot end). Only when `hire_date` is mapped; see §7.5 for rehires | M | Entitlements, retention conversations |
| K19 | FTE-normalised recurring pay | K6 ÷ `fte`, when `fte` is present and > 0 | M | Any comparison involving a part-timer |
| K20 | Position against department peers | K6, FTE-normalised, ÷ **median** of the same for peers in the same department, cadence, currency and latest covered slot. **Hidden when peers < 5** | M | Spotting an outlier worth checking. See §6.3 |
| K21 | Share of department cost | K1(e) ÷ Σ K1 over the department in range, with the department headcount beside it | O | Where cost concentrates. See §6.3 |
| K22 | Year on year, like for like | Σ gross over slot indexes 1…k this year vs the same slot indexes last year, aligned by slot index as `yoy.ts` does, k = the last covered index common to both | O M | Growth control. Labelled part-year for a joiner |
| K23 | One-off pay in range | Σ comp where cat = `other_earning` and the classifier's rule was `one-off-earning` or `paid-leave` | A | Separating retro, arrears, severance and payouts from the rate |
| K24 | Periods since last pay change | slots since the last base change | M | Review scheduling |
| K25 | Net-to-gross ratio trend | net(e,p) ÷ gross(e,p) per slot | A | A fast tell for a changed deduction |

### 6.3 KPIs that mislead, and how to present them honestly

| KPI | How it breaks | Required presentation |
|---|---|---|
| K5 average per paid period | A bonus or retro period drags the mean. On `samples\2025`, E0002's March gross is 40,262.52 against a 19,751.14 run rate, and the twelve-month mean of 23,016.84 sits 16.53% above the Jan–Jun run rate of 19,751.14 and 11.99% above the Jul–Dec run rate of 20,553.39 | Show mean **and** recurring beside each other, with the one-off periods named. Never present the mean alone as "monthly salary" |
| K8 annualised recurring | Annualising the wrong period. E0002's March × 12 = 483,150.24 against an actual year of 276,202.12 — a 206,948.12 (74.9%) overstatement | Annualise only from a clean slot (K6's p*), name the slot in the label, and carry the scope label `Annualised` |
| K9 variable share | Meaningless over one or two periods, and seasonal. A file opened in March, after the annual bonus, shows a share no full year will match | Require ≥ 3 paid periods or show "insufficient history"; always print the window (`over 9 paid periods`) |
| K12 effective rates | Read as the statutory rate. It is a ratio observed for one person, affected by exemptions, caps, mid-year joining and absence | Label "observed, this employee, this range". Never name a country, rate or threshold (§9) |
| K14 on-cost rate | Wrong whenever employer columns are partially mapped — one mapped employer line and one unmapped reads as a low on-cost rate rather than as missing data | Show the count of employer components found; suppress the rate when `uncategorised` is non-zero in range, and say why |
| K19 / any cross-employee comparison | A 0.5 FTE part-timer looks underpaid by half | FTE-normalise or exclude; where `fte` is unmapped, state "FTE not mapped — part-timers are not comparable" and suppress K20 |
| K20 peer position | Nonsense at small headcount: with 3 peers, one person **is** the median. Also invites a performance reading the data cannot support | Median not mean; hide below 5 peers; FTE-normalised; labelled "position in range", never "underpaid"/"overpaid" |
| K21 share of department cost | At n = 3, one person is trivially a third of the cost | Always print the headcount next to the share |
| K22 year on year | A joiner's first year is part-year, so YoY growth is an artefact of the start date | Align by slot index, label part-year, and suppress the percentage when either side has fewer paid slots than the other |
| K11 absence days | `absence_days` and `other_quantity` both hold counts; a register with an "Overtime Hours" column puts hours in `other_quantity`, not days | Show quantity components under their own register names; never infer that a count is hours or days from the category alone |

### 6.4 Wanted but out of v1 (blocked, with the reason)

| # | KPI | Why not now |
|---|---|---|
| K26 | Per-employee full-year forecast | Needs `forecast.ts` applied to a per-employee slot series, which the annual engine does not produce (it forecasts company totals). It would also forecast a leaver as continuing, and a one-off as recurring, unless the one-off separation in §7.11 is in place first. Spec it as a follow-up with its own fixtures |
| K27 | Budget vs actual per employee | `annual_budgets` is company-level and annual; no per-employee budget or target exists (§11) |
| K28 | Hourly rate, cost per working day, proration check | No contracted hours and no working-day calendar (§11). Any figure here would be invented |
| K29 | Statutory compliance verdict (contribution below/above a ceiling) | Rates and ceilings change every year and are not in the product. Needs a sourced, dated rate table and Radwan's sign-off (§11, §10) |

---

## 7. Payroll correctness traps

The most valuable section. For each: what a naive implementation does, what the feature must do, and what confirms it.

### 7.1 Re-uploaded periods

A re-upload creates a **new** `payroll_periods` row: `processUpload` always inserts. Nothing deletes the old one, and both are `ready`.

- **Naive:** sum every ready period. The employee's year doubles for the re-uploaded month.
- **Must:** deduplicate by `(period_type, period_start, period_end)` keeping the newest `created_at` before anything else, exactly as `dedupePeriods` and the `valid_periods` CTE do. Show the count of superseded uploads in the coverage line, as `DUPLICATES_IGNORED` does for the annual page.
- **Confirm:** upload the same month twice; K1 is unchanged and the coverage line reads `1 superseded upload ignored`.

### 7.2 Off-cycle runs in the same month

A December bonus payroll or a mid-month correction run has different dates but belongs to the same slot.

- **Naive:** treat it as a thirteenth period, or let it overwrite the main run.
- **Must:** assign by `assignSlot` and merge, summing money, as `groupBySlot` does. The slot shows `2 runs merged` and both are listed in the period row's detail.
- **Confirm:** a 2026-12-20 bonus run plus the 2026-12-31 main run give one December slot whose gross is the sum of both.

### 7.3 Duplicate rows for one employee in one period

**The most dangerous case, and the product currently has two answers.** `matchEmployees` keeps the first row and `runComparison` **refuses** with `DuplicateEmployeeIdsError`; `annual.ts` and `rebuildPeriodComponentTotals` keep one row via `DISTINCT ON (… ) ORDER BY created_at DESC`; `payroll_periods.total_gross` is the **sum of all rows**, because `processUpload` accumulates every row.

Two consequences worth stating plainly to the architect:

1. Where duplicates exist, `payroll_periods.total_gross` and the annual engine's gross **already disagree**, by the value of the dropped rows.
2. `created_at` cannot break the tie: all rows for a period are inserted in one statement, so they share a timestamp and `DISTINCT ON … created_at DESC` picks an arbitrary row, differently between runs.

- **Must:** the Employee File reports `kind = "duplicate"`, shows the employee's period total as the **sum of all rows** (which is what ties to the register and to `payroll_periods.total_gross`), lists each row separately with its components, and excludes that slot from K5, K6, K7, K8 and every delta. The wording states the ambiguity: *"2 rows for this employee in this period. The total shown is the sum, which matches the register. If the second row is a duplicated export, both this figure and the period total are overstated."* No `DISTINCT ON`, anywhere in this feature.
- **Confirm:** a fixture with one employee twice in one month: the file shows both rows, the slot is excluded from the averages, and the employee's slot total equals the register's line sum.

### 7.4 An employee whose external id changes

A payroll provider migration renumbers everyone; the file splits in two and both halves look like a leaver and a joiner.

- **Naive:** merge on name similarity. That merges two people who share a name and splits one who married.
- **Must:** never merge automatically. Detect and report candidates — same name (normalised), overlapping department, **disjoint** slot coverage, and recurring pay within q of each other across the join — as a dismissible "possible same person" note on both files, with a link between them. Merging needs a stored decision, and no table exists for it (§11). Meanwhile the status badges must read `Left Jun 2026 (id may have changed)` rather than a bare `Left`.
- **Confirm:** a fixture where `E0007` stops in June and `100007` starts in July with the same name, department and recurring pay: both files carry the note, neither total changes.

### 7.5 A rehire

Same id, a gap, then a return. `hire_date`, if mapped at all, usually carries the **latest** hire date, overwriting the first spell.

- **Naive:** compute tenure as "latest period end − hire date", which either ignores the first spell or spans the gap and counts unpaid months as service.
- **Must:** derive **presence spans** from slot indexes — a run of paid slots, a gap of one or more `not_paid` slots (never `missing` slots), then another run. Show the spans, badge the employee `Rehired`, and never state a single tenure figure across a gap. Where `hire_date` differs between spells, show both dates as a change-log entry.
- **Confirm:** a fixture with an employee paid Jan–Mar, absent Apr–Jun, paid Jul–Dec: two spans, a `Rehired` badge, K3 reading `9 paid, 3 not paid`, and no tenure figure spanning the gap.

### 7.6 Mid-period leaver and the final settlement

The last period carries severance, notice, a leave payout and sometimes a negative recovery. `classify.ts` rules 4b and 4c already route these correctly: retro, arrears, severance, notice and payouts to `other_earning`, and end-of-service **provisions** to `other_employer_cost`.

- **Naive:** read the final period as the run rate, or as a 300% pay rise.
- **Must:** mark the last paid slot `final settlement` when any of (a) `termination_date` falls within the slot, (b) a component whose classifier rule is `one-off-earning` is present, or (c) the employee does not appear in the next **covered** slot. Exclude it from K5–K8 and from "largest increase" style rankings, and show the one-off components itemised.
- **Confirm:** a fixture leaver whose last month is base + notice + leave payout: K6 still reports the pre-settlement recurring pay, and the final slot is labelled, not averaged.

### 7.7 A joiner paid a part period

- **Naive:** treat the first period as the rate, reporting a pay rise the following month.
- **Must:** mark the first paid slot `possibly prorated` when `hire_date` falls inside the slot window, **or** when its recurring pay is below the next slot's recurring pay by more than q while no base-rate change occurred between them. Exclude it from K5–K8 with the reason shown. Say plainly that proration **cannot be proven** without a working-day calendar (§11) — the label is "possibly prorated", never "prorated".
- **Confirm:** a joiner hired on the 18th: first slot labelled, K6 taken from the second slot, no pay-rise entry in the change log between slot 1 and slot 2.

### 7.8 A transfer between departments

`department` lives on the snapshot, so one employee can hold several across a year.

- **Naive:** attribute the whole year to the latest department. Department cost then moves retroactively when somebody transfers, and two departments' year totals both change after an upload that contained no new money.
- **Must:** attribute each slot's money to **that slot's** department. The latest department is for the badge and the list column only. The file shows a department timeline; any department filter states its "in any slot in range" rule (§3.3); the change log carries a `Department changed` entry.
- **Confirm:** an employee in Engineering Jan–Jun and Operations Jul–Dec: the two departments' range totals split 6/6, and the sum still equals K1.

### 7.9 A currency change

- **Naive:** add them. `Number("1000") + Number("2000")` is fine; `"1000" + "2000"` is `"10002000"`, and both are wrong when the currencies differ.
- **Must:** scope is `(cadence, currency)`. An employee with rows in two currencies in range gets one block per currency, each with its own totals, and **no combined figure anywhere** — no FX, no "equivalent". Minor units come from `minorUnits(currency)` per block, so a KWD block keeps three decimals and a JPY block none. `formatCompact` carries a billions step so an LBP block does not render a clipped `600000.0M`.
- **Confirm:** a KWD fixture and an LBP fixture: three decimals survive in the first (a one-fils change registers as a change), and the second's compact figures read in billions.

### 7.10 A cadence change

A company moves from monthly to semi-monthly mid-year.

- **Must:** one scope per cadence; never merged. `assignSlot` run with the wrong cadence misplaces every period — a semi-monthly period evaluated as monthly collapses two slots into one. The scope selector names both, and the coverage line is per scope.
- **Confirm:** a fixture with monthly Jan–Jun and semi-monthly Jul–Dec: two scopes, 6 monthly slots covered in one and 12 half-month slots in the other, and no screen showing 18 periods in a year.

### 7.11 Retro pay and one-offs distorting every average

The reason `classify.ts` rule 4b exists: the bare-salary rule used to read "Retro Pay" as base salary, making a one-off permanent and carrying it into every remaining period of the forecast.

- **Must:** every per-period figure is reported twice — recurring and total — with the one-off components itemised. Nothing on this page annualises or extrapolates a period containing a one-off. Worked example, E0002 in `samples\2025`: recurring 19,751.14 (Jan–Jun) and 20,553.39 (Jul–Dec); one-offs and variable pay 30,770.20 across the year; reimbursements 3,604.74 uncategorised; 241,827.18 + 30,770.20 + 3,604.74 = 276,202.12 = K1. Annualising March instead overstates the year by 206,948.12.
- **Confirm:** the fixture's recurring, variable and balance lines add to gross exactly, and K8 refuses to annualise March.

### 7.12 A name change, and a reused id

- **Must:** display the latest name, keep every prior name in the change log, and search all of them. Separately: when the **same id** carries a materially different name after a gap, flag `id may be reused` — a recycled staff number is a different person, and merging their year is worse than splitting it. Neither case is ever resolved automatically.
- **Confirm:** a fixture where `E0031` is "Mariam Haddad" to June and "Omar Khalil" from September: the file shows the flag and does not present a single combined year total without it.

### 7.13 Component renamed between uploads

"Housing Allowance" becomes "Housing Allow." The matrix shows two rows with disjoint coverage, reading as one allowance stopping and another starting — and the change log reports a removed component and a new component, which is what the anomaly detector flags too.

- **Must:** detect the shape — key A's last slot is immediately before key B's first slot, same category, values within q — and surface `possible rename` on both rows. Do **not** merge: the register's names are authoritative, and the fix is a column mapping, which is where the user should be sent.
- **Confirm:** a fixture renaming one column mid-year: the note appears, both rows stay visible, K1 is unchanged.

### 7.14 Zero versus absent

`processUpload` writes `Number(val) || 0` for a present cell and `null` for an absent one — so `components` holds both.

- **Naive:** coalesce null to 0. A blank cell then reads as a removed component (a flagged event), and "received overtime this period" becomes true for everyone.
- **Must:** absent renders blank; a real 0 renders `0.00`. A delta from absent to a value is "component added"; from 0 to a value is a movement. The old anomaly rule that flagged every zero-valued component produced 3,166 flags across the twelve `samples\2025` registers, all of them the same rule — do not reintroduce it per employee.
- **Confirm:** a fixture with a blank overtime cell in one month and `0` in the next: one blank cell, one `0.00`, no added/removed component flags.

### 7.15 Sign conventions

A deduction column is stored either as a positive magnitude or a negative delta; both are fine, but only consistently. A column carrying both within one file is `MIXED_SIGN`.

- **Must:** deduction and employer categories are summed with `Math.abs`, matching `buildCategoryTotals`, so the bridge holds either way. When a key has both signs for this employee in range, flag it on that matrix row and suppress the deduction-rate KPIs for the affected slots. Never present a negative deduction as a refund unless the register is consistently negative, in which case it is a *reduction of a deduction* and the change log says so.
- **Confirm:** a fixture with a negative loan adjustment in one month only: the row is flagged, the bridge still balances, and K12 is suppressed for that slot with the reason given.

### 7.16 Impossible arithmetic

Net above gross and negative net are checked today only on the current period of a comparison.

- **Must:** run the four checks of §4.3 on **every** slot in range, so a historical breach is visible when it is being investigated, not only in the month it was uploaded. Severity `critical`, and surfaced in the list's Flags column so it is findable without opening 400 files.
- **Confirm:** `samples\payroll_july_2026.csv` surfaces three employees with an earnings-identity breach totalling 520.00.

### 7.17 Status, `ready` only, and the aggregate fallback

- Only `status = 'ready'` periods count — a `processing` period has snapshots but no aggregates and must never appear. `processUpload` writes aggregates **before** marking the period ready, so a ready period always has them.
- `period_component_totals` has no employee dimension, so this feature reads `employee_snapshots` exclusively. There is no fallback to write and none to maintain — say so in the plan, because the annual feature's dual-path rule invites copying.

### 7.18 Dates and numbers at the boundary

- `date` and `numeric` come back as **strings** (and the PGlite harness preserves that deliberately, because a driver returning JS numbers and Dates hides exactly this class of bug).
- Compare dates as `YYYY-MM-DD` strings or through `parseISO` in `annual/dates.ts`. Never `new Date(str)` in local time: a period ending `2026-10-31` becomes 30 October in a negative-offset browser, and `assignSlot` then places it in the wrong month.
- `Number()` once, at the boundary; never `parseFloat` on a formatted string; never `+` on two numeric strings.
- Code in `packages/*` must satisfy `noUncheckedIndexedAccess`; `apps/web` does not. A `Record<string, number>` lookup in the package yields `T | undefined` — hoist the key to a const before narrowing, and prefer a closed key union (`Record<Category, number>`) where the keys are known.

---

## 8. Reconciliation and tie-outs

Every figure the page asserts must tie to something a payroll manager can check. Tolerance is the currency's minor unit, absolute — not a percentage. A 2% tolerance on a 20M payroll hides 400,000.

| # | Tie-out | Rule |
|---|---|---|
| R1 | Employee period total vs register line | gross(e,p) and net(e,p) are the register's own columns, summed over rows(e,p). Never recomputed from components |
| R2 | Per-employee identities | §4.3, from `reconcile.ts`, per slot |
| R3 | Period total | Σ over employees of gross(e,p) = `payroll_periods.total_gross` within q. Where it differs, the cause is duplicate rows (§7.3) or a non-deduped re-upload (§7.1), and the file says which |
| R4 | One number per figure | The period table total, the chart total and the year band are one computation rendered three times, never three computations |
| R5 | Control totals | When `control_total_gross/net` are present, the file shows the period's agreement status. When absent, it reads `not supplied` — never "agreed" |
| R6 | Against department aggregates | `period_component_totals` applies `DISTINCT ON (employee_external_id)`; the Employee File sums all rows. With duplicates present the two differ by the dropped rows. The Employee File is authoritative for the register tie-out; the gap is reported, not hidden |

### 8.1 Worked example — E0002, `samples\2025`, FY2025, USD, monthly

Monthly gross: 19,751.14 · 19,751.14 · 40,262.52 · 24,803.86 · 19,751.14 · 19,751.14 · 20,553.39 · 20,553.39 · 22,459.77 · 20,553.39 · 21,339.85 · 26,671.39.

```
K1 gross paid              = 276,202.12
K2 net paid                = 207,329.56
gross - net                =  68,872.56
income tax (12 slots)      =  55,372.56
employee social security   =  13,500.00   (1,125.00 x 12)
D (sum of the two)         =  68,872.56
netBal = gross - net - D   =       0.00   -> the net identity holds exactly
mapped earnings E          = 272,597.38
earnBal = gross - E        =   3,604.74   (1,906.38 + 786.46 + 911.90 reimbursements)
recurring (6 x 19,751.14 + 6 x 20,553.39) = 241,827.18
variable (15,669.19 + 5,206.10 + 4,842.19 + 5,052.72) = 30,770.20
241,827.18 + 30,770.20 + 3,604.74          = 276,202.12 = K1
employer costs W (11,169.30 + 11,638.44 + 5,040.00)    =  27,847.74
K13 total employment cost  = 276,202.12 + 27,847.74    = 304,049.86
K14 on-cost rate           =  27,847.74 / 276,202.12   = 10.08%
K12 deduction rate         =  68,872.56 / 276,202.12   = 24.94%
K12 income-tax ratio       =  55,372.56 / 276,202.12   = 20.05%
K9  variable share         =  30,770.20 / 276,202.12   = 11.14%
K5  mean per paid period   = 276,202.12 / 12           = 23,016.84
K6  recurring, Dec         =                             20,553.39
K8  annualised from Dec    =  20,553.39 x 12           = 246,640.68
```

`earnBal` of 3,604.74 is why B1 is blocking: without the balancing line, "total earnings" is 272,597.38 against a gross of 276,202.12, and nothing on screen explains the difference.

The July event, stated per component rather than from gross: base 16,187.41 → 16,867.28 (+679.87, **+4.20%**); housing 2,913.73 → 3,036.11 (+122.38, **+4.20%**); transport and meal flat; recurring pay 19,751.14 → 20,553.39 (+802.25, **+4.06%**). The run-rate percentage is not the increase percentage, because two allowances are flat — which is exactly why a rate variance must be named per component, never inferred from gross.

### 8.2 Worked example — a leaver's denominator

E0001 in `samples\2025` is paid January to November, 11 slots, Σ gross 50,242.51.

```
mean over paid periods   = 50,242.51 / 11 = 4,567.50   <- correct
mean over calendar slots  = 50,242.51 / 12 = 4,186.88   <- understates by 380.63 (8.33%)
```

8.33% is exactly one twelfth: the error equals the share of slots wrongly counted. This is the arithmetic behind K3 and the `n / m` column.

---

## 9. AI text rules

The Employee File may carry written text, under the existing rules in `C:\ClaudeCode\packages\ai`.

1. **Rule-based text is never labelled as AI.** `generateAnnualInsights` returns `{ bullets, source }` with `source: "ai" | "rules"`; any text on this page follows the same shape, and the UI must not put a model name on rule-based output.
2. **Degrade, never break.** `callClaude` returns `{ text, error, model }` so a caller can tell "unavailable" from "returned nothing", and a failure is never cached as an answer. With Claude unavailable, the employee file shows the deterministic sentences and says so.
3. **Only causes the data supports.** The narrative may say *"recurring pay rose 4.06% from July, driven by a 4.20% base increase and the base-linked housing allowance"* — both components are in the data. It may **not** say "promotion", "merit review", "cost-of-living adjustment" or "performance bonus awarded for Q1": Clarivo holds no reason codes (§11). The permitted driver vocabulary is headcount, rate, mix, timing (proration, retro, unpaid leave) and one-offs, and each claim must name the component that moves.
4. **No statutory claims.** No text generated here names a country rate, threshold or ceiling. "Effective income-tax ratio 20.05%" is an observation; "the 20% band" is a claim about law, and this product does not hold the law (§11, and the project rule that a statutory rate is never stated from memory).
5. **No guess presented as a finding.** Anything inferred — a possible rename, a possible id change, possible proration — carries "possible" in the text and a statement of what would confirm it.
6. **Never a judgement about a person.** No "underperforming", "overpaid", "high absence risk". The data is a pay register; it does not support conclusions about people.
7. The prompt carries no real names. Where an AI narrative covers one employee, pass the external id and the figures, not the name — the figures are what the sentence is about.

---

## 10. What NOT to build

| Don't | Why |
|---|---|
| **A per-employee salary forecast, or "projected annual pay" from latest × periods-per-year** | Annualises bonuses, retro pay and final settlements, and forecasts leavers as continuing. The 74.9% overstatement in §6.3 is one row of real fixture data. Allowed only as K8 with a clean slot, its own scope label, and the word "annualised" |
| **Filling a missing month with an estimate** | The annual engine distinguishes `estimated` from `missing` deliberately and shows both. An employee file that estimates one person's missing month is inventing a payment to an individual |
| **Per-employee turnover, attrition or headcount rates** | Turnover of one person is 0% or 100%. These are company- and department-level measures (`headcount.ts`), and `computeHeadcountFlows` already corrects the v1 error that reported 16.7% turnover for a company where nobody left |
| **Pay-equity, gender pay gap or fairness verdicts** | No protected-characteristic data is collected, and no legitimate basis to hold it. A peer comparison over fewer than five people is noise either way |
| **"Top 10 highest paid" as a default surface on the file** | Invites comparison across currencies, cadences and FTEs, and turns a reconciliation tool into a gossip tool. A ranked report is a separate, scoped feature with explicit FTE normalisation |
| **An hourly rate (gross ÷ 173.33, or ÷ overtime hours)** | No contracted hours (§11). The divisor would be invented, and it would then be used to price work |
| **A proration calculation** | No working-day calendar (§11). "Possibly prorated" (§7.7) is the honest ceiling |
| **A statutory compliance verdict** — contribution below the minimum, above the ceiling, wrong tax band | Rates and ceilings change yearly, per country, and are not in the product. Showing an observed ratio and letting a human judge is correct; asserting compliance is not. Needs §11's rate table and Radwan's sign-off |
| **Any cross-currency total, or an FX conversion** | Project rule, and there is no rate source, no rate date, and no defensible choice of either |
| **Automatic merging of two external ids** | §7.4. One wrong merge combines two people's pay into one file |
| **Editing a snapshot, or any write to employee pay data** | The register is the system of record; corrections happen at source and are re-uploaded. A writable file creates a second truth and breaks every tie-out in §8 |
| **HR actions — terminate, change department, upload a contract** | Clarivo is not the HRIS. Each of these needs data the product does not hold and consequences it cannot deliver |
| **Contact details, address, bank account, national id, date of birth** | Not collected, and none of them is needed to reconcile a pay run. Do not add fields for them |
| **A "no anomalies — all clear" badge** | On a file where half the slots are `missing`, "all clear" is false. The honest label is the coverage line |
| **Flagging every zero-valued component per employee** | Already measured: 3,166 flags across twelve registers, all one rule, none actionable |

---

## 11. What the spec needs and Clarivo does not collect today

Listed separately so none of it is mistaken for buildable work. Each item blocks something named above.

| Missing data | Blocks |
|---|---|
| **Reporting line / manager of record** | Team-scoped manager access, span of control, "my team" filter. Without it, "manager" means company-wide access (§1.2) |
| **Reason codes for a change** (promotion, merit, correction, retro adjustment, statutory uplift) | Any narrative that names *why* pay moved (§9.3). Drivers can only ever be attributed to a component, not to a cause |
| **Effective date of a rate change** | Change dates are only period-granular. "Increase effective 16 July" is not expressible |
| **Contracted hours, FTE calendar, working days per period** | Hourly rate, cost per working day, a real proration check (§7.7), overtime as a share of contracted hours |
| **Pay grade / band structure** (min, midpoint, max per grade) | A real compa-ratio. K20's peer median is the only honest substitute, and only above five peers |
| **Statutory rate and ceiling tables, per country and year, with source and effective date** | Every compliance check in §10, and any statement about a tax band or a contribution ceiling |
| **Bank file and GL journal totals** | The three-way tie-out (register → bank → journal). Only register-vs-computed is possible today, and only where `control_total_gross/net` were supplied |
| **An employee identity link table** (id changes, rehires, merges, with who decided and when) | Automatic or even persisted resolution of §7.4 and §7.5. Today the file can only detect and report |
| **An employee-file access log** | §1.2's accountability requirement |
| **Second contract / multiple concurrent employments for one person** | Distinguishing a genuine second payment from a duplicated export (§7.3) without asking the user |
| **An off-cycle run marker on `payroll_periods`** | Telling a bonus run from a correction run; today both are inferred from slot merging (§7.2) |
| **Cost-centre splits** (one employee's cost allocated across several) | Any cost-centre total that is not "all of this person's pay to one code" |
| **A period-level "final run for a leaver" marker** | §7.6 currently infers the final settlement from components and absence in the next slot |

---

## 12. Fixtures and acceptance checks

### 12.1 What the current samples cover — and do not

Profiled across `C:\ClaudeCode\samples\2025` (twelve monthly CSVs, 180 distinct employees):

| Case | Present? |
|---|---|
| Full-year employees | yes — 108 of 180 |
| Joiners and leavers | yes — 72 partial-year employees |
| One-off bonus and overtime spikes | yes — March, November, December |
| Absence days | yes |
| Employer contributions | yes — `Social Security Employer`, `Health Insurance Employer` |
| Uncategorised earnings | yes — `Expense Reimbursement`, 321,539 company-wide |
| **Mid-year gap / rehire** | **no — 0 employees** |
| **Department transfer** | **no — 0 employees** |
| **Duplicate employee id in a period** | **no** |
| **Name change, or a reused id** | **no — 180 ids, 180 names, 1:1** |
| **`hire_date`, `termination_date`, `fte`** | **no — not a column in any sample** |
| **Any `dimensions` column** (location, cost centre, grade, job title, contract type) | **no** |
| **Non-USD, three-decimal or large-value currency** | **no** |
| **Semi-monthly, weekly or 26th-to-25th cadence** | **no** |
| **A re-uploaded period** | **no** |

`samples\payroll_june_2026.csv` and `samples\payroll_july_2026.csv` have identical 20-person rosters — no joiners and no leavers — and July breaches the earnings identity by 520.00 across E001 (300.00), E005 (20.00) and E017 (200.00). Useful for §4.3; useless for everything else in this spec.

**So the Employee File has fixture coverage for roughly a third of its own correctness traps.** The fixtures below are a precondition for the feature, not a follow-up. All anonymised and synthetic, in `samples\`, following the existing generator pattern (seeded, reproducible, with a README stating what the engine should make of them).

### 12.2 Fixtures required

| Fixture | Must contain | Proves |
|---|---|---|
| `employee-file/monthly-usd` | 12 months, mapped `Hire Date`, `Termination Date`, `FTE`, and `Location`, `Cost Centre`, `Grade`, `Job Title`, `Contract Type` dimensions | dimension discovery, FTE normalisation, tenure, §3.3 |
| `employee-file/leaver-settlement` | a leaver whose final month carries `Notice Pay`, `Accrued Leave Payout`, a negative `Loan Recovery` | §7.6, §7.15, K23 |
| `employee-file/joiner-prorated` | a joiner hired on the 18th, first month below the second | §7.7 |
| `employee-file/rehire` | paid Jan–Mar, absent Apr–Jun, paid Jul–Dec, two different `Hire Date` values | §7.5, `not_paid` vs `missing` |
| `employee-file/transfer` | one employee, Engineering Jan–Jun, Operations Jul–Dec | §7.8 |
| `employee-file/duplicate-row` | one employee twice in one month, same id, different components | §7.3 — the `kind = duplicate` path |
| `employee-file/reupload` | the same month twice, different `created_at`, different totals | §7.1 |
| `employee-file/id-change` | `E0007` stops in June, `100007` starts in July, same name and recurring pay | §7.4 |
| `employee-file/reused-id` | `E0031` with a different name after a three-month gap | §7.12 |
| `employee-file/renamed-column` | `Housing Allowance` → `Housing Allow.` mid-year | §7.13 |
| `employee-file/gap` | months 4, 11 and 12 absent from the upload set | §5.2, every denominator |
| `employee-file/kwd-semimonthly` | KWD, three decimals, 26th-to-25th semi-monthly cycle, 24 slots | `assignSlot` on `bi_monthly`, minor units, a one-fils change registering |
| `employee-file/lbp-weekly` | LBP, large values, weekly cadence with a 53rd slot | `formatCompact` billions step, generated slot counts |
| `employee-file/retro` | a `Retro Pay` line in one month and `Arrears` in another | §7.11, classifier rules 4b |
| `employee-file/mixed-sign` | a deduction column positive in ten months and negative in one | §7.15 |
| `employee-file/impossible` | one row with net above gross, one with negative net | §7.16 |
| `employee-file/multilingual` | SAP wage-type texts, French (`Salaire de base`, `Charges patronales`, `Congés payés`, `Maladie`) and transliterated Arabic (`Rateb Asasi`, `Badal Sakan`, `Mukafaa`) headers | the classifier and the matrix's category grouping; `Maladie` raises the existing ambiguity question |

### 12.3 Acceptance checks, stated as assertions

1. For every fixture and every employee: Σ over slots of gross = the sum of the register's gross column for that employee, exactly, to the currency's minor unit.
2. For every fixture: Σ over employees of gross(e,p) = `payroll_periods.total_gross` for p, except in `duplicate-row` and `reupload`, where the stated difference is reported on screen.
3. `gap`: the slot list has 12 entries, 3 `missing`; K5's denominator is 9 or fewer; no chart series plots a zero for a missing slot; the coverage line names Apr, Nov and Dec.
4. `rehire`: two presence spans; no single tenure figure; `Rehired` badge; `not_paid` slots counted in covered, excluded from paid.
5. `transfer`: the two departments' range totals split 6/6 and sum to K1.
6. `duplicate-row`: the slot is `duplicate`, both rows are listed, the slot total is the sum, and K5–K8 exclude it.
7. `reupload`: K1 is identical with and without the superseded upload, and the superseded count is 1.
8. `kwd-semimonthly`: a 0.001 change is detected as a change; 24 slots in the year; every figure prints three decimals.
9. `leaver-settlement`: K6 equals the pre-settlement recurring pay; the final slot is labelled and excluded from averages.
10. `impossible`: two `critical` flags, both visible in the list's Flags column without opening a file.
11. No screen, export or narrative anywhere combines two currency codes in one total.
12. Every AI-written sentence on the page names a component that exists in the data, and no sentence names a cause, a country or a statutory rate.

---

## 13. Proposed rule changes, for the main session or the test engineer

Two classifier changes this feature makes worth making. Each is small, each needs the cases listed, and neither should be made inside the Employee File work.

### 13.1 A `reimbursement` earning category

**Header:** `Expense Reimbursement` (and `Frais professionnels`, `Remboursement`, `Note de frais`, `مصاريف`).
**Today:** no vocabulary match, so `uncategorised` — which is why the `samples\2025` company shows an earnings balance of 321,539 "by design", and why E0002's 3,604.74 of refunded expenses sits outside mapped earnings.
**Should be:** a new category, inside gross (the register puts it there), excluded from `variable`, from `recurring`, from K9's numerator and from K8. It is not pay: it is a repayment of money the employee already spent, and counting it as an earning overstates both the variable-pay share and the cost of the role.
**Cases that prove it:** `Expense Reimbursement` → `reimbursement`; `Travel Expenses` → `reimbursement` (today `transport` makes it an allowance, which is wrong for a refund and right for a travel allowance — so this one needs Radwan's call on the register's meaning); `Transport Allowance` → `allowance` unchanged; the bridge for `samples\2025` still balances with the new category mapped; variable-pay share for E0002 moves from 12.4% (if reimbursements were counted) to 11.14%.
**Not for this feature to change:** it moves money between buckets for existing customers, so it needs a saved-category migration decision and sign-off.

### 13.2 `absence_days` versus `other_quantity` is too coarse for a per-employee view

`Overtime Hours` and `FTE` both land in `other_quantity`, so a per-employee "quantities" block cannot label its own rows. The Employee File's answer (§6.3) is to show quantity components under their own register names and infer nothing. If a future KPI needs "overtime hours", the category needs splitting (`absence_days`, `overtime_hours`, `other_quantity`) rather than a name heuristic at the point of use.

### 13.3 Open questions for Radwan

1. **Manager access.** Confirmed as company-wide read of full pay detail, overriding the admin-only rule in `employees.ts`? And is a read access log acceptable as the control that makes that safe?
2. **Default list scope.** "Paid in range" rather than "currently employed" — agreed? It is the scope that reconciles, but it means a leaver appears by default.
3. **`Travel Expenses`-type headers**: refund or allowance on the registers you have seen? §13.1 cannot be settled without it.
4. **Duplicate rows:** is "sum and flag" the right default for the Employee File, given the comparison engine refuses outright? The alternative is to refuse the employee's totals too, which is more consistent and less useful.
