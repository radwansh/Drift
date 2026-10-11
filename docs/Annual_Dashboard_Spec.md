# Drift - Annual Salaries Dashboard: Instructions for Opencode (BigPickle)

*Prepared for Radwan | Drift | 7 October 2026 | Baseline: production commit 5b56bcc on main ('fix KPI overlap and add yearly totals section')*

## 0. How to use this document

**For Radwan**

- Save this file in the repo as `docs/ANNUAL_DASHBOARD_SPEC.md`, then give Opencode one stage at a time: *Read docs/ANNUAL\_DASHBOARD\_SPEC.md. Execute Stage N only, following the Global Rules. Stop when its checks pass and report.*
- Stage 0 changes nothing. Review each report and diff before starting the next stage.
- Work on branch `feat/annual-dashboard`: Vercel builds a preview for every pushed branch. Merge to main only after checking the preview. Make sure the Preview environment has the same variables as Production (DATABASE\_URL, Clerk keys, ANTHROPIC\_API\_KEY), or the preview cannot sign in or read data.
- If production breaks after a merge, use Instant Rollback to the previous deployment in Vercel.

## 1. Context for Opencode

Drift compares payroll between periods for mid-market companies. Stack (verify in Stage 0): Next.js 15 App Router, TypeScript, Tailwind 3 + shadcn/ui, Recharts, tRPC, Drizzle ORM on Neon Postgres, Clerk auth, hosted on Vercel. Data: `payroll_periods` (type, start/end date, status, currency) and `payroll_records` (one row per employee per period: employee id, name, department, gross, net, currency, and a `components` JSONB whose keys come from each customer's mapped spreadsheet columns).

**Your job:** (a) remove the yearly totals table added to the Dashboard in commit `5b56bcc`; (b) build a separate **Annual Salaries Dashboard**, reachable from the left menu, whose year selector stays on the chosen year until the user picks another.

**Out of scope, do not touch:** Dashboard cards, charts, period selector and AI banner; Detailed View; upload wizard; Clerk middleware and auth config; billing; the landing page and its Zoho/Resend flows.

## 2. Global rules (every stage)

1. **Do not guess.** Verify every path, table, column, enum value and type in the code or schema. If something cannot be found, stop and report it.
2. **Smallest additive diff.** Do not rename, move or reformat existing files. Reuse existing patterns (tRPC setup, org-scoping helper, Card/Select/Table/Skeleton/Dialog, money formatter, AI helper). No new dependency except a test runner if none exists.
3. **Tenant safety.** Filter every query by the caller's organization with the same helper existing routers use. Validate inputs with zod. SQL uses Drizzle's `sql` template with bound parameters, never string concatenation.
4. **Next.js 15.** `searchParams`, `params` and `cookies()` are async: always `await` them. Protected pages must be dynamic (`export const dynamic = 'force-dynamic'`): a statically rendered protected page can get a bad auth response cached at the edge and replayed to everyone (this already happened on Drift).
5. **Money.** Never add amounts in different currencies; show the currency code on every money value. Numeric DB columns arrive as strings: aggregate in SQL, `Number()` at the edge, round to 2 decimals.
6. **Env vars.** A new runtime secret must also be added to the `env` array in `turbo.json`. (None expected.)
7. **Migrations** are additive and idempotent (`IF NOT EXISTS`). Never run one against a database yourself: write the file and print the exact command for Radwan.
8. **Verify before claiming done.** After each stage run typecheck, lint and build and paste the last lines of each. Never write 'done' on a red build.
9. **Git.** Work on `feat/annual-dashboard`; one commit per stage using the message given; never push to `main`.
10. **No mock data** in production paths; fixtures only in tests.

## 3. KPI catalogue

P1 = must ship in v1. P2 = after P1. P3 = optional (Stage 6).

| # | KPI | Definition | Why owners care | Pri |
| --- | --- | --- | --- | --- |
| 1 | Total Paid Salaries Up To Now | Net pay of all ready periods of the year (gross as second figure) | Cash actually paid to staff | P1 |
| 2 | Total Forecasted Salaries (full year) | Actual to date + forecast of remaining periods (net, gross, employer cost) | Year-end cost and cash planning | P1 |
| 3 | Total employer cost | Gross + employer social security + other employer costs | True cost of staff, above salaries | P1 |
| 4 | Gross-to-net bridge | Gross, income tax, employee social security, other deductions, absences, net | Where gross pay goes | P1 |
| 5 | Salary components | By category (base, allowances, bonus/commission, overtime, other): to date, forecast, full year, % of gross; expandable to the underlying columns | Pay structure and cost drivers | P1 |
| 6 | Taxes and social security | Income tax withheld, employee SS, employer SS, total statutory liability, effective tax rate | Cash owed to authorities | P1 |
| 7 | Absences | Absence deductions (amount, % of gross), absence days if mapped, top departments | Cost of lost time | P1 |
| 8 | Actual vs forecast by period | Chart of actual periods then forecast periods | Trend and seasonality | P1 |
| 9 | Headcount and turnover | Latest, average, joiners, leavers, turnover rate | Headcount drives payroll | P1 |
| 10 | Average cost per employee | Employer cost to date / average headcount, plus annualised | Benchmark and pricing input | P1 |
| 11 | Data coverage | Periods uploaded vs expected, missing ones named | Trust in the totals | P1 |
| 12 | Fixed vs variable pay | (Bonus + commission + overtime) / gross | Flexibility of the cost base | P2 |
| 13 | Employer on-cost rate | Employer contributions / gross | Hidden cost on top of pay | P2 |
| 14 | Overtime % of base | Overtime / base salary | Early sign of understaffing | P2 |
| 15 | Department view | Cost to date and forecast, share, average headcount, cost per head | Accountability by cost centre | P2 |
| 16 | Year-on-year | Same periods last year (like-for-like); forecast vs last full year | Growth control | P2 |
| 17 | Budget vs forecast | Owner enters annual budget: variance, % consumed vs % of year elapsed | Budget control | P3 |
| 18 | AI annual insights | 3-5 bullets from aggregated numbers | Quick read for non-payroll people | P3 |

## 4. Calculation contract

### 4.1 Which periods count

- Only periods with status `ready` (confirm the real enum value in Stage 0).
- A period belongs to the year of its **end date** (UTC). Implement this once in `periodYear()` and use it everywhere.
- De-duplicate: if several periods share (period type, start date, end date), keep only the newest by `created_at`.
- One cadence and one currency at a time. If the year has several period types or currencies, show a selector (default: most frequent type; the organization's default currency or the most frequent). Never mix them.

### 4.2 Component categories

Components are free-form JSONB keys, so each key must be mapped to a category before any breakdown is possible. Add table `component_categories` (id, organization\_id, component\_key, category, created\_at, updated\_at; unique on organization\_id + component\_key).

Categories: `base_salary`, `allowance`, `bonus_commission`, `overtime`, `other_earning` (earnings); `income_tax`, `social_security_employee`, `other_deduction`, `absence_deduction` (employee deductions); `social_security_employer`, `other_employer_cost` (employer costs); `absence_days`, `other_quantity` (quantities, not money); `ignore`; `uncategorised`.

Resolution per key: (1) saved row in `component_categories`; (2) `classifyComponent(key)` heuristic; (3) `uncategorised`.

Heuristic: lowercase, replace underscores and hyphens with spaces, strip accents; first match wins in this order:

1. Quantities: days/hours/hrs together with absence/leave/unpaid -> `absence_days`; hours/hrs/days alone -> `other_quantity`.
2. employer or company together with social/pension/insurance/contribution (or nssf, gosi, cnps) -> `social_security_employer`; other employer-side levies or funds -> `other_employer_cost`.
3. absence, unpaid, lwop, no pay, lateness -> `absence_deduction`.
4. tax, paye, withholding, wht, impot, steuer, irpef, irpp -> `income_tax`, but NOT taxable, tax base, tax free, pre-tax.
5. social, pension, retirement, provident, national insurance, ssn, nssf, gosi, pifss, cnps, inss -> `social_security_employee`.
6. overtime, ot pay -> `overtime`; bonus, commission, incentive, 13th, 14th, gratuity, award -> `bonus_commission`.
7. allowance, housing, transport, travel, meal, phone, cola, per diem, hra -> `allowance`.
8. base or basic followed by salary/pay/wage -> `base_salary`.
9. deduction, loan, advance, garnish, union, recovery, fine, health insurance -> `other_deduction`.
10. Otherwise `uncategorised`.

Quantity and `ignore` categories must never enter any money total.

### 4.3 Sign convention

Spreadsheets differ: deductions may be stored positive or negative. For deduction and employer-cost categories use the absolute value of the category total; earnings keep their sign. If one deduction or employer component has both positive and negative rows in the same year, raise `MIXED_SIGN` naming the component.

### 4.4 Per-period figures (computed in SQL, not in JS loops)

- headcount = distinct employee ids; gross = sum of gross; net = sum of net; category totals from `components`.
- Balancing lines so every table adds up: `other_earnings_balance = gross - sum(earnings categories)`; `unreconciled_deductions = (gross - net) - (income_tax + social_security_employee + other_deduction + absence_deduction)`.
- `employer_cost = gross + social_security_employer + other_employer_cost`.

### 4.5 Forecast

- Elapsed = actual periods in the year. Remaining = expected future periods whose end date falls in the year, generated from the last actual period by cadence: monthly = calendar months; bi\_monthly = 1st-15th then 16th-month end; weekly = +7 days; bi\_weekly = +14 days (keep the weekday). Never hardcode 12, 24, 26 or 52.
- Method selector (default `run_rate`):
  - `run_rate`: statutory categories (income tax, employee SS, employer SS) = YTD rate x forecast gross, where rate = YTD category total / YTD gross. Recurring categories (base, allowance, other deduction, other employer cost) = last actual period. Non-recurring (bonus/commission, overtime, other earning, absence deduction) and balancing lines = average per actual period. Forecast gross = forecast earnings categories + earnings balance.
  - `average`: every category = average of the last 3 actual periods (all if fewer).
  - `prior_year`: each remaining slot = last year's same slot x g, where g = this year's actual / last year's value for the same elapsed slots, clamped to 0.5-2.0. Disabled unless last year covers at least 3 elapsed slots and 1 remaining slot.
- Forecast net = forecast gross - forecast employee deductions - forecast unreconciled. Full year = actual + forecast.
- Missing past periods are not estimated; they raise `MISSING_PERIODS`. Fewer than 3 actual periods raises `LOW_HISTORY`.
- Always print the assumption under the chart: 'Forecast assumes headcount stays as in {last period}. Method: {name}.'

### 4.6 Headcount flows

joiners(t) = ids in t not in t-1; leavers(t) = ids in t-1 not in t. For the first period of the year compare with the last period of the previous year if it exists, otherwise leave flows empty. Turnover = total leavers / average headcount; annualised = turnover x periods per year / elapsed periods.

### 4.7 Year-on-year

Align by slot (monthly: month number; others: order within the year). Compare only slots present in both years and state 'like-for-like, N periods'.

## 5. Stages

### Stage 0 - Recon (read-only, change nothing)

Run and report as a numbered list:

1. `git status`, `git log --oneline -15`, `git show --stat 5b56bcc`. That commit contains BOTH the KPI-overlap fix (keep) and the yearly totals section (remove): list its files.
2. Search for the yearly work (annual, yearly, ytd) in apps and packages, ignoring node\_modules and .next: list every file and what it does.
3. Find the sidebar (search for the label 'Payroll Periods'): component path, how items are declared, how the active item is computed, how the mobile drawer works.
4. Report paths for: the Dashboard page and its tRPC router; the existing aggregator or calculation module (a commit named 'feat(aggregator)...' exists); the org-scoping helper; the DB client; the money formatter; KPI card and chart components; the AI summary helper and its model constant.
5. Print the real schema of payroll\_periods, payroll\_records and column\_mappings: names, types, enum values (period type, status), date column types (timestamp vs timestamptz), department field, currency field, `components` type (json or jsonb).
6. Package manager; Node, Next, React and Tailwind versions; scripts for typecheck, lint, build, test; test runner if any; migration tool and how migrations are applied.
7. Anything in this spec that conflicts with what you found. End with 'Open questions' and wait for Radwan.

### Stage 1 - Remove the yearly totals table from the Dashboard

1. `git checkout -b feat/annual-dashboard`.
2. **Do NOT run `git revert 5b56bcc`**: it also holds the KPI-overlap fix. Remove by hand only the yearly totals code: the JSX section, its imports, hooks and props, helper components, types, and any tRPC procedure or query used only by it.
3. If that commit added a DB table or migration, do not delete it: report it.
4. Leave untouched: period selector, AI summary banner, KPI cards (with the overlap fix), charts, anomaly panel, department table, top movers.

Checks: grep for the removed names returns nothing; typecheck, lint and build pass; the Dashboard still has every section listed in step 4. Commit: `refactor(dashboard): remove yearly totals table`.

### Stage 2 - Menu item, route shell, year persistence

1. New route `annual-salaries`, a sibling of the dashboard route (not nested under it, so the Dashboard menu item is not highlighted too), in the same route group and layout as the Dashboard so it gets the sidebar.
2. Sidebar: add 'Annual Salaries' directly under 'Dashboard' with lucide `CalendarRange`, href `/annual-salaries`, active when the path starts with `/annual-salaries`. The Dashboard item must not be active there. Works in the desktop sidebar and the mobile drawer.
3. `page.tsx`: `export const dynamic = 'force-dynamic'`; await `searchParams` and `cookies()`; resolve the year in this order: valid `?year=` (4 digits, 2000 to current year + 1), cookie `drift_annual_year`, default (current year if it has ready periods, else the latest year with data, else current year). Render a client component `AnnualDashboard` with `initialYear`.
4. `loading.tsx` and `error.tsx` matching the Dashboard's.
5. `YearSelector` (client, shadcn Select, aria-label 'Select year'): options = years with ready periods plus the current year, descending. On change write cookie `drift_annual_year={year}; path=/; max-age=31536000; samesite=lax` and call `router.replace('/annual-salaries?year={year}')`. Other controls (period type, currency, forecast method) are also URL params and must never reset the year.
6. Temporary body: the selected year and 'Content arrives in Stage 4'. No mock numbers.

Checks: menu click opens the page; choose 2025 and reload: still 2025; go to the Dashboard and back: still 2025; `?year=abc` falls back safely; signed out -> redirected to /login (no 404). Commit: `feat(nav): add Annual Salaries route, menu item and year persistence`.

### Stage 3 - Data and calculation engine

**3.1 Migration.** Enum + table `component_categories` (section 4.2) and its Drizzle schema entry. Idempotent. Do not run it; print the command.

**3.2 Pure library** (no React or DB imports) next to the existing aggregator, or in `apps/web/src/lib/annual/`: `periodYear`, `dedupePeriods`, `generateExpectedPeriods`, `detectMissingPeriods`, `classifyComponent`, `buildCategoryTotals`, `buildForecast` (3 methods), `computeHeadcountFlows`, `computeYoY`, `computeSummary`.

**3.3 SQL** (read-only, bound parameters). Every query starts from `valid_periods` (ready, de-duplicated, year, cadence, currency). Example for component totals:

```sql
WITH valid_periods AS (
  SELECT DISTINCT ON (p.period_type, p.start_date, p.end_date)
         p.id, p.start_date, p.end_date
  FROM payroll_periods p
  WHERE p.organization_id = ${orgId} AND p.status = 'ready'
    AND p.period_type = ${periodType} AND p.currency = ${currency}
    AND p.end_date >= ${yearStart} AND p.end_date < ${nextYearStart}
  ORDER BY p.period_type, p.start_date, p.end_date, p.created_at DESC
), comp AS (
  SELECT r.payroll_period_id AS period_id, r.department, c.key AS component_key,
         CASE WHEN jsonb_typeof(c.value) = 'number' THEN (c.value #>> '{}')::numeric END AS amount
  FROM payroll_records r
  JOIN valid_periods vp ON vp.id = r.payroll_period_id
  CROSS JOIN LATERAL jsonb_each(r.components) AS c(key, value)
)
SELECT period_id, component_key, SUM(amount) AS total,
       COUNT(*) FILTER (WHERE amount < 0) AS neg_rows,
       COUNT(*) FILTER (WHERE amount > 0) AS pos_rows
FROM comp WHERE amount IS NOT NULL
GROUP BY period_id, component_key;
```

Adapt names to the real schema (real status value; cast `components` to jsonb if it is json). Four queries: Q1 per period (headcount, gross, net); Q2 the one above; Q3 employee ids per period plus the previous year's last period (joiners and leavers); Q4 department x component key for the year (department view, absences by department).

**3.4 tRPC router `annual`**, registered in the root router: `getYears` -> `{ years, defaultYear }`; `getSummary({ year, periodType?, currency?, forecastMethod? })` -> `AnnualSummary`; `listComponentCategories()` (every distinct component key of the organization with its resolved category and source) and `setComponentCategory({ componentKey, category })` (used in Stage 5).

```ts
type Money = number // 2 dp, in `currency`
interface AnnualSummary {
  year: number; periodType: string; currency: string
  availablePeriodTypes: string[]; availableCurrencies: string[]
  coverage: { expected: number; uploaded: number; lastPeriodEnd: string | null
              missing: { label: string; start: string; end: string }[] }
  totals: { actual: Totals; forecast: Totals; fullYear: Totals } // Totals = { gross, net, employerCost }
  categories: { category: string; label: string; actual: Money; forecast: Money; fullYear: Money
                pctOfGross: number | null
                components: { key: string; label: string; actual: Money; forecast: Money }[] }[]
  bridge: { label: string; actual: Money; forecast: Money; fullYear: Money }[]
  statutory: { incomeTax: Money; employeeSS: Money; employerSS: Money; total: Money
               effectiveTaxRate: number | null; employerOnCostRate: number | null }
  absences: { deductions: Money; pctOfGross: number | null; days: number | null
              byDepartment: { department: string; amount: Money }[] }
  periods: { label: string; start: string; end: string; kind: 'actual' | 'forecast'
             gross: Money; net: Money; employerCost: Money
             headcount: number | null; joiners: number | null; leavers: number | null }[]
  headcount: { first: number | null; latest: number | null; average: number | null
               joiners: number; leavers: number; turnover: number | null; turnoverAnnualised: number | null }
  perEmployee: { employerCostToDate: Money | null; annualised: Money | null }
  mix: { variablePayShare: number | null; overtimePctOfBase: number | null }
  departments: { department: string; avgHeadcount: number; actual: Money; forecast: Money
                 shareOfTotal: number; costPerHead: Money | null }[]
  yoy: { available: boolean; comparablePeriods: number
         ytdChangePct: number | null; forecastVsLastYearPct: number | null }
  forecast: { method: string; methodsAvailable: string[]; assumption: string }
  warnings: { code: string; severity: 'info' | 'warning' | 'critical'; message: string }[]
}
```

Warning codes: `MISSING_PERIODS`, `LOW_HISTORY`, `UNCATEGORISED`, `RECONCILIATION_GAP` (balancing lines above 2% of gross), `MIXED_CURRENCY`, `MIXED_CADENCE`, `MIXED_SIGN`, `DUPLICATES_IGNORED`.

**3.5 Unit tests** with the repo's runner (if none, add `vitest`) covering every scenario in section 6.

Checks: tests, typecheck, lint and build pass. Commit: `feat(annual): calculation engine, categories table and tRPC router`.

### Stage 4 - Dashboard UI (split into 4a-4d if needed)

Page title 'Annual Salaries Dashboard'. Build with existing components; a client component calls `annual.getSummary`. Top to bottom:

- **4a Header and states.** Controls: Year (always), Period type and Currency (only if more than one), Forecast method, coverage chip ('9 of 12 periods - missing: Jun 2026'). Warnings strip from `warnings` (critical red, warning amber, info blue). Skeletons while loading; empty-year state with a button to Payroll Periods; error state with Retry.
- **4b KPI cards (6).** (1) **Total Paid Salaries Up To Now**: net as the main figure, gross as second line, subtitle 'up to {lastPeriodEnd}'. (2) **Total Forecasted Salaries - Full Year {year}**: net main, subtitle 'actual X + forecast Y'. (3) **Total employer cost**: full-year forecast main, to-date second line. (4) **Headcount**: latest, 'avg A - J joiners - L leavers'. (5) **Average cost per employee**. (6) **Taxes and social security to date** (income tax + employee SS + employer SS).
- **4c Charts.** Actual vs forecast by period (toggle Net / Gross / Employer cost; actual solid, forecast lighter; assumption sentence below). Gross-to-net bridge as a waterfall (stacked bars with a transparent base series) continuing to employer cost, with a table To date / Forecast / Full year. Taxes and social security as stacked bars by period. Headcount line with joiners and leavers bars.
- **4d Tables and panels.** Salary components table by category with % of gross, expandable to underlying components; uncategorised row highlighted amber. Taxes and social security cards with effective tax rate and employer on-cost rate. Absences panel (amount, % of gross, days if mapped, top 5 departments; if nothing is mapped show 'No absence columns mapped' and a button to categorise). Department table. Year-on-year strip when `yoy.available`. Fixed-vs-variable and overtime ratios.

**Anti-overlap rules (mandatory; overlapping numbers and charts were a known complaint on this app):**

- KPI grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6`; every card `min-w-0`; no absolutely positioned icons or badges inside cards: use flex with gap and `shrink-0`.
- Card figures use compact notation (e.g. `USD 1.24M`) with `tabular-nums truncate` and the full value in `title`; tables show full values.
- Charts: wrapper `h-[300px] w-full min-w-0` with `ResponsiveContainer width='100%' height='100%'`; short axis labels (Jan, W12); `tickMargin={8}`, `interval='preserveStartEnd'`; Y axis `width={64}` with compact formatter; legend at the bottom with padding; no permanent bar labels above 12 bars; two charts side by side only from `xl`.
- Tables: wrap in `overflow-x-auto`; numeric cells `text-right tabular-nums whitespace-nowrap`; sticky first column.
- Colours: actual = primary, forecast = primary at 40% opacity. Do not use green/red for plain increases; they appear only in the budget-variance indicator (over budget red, under budget green).
- aria-label on charts and selects; never rely on colour alone.

Checks: typecheck, lint, build; test with fixtures at 1280, 1440, 1920 and 390 px wide. Commit: `feat(annual): Annual Salaries Dashboard UI`.

### Stage 5 - Category manager and data-quality UX

- Button 'Categorise components' (always visible; highlighted when `UNCATEGORISED` is present) opens a Dialog listing every component key of the organization: label, amount to date, current category (Select), source badge (Saved / Auto / Uncategorised). Save calls `setComponentCategory`, then refetches the summary.
- Show `RECONCILIATION_GAP`, `MIXED_*` and `MISSING_PERIODS` warnings, with a link to Payroll Periods for missing uploads.

Commit: `feat(annual): component category manager and data-quality warnings`.

### Stage 6 - Optional (only after Radwan approves)

- **Budget:** table `annual_budgets` (organization, year, currency, amount) and an input in the header; KPI shows budget vs full-year forecast (variance, % consumed vs % of year elapsed).
- **AI insights:** reuse the Dashboard's AI helper and model constant (do not hardcode a model). Send aggregated numbers only, never employee names or ids. 3-5 bullets; cache by organization + year + method + data hash; 'Regenerate' button.
- Export to PDF/Excel: later.

## 6. Test scenarios (Stage 3.5)

1. Monthly, 12 periods: no remaining periods; full year equals actual.
2. Monthly, 8 periods: 4 remaining; all three methods.
3. Gap (no June): flagged, excluded, not estimated. Leading gap (first upload in March).
4. Weekly year with 53 periods ending in it; bi-weekly years with 26 and 27 periods: counts come from generation, not constants.
5. Bi-monthly (1-15, 16-end) across February in a leap year (2028) and a normal year (2026).
6. A weekly period crossing 31 Dec belongs to the year of its end date.
7. The same period uploaded twice is counted once.
8. Two currencies in one year are never summed (selector appears); two cadences likewise.
9. Deductions stored positive vs negative give the same totals; mixed signs raise `MIXED_SIGN`.
10. Classifier table of at least 25 names with traps: 'Taxable Salary' is not income tax; 'Employer Social Security' is not employee; 'Absence Days' and 'Overtime Hours' are quantities.
11. Quantities never enter money totals.
12. The bridge always adds up (gross - deductions - unreconciled = net; gross + employer costs = employer cost; tolerance 0.01), including with uncategorised components.
13. Joiners and leavers, including the first period using the previous year's last period.
14. Year-on-year like-for-like with missing slots; `prior_year` disabled when data is insufficient.
15. Empty year: no NaN or Infinity anywhere; divisions by zero return null.
16. Performance: 2,000 employees x 26 periods of fixture data computes in under 1 second in the pure library.

## 7. Manual QA for Radwan

Upload at least three monthly periods (plus a prior-year set if you have one); try a missing month and a weekly set. Compare one category total with an Excel pivot of the same files. Check 1280, 1440, 1920 and 390 px widths, year persistence after reload and after leaving and returning, sign-out and sign-in, and that a second organization sees nothing from the first.
