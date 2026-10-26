# Payroll correctness audit — the steps to fix it

Audit date: 2026-10-25, by the repo's own `payroll-manager` agent against `main` @ `e0666bb`.
Plan written against `main` @ `6afd1d5`.

> **Status: steps 0, 1, 2, 3, 6, 7, 8a, 8b and 11 done. Steps 4, 5, 8a-ii, 9, 10
> and 12 outstanding.**
>
> Each step was checked against its own unfixed source — the new tests are
> re-run with that step's files stashed, and only count as binding the
> behaviour if they fail with a diagnostic naming the real defect.
>
> - **0** Tenant scoping on `employees` and `exports`. Merged as PR #5
>   (`0f227c2`), with 13 tests in `apps/web/test/tenant-scoping.test.ts`; 7 of
>   the 13 fail if the scoping is removed.
> - **1** `AggregatedSummary` carries `totalNet`, `totalGross` and
>   `incompleteTotals`; all nine component-sum proxy sites are gone and
>   `totalPayrollVariance` is net (`d93e3ff`). Three existing tests asserted the
>   proxy and were corrected against their fixture data, one of them carrying a
>   comment that spelled out the wrong arithmetic.
> - **2** A duplicated employee id refuses the comparison (`ac6522f`).
>   `DuplicateEmployeeIdsError` is thrown in `comparator.ts` before anything is
>   classified or aggregated, and `validate.ts` makes a repeated id an upload
>   error so the period is never written.
>
>   **Departs from this document deliberately:** the step below asks for a
>   `critical` anomaly per id *and* to surface it. An anomaly implies a
>   dashboard whose totals are wrong by construction, and numbers on screen get
>   used, so the figures are withheld and the refusal carries the detail
>   instead. It throws rather than returning a field, because a field a caller
>   ignores is how the original bug worked.
> - **3a** `summary.ts` `byKey` sums across periods (`d93e3ff`).
> - **3b** Bare employer insurance classifies as `other_employer_cost`
>   (`d93e3ff`).
> - **7** 46 of 46 register headers classify correctly, from 24 (`23bf69a`).
>   Transliterated Arabic went 0 to 6 of 6. The two sign errors are asserted as
>   sides of the bridge rather than as labels. Every header in `samples/` was
>   classified before and after and did not move.
>
> - **6** The run-rate forecast holds one-offs back instead of smearing them
>   (`d6cd364`). `splitRunRate` divides a variable category's actual periods
>   into a recurring floor and the one-offs above it, and `oneOffsExcluded` is
>   named on the categories table and the bridge. The three design choices were
>   measured rather than argued: leave-one-out median against the median of the
>   whole series (overtime 5.2% against 14.6% mean error), a median floor
>   against a trimmed mean (6.4% against 34.2% at the June cut), and a 3x
>   multiple against 2x (absence 7.6% against 9.7%).
>
>   **Gross at the March cut moves from −1.4% to −11.4%, and that is correct.**
>   The −1.4% was two large opposing errors cancelling; removing one side
>   exposes the other. Absence accuracy is also 0.8pp worse, declared as a
>   trade-off and asserted at that value, because its July and December peaks
>   are seasonal rather than one-off.
> - **8b** The comparison feature labels money with the company's currency
>   (`8d00c88`), `currencyDisplay: "code"` throughout, matching the annual side.
>
> **The base-salary figure is a separate defect and needs its own step.** The
> audit's −6.7% at the March cut is *not* the smearing step 6 fixed: base is
> `RECURRING`, held at the last actual period, so it never passed through
> `avgAll`. The error is the run rate carrying March's 141 heads forward through
> a year that ends at 151. Nothing above touches it. See step 12.
>
> The **`Maladie`** question from step 7 is answered, and the answer generalises
> past that one word: where the classifier cannot tell which side of the bridge
> a column belongs to, it must ask rather than choose. See step 11.

The audit's own verdict, worth keeping at the top of this document because it
decides where effort goes:

> The annual engine is sign-off grade. The comparison engine is not, and must
> not ship a number labelled "payroll" until step 1 is done.

The annual engine tied out exactly on the twelve `samples/2025` payrolls. The
comparison engine's headline KPI is neither gross nor net. That asymmetry is why
the steps below are ordered as they are: almost everything on the comparison side
is worthless to improve while the headline is wrong.

---

## Evidence: what is verified, and what is not

This matters for whoever executes the plan. **Re-measure before acting on
anything in the second table.**

### Verified directly against the source

| Claim | Evidence |
|---|---|
| `aggregator.ts` uses component-sum as a net proxy | Confirmed at **nine** sites: `aggregator.ts:28, 29, 52, 131, 204, 210, 238, 246` and `anomaly-detector.ts:59`. Every one is `Object.values(r.*Components).reduce(...)` assigned to a variable named `prevNet` / `currNet` / `previousNet`. |
| `AggregatedSummary` has no gross or net total | Confirmed — `types.ts`, the interface carries `totalPayrollVariance` and nothing else monetary at period level. |
| The data for the fix already exists | Confirmed — `types.ts:41-44` has `currentGross`, `previousGross`, `currentNet`, `previousNet` per employee. |
| `summary.ts` `byKey` overwrites instead of summing | Confirmed — `acc[k] = v` inside a `reduce` over `periodRows`. |
| `comparator.ts` discards `duplicateIds` | Confirmed — `comparator.ts:18` destructures `{ pairs }` only; `matcher.ts:51` returns `{ pairs, duplicateIds }`. |
| 520.00 unexplained gross in `samples/payroll_july_2026.csv` | Confirmed by independent arithmetic: E001 +300.00, E005 +20.00, E017 +200.00. June clean. Zero net breaks in either file. |
| `audit-summary.ts` hardcodes `$` | Confirmed at `:26, 44, 57, 62`. Line 26 reads `Total payroll ${dir} by $${absVar.toFixed(2)}` — the proxy, mislabelled, in dollars regardless of the company's currency. |
| 24 `formatCurrency(...)` calls in the comparison UI pass no currency | Confirmed by count across `components/dashboard` and `components/detailed-view`. `lib/utils.ts` defaults to `"USD"`. |

### Reported by the agent, not re-run here

These came from scratch scripts in the agent's own scratchpad. The structural
claims beneath them all checked out, which raises confidence, but the figures are
its arithmetic.

| Figure | Where it is used below |
|---|---|
| Gross `20,166,782.00` tie-out across 1,763 rows; `balance 0.00` | Context only |
| June→July proxy `+14,735` vs true net `+10,345` (42.4% high) | Step 1 |
| Jul→Aug 2025 proxy `−132,999.79` vs net `−68,516.58` | Step 1 |
| Duplicate ID case: variance `0.00` where truth is `+5,000.00` | Step 2 |
| `byKey` ratios 11.29x / 4.11x / 24.01x; the 275,239.24 contradiction | Step 3 |
| 3,166 anomaly flags across 2025, 0 critical, 100% one rule | Step 5 |
| Forecast at N=3: bonus +33.0%, base −6.7%, gross −1.4% | Step 6 |
| Employer insurance 459,000.00 misfiled (+28.7% on the statutory line) | Step 7 |
| 24 of 46 real register headers misclassified | Step 7 |

**First task of any step that cites the second table: reproduce the number.** If
it does not reproduce, stop and report rather than fixing to match a figure.

---

## The fix, in order

The order is a dependency order, not a severity order. Step 5 after step 1
because an anomaly detector tuned against the proxy would encode the bug.

### Step 1 — the comparison's money must be gross and net

**Finding:** the headline `totalPayrollVariance`, the average change, the
distribution buckets, the department totals and the top-movers table all report
the sum of every mapped component. Because deduction columns are positive in the
sample registers, that proxy equals **gross + total deductions**. The AI
narrative and audit summary then call it "total payroll".

The worst symptom is internal contradiction: in a top-movers row,
`previousNet` and `currentNet` are the proxy while `changeAmount` is the real
`netDelta`, so the three money cells in one row do not tie — under column headers
that say "Previous Net" and "Current Net".

**Change:**

1. Add `totalGross` and `totalNet` to `AggregatedSummary`, each
   `{ previous: number; current: number; absolute: number; percentage: number | null }`,
   summed from the per-employee `previousGross` / `currentGross` /
   `previousNet` / `currentNet` at `types.ts:41-44`.
2. Replace every proxy site: `aggregator.ts:28, 29, 52, 131, 204, 210, 238, 246`
   and `anomaly-detector.ts:59`. Delete the `reduce` helper entirely so it cannot
   come back.
3. Decide, once and explicitly, which figure the headline shows. The
   recommendation is **net**, because that is what leaves the bank, with gross as
   a second figure — the pattern `annual-kpi-cards.tsx` already uses.
4. Rename the top-movers fields to whatever they now hold, and fix the column
   headers to match.
5. Point `narrative.ts` and `audit-summary.ts` at the labelled figure.

**Null handling:** those four fields are `number | null`. A null gross or net
must not silently become `0` — that would reintroduce a quiet wrong total. Treat
a null as a data-quality finding and surface it.

**Verification:** a fixture where deductions are **positive** and a second where
they are **negative**, so the sign convention is pinned rather than inferred from
one sample. On `samples/payroll_june_2026.csv` → `payroll_july_2026.csv` the
headline must read the true net change, not `+14,735`.

**Data:** existing. No schema change, no new ingest.

---

### Step 2 — a duplicate employee ID must block, not vanish

**Finding:** `matcher.ts` keeps only the first row per id and returns
`duplicateIds`; `comparator.ts:18` throws it away. One person paid twice — the
classic payroll error — produces a dashboard reading "no change". Upstream,
`validate.ts` raises a duplicate id as a **warning**, so the upload completes.

**Change:** return `duplicateIds` from `runComparison`, raise one `critical`
anomaly per id, and surface it. Promote the upload check from warning to error:
a register with a repeated id should not become a `ready` period.

**Decide:** whether to sum the duplicate rows or refuse the comparison. Refusing
is the safer default — summing guesses at intent, and two rows for one person may
be a genuine second payment or a bad export.

**Verification:** three cases — a duplicate in the current period, a duplicate in
the previous period only, and the same id three times. The first must report the
true variance (the agent measured `+5,000.00` where the code returns `0.00`).

**Data:** existing.

---

### Step 3 — the one-line and one-rule corrections

Two small, independent fixes worth doing immediately because each puts a visibly
wrong number on screen.

**3a. `summary.ts` `byKey` overwrites instead of summing.** `acc[k] = v` inside a
reduce over every period, so `byKey` holds only the last period. Three consumers
render it: the expandable component rows in `annual-categories.tsx`, the
"Uncategorised components" row (which contradicts the "Earnings not categorised"
row three lines above it in the same table and column), and the whole
**Components** sheet of the Excel export, headed "Total to date".

Fix: `acc[k] = { category: v.category, total: (acc[k]?.total ?? 0) + v.total }`.

Verification: the sum of a category's children must equal the category row, on
the twelve-month 2025 fixture. Add that as an assertion, not a spot check.

**3b. Employer health insurance is classified as social security.**
`classify.ts` catches `insurance` on the employer side in the `employer-social`
rule, so private medical lands in `social_security_employer`. The statutory line
and `employerOnCostRate` are both overstated.

Fix: require a `social` or `pension` signal for `social_security_employer`; send
bare employer insurance to `other_employer_cost`.

Verification: a fixture carrying both `Social Security Employer` and
`Health Insurance Employer` must split them, and the on-cost rate must reflect
social security alone.

**Data:** existing for both.

---

### Step 4 — a reconciliation gate at upload

**Finding:** the two sums that define a correct payroll register are computed
nowhere. `validate.ts` checks a negative gross and a negative net per row as
warnings, and nothing compares net to gross. The repository's own
`samples/payroll_july_2026.csv` carries **520.00 of unexplained gross** across
three rows, and Clarivo ingests it, builds a dashboard on it and writes an AI
narrative about it without a word.

**Change:** a `Data check` panel on `/payroll-periods` that must pass before a
period becomes `ready`. Per row:

1. mapped earnings sum to the `Gross` column
2. gross minus mapped deductions equals the `Net` column
3. net ≤ gross
4. net ≥ 0
5. no duplicate or reused employee id (step 2)

Plus one period-level control total the admin can tick against the register they
exported.

**Tolerance must be absolute, not a percentage** — the currency's minor unit.
`summary.ts` currently fires `RECONCILIATION_GAP` only above 2% of gross, which
on a 20M payroll lets **403,335.64** sit unexplained inside a green bridge. Keep
the percentage trigger and add the floor.

**Verification:** `samples/payroll_july_2026.csv` must fail with exactly
`+520.00` across E001, E005 and E017; `payroll_june_2026.csv` and all twelve
`samples/2025` files must pass; a fixture 0.01 out must fail; an exactly balanced
fixture must stay silent.

**Data:** existing for the row checks. The control total needs one new field per
period.

---

### Step 5 — rebuild the anomaly detector

**Finding:** the detector flags any component equal to zero, twice per employee,
so a 150-person month where nobody worked overtime produces ~300 flags. Nothing
is ever `critical`. Meanwhile a 40% base-salary rise fires nothing at all, and
the "large net change" rule divides by the component sum rather than by previous
net, so a true +24.0% net movement computes as 16.0% and stays silent — and its
"no component changed" precondition means any real driver disqualifies the flag.

**Change:** retire the zero-component rule. Replace with an exception list a
payroll manager would recognise:

| Rule | Severity |
|---|---|
| Base rate changed beyond tolerance | warning, configurable |
| Net changed beyond tolerance, **naming the largest contributing component** | warning |
| Net exceeds gross | critical |
| Net below zero | critical |
| Duplicate or reused employee id | critical |
| Leaver paid again | critical |
| Joiner paid a full period | warning |
| A component appearing for the first time with a value | info |
| Employer contribution missing where the employee's is present | warning |

Severity must discriminate. Tolerances belong per company, in settings.

**Note on leavers:** the engine detects a leaver the period *after* their last
paid month, so the final-settlement month is never the month flagged. Any
leaver rule has to account for that or it will fire a period late.

**Verification:** on the twelve 2025 payrolls the flag count must fall by orders
of magnitude and at least one month must produce a `critical`. A payroll that is
completely unchanged except for zero-valued overtime must produce **no** flags. A
40% base rise must fire. A +24.0% net movement must fire.

**Data:** existing, except the per-company tolerances (settings) and the
leaver/joiner rules, which are stronger with hire and termination dates (step 9).

---

### Step 6 — split one-offs from the run rate in the forecast

**Finding:** `forecast.ts` routes everything that is not STATUTORY or RECURRING
to a year-to-date average per period, so a March annual bonus is smeared across
every remaining month. `VARIABLE` is declared in `forecast.ts` and exported, and
**never read by `amountFor`** — nothing distinguishes bonus from rent.

The dangerous part is not the error but that it hides: at a March cut the headline
gross reads only 1.4% off **because fictional bonus cancels understated base**. A
manager told "gross is on plan" is approving a bonus line a third over and a base
line 7% under.

**Change:** project a recurring floor per variable category — median or trimmed
mean of the actual periods — and carry the excess in each actual month as a
one-off that does not repeat. Surface it as a named
**"one-offs excluded from forecast"** line in `annual-categories.tsx` and in the
bridge, so the exclusion is visible rather than implied.

**Pairs with step 7:** retro pay and severance currently classify as recurring
base salary, so they are forecast as permanent. Fixing the forecast without
fixing the classifier leaves the same bug by another route.

**Verification:** backtest every cut N=1..11 on the 2025 fixture. Category-level
variance, not just gross — a gross figure that nets two opposing errors must not
be allowed to pass as accurate. The bonus line at N=3 must come down from +33%.

**Data:** new computation over existing data.

---

### Step 7 — close the classifier's market gaps

**Finding:** 24 of 46 real register headers misfiled. The clusters each have a
payroll consequence:

| Cluster | Currently | Should be | Consequence |
|---|---|---|---|
| `Retro Pay`, `Back Pay`, `Retroactive Salary Adjustment`, `Rappel de salaire` | `base_salary` | `other_earning` | a one-off retro becomes recurring base, permanently lifting the forecast |
| `Arrears` | `uncategorised` | `other_earning` | lands in the earnings balance |
| `Severance Pay`, `Notice Pay` | `base_salary` | `other_earning` | severance forecast forward forever |
| `Accrued Leave Payout` | `absence_deduction` | `other_earning` | **money paid to the employee booked as a deduction** — a sign error that breaks the bridge in both directions |
| `End of Service Benefit`, `Indemnity Provision`, `Gratuity Accrual` | `allowance` / `bonus_commission` | `other_employer_cost` | EOSB — a top-three employer cost in the GCC and Lebanon — lands inside gross as an employee earning |
| `Charges patronales` | `uncategorised` | `other_employer_cost` | French employer burden missing |
| `Conges payes` (paid leave, an earning) | `absence_deduction` | `other_earning` | `conge` is in the absence synonyms, so paid leave reads as unpaid |
| `Maladie` | `uncategorised` | `absence_deduction` | sick leave missing |
| `Badal Naql`, `Badal Sakan`, `Rateb Asasi`, `Mukafaa`, `Daman Ijtimai`, `Takmeen Sehi` | `uncategorised` (0 of 6) | allowance ×2, base, bonus, employee SS, other deduction | the synonym table has Arabic **script** but no Latin transliteration, which local GCC and Levant payroll software routinely exports |
| `FTE` | `uncategorised` | `other_quantity` | blocks cost per FTE |
| `Cost Centre` | `uncategorised` | `ignore` | a text column becomes `Number(val) \|\| 0` = 0, which then trips the zero-component rule for every employee |

The transliterated Arabic gap is the one that matters most for where Clarivo is
being sold.

What already passes: SAP wage-type texts, real French, and the ER/EE token forms.
The architecture is sound; the vocabulary has holes.

**Verification:** a table-driven test over all 46 headers, asserting the expected
category for each. Add headers as they are met rather than guessing at more.

**Data:** existing, except `FTE`, which needs an optional column (step 9).

---

### Step 8 — currency correctness

**8a. Three-decimal and minor-unit-free currencies lose money silently.**
`math.ts` (`roundMoney`), `delta-calculator.ts` (`round2`) and
`classifier.ts` (`THRESHOLD = 0.01`) all assume two decimals. A KWD payroll loses
fils with `balance` still reading `0.00` and no warning, because the 2% threshold
is six orders of magnitude away. A 1-fils net movement returns `netDelta: 0` and
status `unchanged`. KWD, BHD and OMR are three-decimal; LBP is minor-unit-free
with values in the billions.

Fix: a minor-unit scale on the company, threaded through the rounding helpers and
the classifier threshold.

Verification: KWD `1,172.839` → `1,172.840` must report `netDelta 0.001` and
status `increased`; **USD behaviour must be byte-identical across all 198
existing payroll-core tests**; LBP at 1,000,000,000 must not lose precision.

**8b. The comparison feature is currency-blind.** 24 `formatCurrency(...)` calls
across `components/dashboard` and `components/detailed-view` pass no currency,
and `lib/utils.ts` defaults to `"USD"` with `style: "currency"`, so an LBP or KWD
company sees `$` throughout. `audit-summary.ts:26, 44, 57, 62` hardcode `$` in
the rule-based text, and neither it nor `narrative.ts` receives a currency at all.

Fix: thread the company currency through, and use `currencyDisplay: "code"` as
CLAUDE.md requires and as `annual-utils.ts` already does. The annual side is
clean; this is the comparison side catching up.

**Data:** 8b existing; 8a needs one new field on the company.

---

### Step 9 — the data Clarivo does not yet ingest

Each of these blocks a check or a report that a payroll admin expects. Grouped
because they share one migration.

- **`hire_date` / `termination_date`** on the snapshot — without them, "leaver
  paid after their last period" and "joiner paid a full period" are not
  checkable, and those are two of the most common real errors.
- **`fte`** — cost per employee counts a half-timer as one head, so unit cost is
  not comparable.
- **Dimensions beyond department** — cost centre, location, grade, job title,
  contract type. `department` is a single column today. A dimensions JSON plus a
  dimension picker generalises the existing department views; the aggregate table
  already keys on department, so the shape carries.
- **A period control total** — see step 4.

**Data:** new. One migration, written to the repo's idempotency rule.

---

### Step 10 — the AI layer must not claim more than the engine knows

**10a. The anomaly prompt invites invented findings.** It offers a closed type
list including `duplicate_employee`, `negative_salary`, `id_mismatch`,
`missing_data` and `unusual_department_change` — **none of which any rule
produces** — and asks for "possible root causes". `anomaly.ts` maps the model's
output straight through with no validation that the employee id exists, that the
severity is one of the three allowed values, or that the finding corresponds to
something detected. A hallucinated employee lands on the dashboard as a finding.

Fix: validate every returned anomaly against the detected set and the known
employee ids; drop anything that does not match. The irony is instructive — the
prompt names exactly the rules steps 2 and 5 are adding.

**10b. "Compliance Assessment" is a claim Clarivo cannot support.** The prompt
casts the model as a "payroll compliance officer" issuing a Low/Medium/High risk
rating, and the deterministic fallback does the same. There is no statutory rule
base, no ceiling check, no filing calendar. It also has no discriminating power:
the rating is Medium whenever any warning exists, and step 5 shows every real
month carries well over a hundred.

Fix: replace with a data-quality statement about what was actually checked.

**10c. The comparison prompts lack the guardrails the annual prompt has.**
`insights/prompts.ts` says "Base every claim only on the numbers provided. Do not
invent figures", bans individual-level data and requires naming the currency.
`narrative/prompts.ts` and `audit-summary/prompts.ts` say none of that. Bring
them up to the same standard.

**10d. The AI column mapper has no employer side.** Its internal schema has 14
names and not one employer-cost concept; it maps `"Pension, Social Security,
SSS, NSSF"` to `pension_deduction`, so an **employer** NSSF column becomes an
employee deduction, inflating deductions and depressing net. The mapper's
vocabulary is strictly narrower than `classify.ts`'s 15 categories — no overtime,
no absence days, no employer social security, no other employer cost. Align it.

**What already works and must not regress:** the `"ai" | "rules"` source label.
`generateAnnualInsights` reports which produced the text, CLAUDE.md forbids
labelling rule-based output with a model name, and the audit found no violation.

**Data:** existing.

---

### Step 8a-ii — thread minor units through the annual engine

Step 8a was split while being implemented. **8a (done, `bd16655`)** built the
shared machinery and threaded it through the comparison side. **This is the
annual half**, which is a different size of job: 82 `roundMoney` call sites
across `forecast.ts`, `summary.ts`, `yoy.ts` and `scenario.ts`.

**What is already in place:** `money.ts` owns `minorUnits(code)`,
`smallestUnit(decimals)` and `roundToMinorUnits(value, decimals)`.
`annual/math.ts`'s `roundMoney` delegates to it and already takes an optional
`decimals` defaulting to 2. `computeSummary` already receives `currency`. So
no new machinery is needed — this is threading, with a hard correctness bar.

**The case it closes,** from the audit and still open: a KWD payroll of
`3,703.701` a month over three months totals `11,111.103`, and the engine
reports `11,111.10`. Three fils gone, `balance` still `0.00`, and no warning,
because the engine rounds both sides of the bridge the same way — which is
what makes the loss invisible rather than wrong-looking.

**Change:** derive `decimals` from `currency` once in `computeSummary` and
thread it to every money rounding below it, including through `buildForecast`,
`computeYoY`, the scenario layer and `buildBridge`.

**Three traps:**

- **The `Number.EPSILON` nudge.** `annual/math.ts` adds it before rounding,
  which is what makes 1.005 round up rather than down, and the annual suite
  asserts figures that depend on it. At three decimals the nudge is relatively
  larger against the quantum — verify it does not shift a KWD figure by a
  fils, and if it does, say so rather than removing a nudge the USD suite
  needs.
- **The reconciliation warning will stay silent.** `RECONCILIATION_GAP` fires
  on a percentage of gross, so a three-fils gap on an 11,111 payroll is six
  orders of magnitude below it. **Do not fix that here** — the absolute floor
  is step 4. Note it, so nobody reads a silent warning as proof the rounding
  is now exact.
- **Forecast figures are derived, not stored.** A forecast rounded at three
  decimals and then summed must still tie to the full-year total; the existing
  bridge-balances assertions are the guard, and they must hold at three
  decimals as well as two.

**Verification:**

- **Every existing USD assertion byte-identical.** 309 payroll-core tests
  today. If one moves, the change is wrong. `git diff --numstat` on existing
  test files should show no deletions.
- A KWD fixture of `3,703.701` across three months reports `11,111.103`, with
  `balance` at `0.000`.
- The bridge balances at three decimals on a fixture whose components do not
  divide evenly into two.
- A JPY fixture rounds to whole yen and its bridge still balances.

**Data:** existing. No schema change — the currency is already on the company
and already reaches `computeSummary`.

---

### Step 11 — the classifier asks when it cannot tell

**Finding:** `Maladie` on a French bulletin is usually the sick-absence
deduction, but the same word names the health-insurance cotisation. Step 7 made
it the deduction, which is right more often than not — and being right more
often than not is the problem. The column is money, and the two readings put it
on **opposite sides of the bridge**: one reduces pay, the other is a cost beside
it. A confident wrong answer there moves gross, net and the statutory line at
once, silently.

This is not a `Maladie` problem. Any vocabulary has words that two payroll
systems use differently, and no synonym table resolves that from the header
alone. **Where the classifier cannot tell which side of the bridge a column
belongs to, it must ask rather than choose.**

**The answer channel already exists end to end** — this step only has to stop
guessing and pose the question:

- `component_categories` is a per-company override keyed `(companyId,
  componentKey)` with `updatedBy`, so an answer is stored and attributed.
- `savedCategories?: Record<string, Category>` on `AnnualSummaryOptions` is
  already built from that table in `routers/annual.ts` and already wins over
  `classifyComponent`.
- `category-manager.tsx` is the surface, and it already shows which rule
  matched.
- `UNCATEGORISED` is the precedent for surfacing a component that needs
  attention.

**Change:**

1. `classifyComponentWithReason` reports **ambiguity** when the matched signals
   point at categories on different sides of the bridge — earning, employee
   deduction, employer cost, quantity. Same-side ambiguity (allowance against
   bonus) does not move a total anyone reconciles, so it must **not** raise a
   question; this is about sides, not labels.
2. The interim category is `uncategorised`, which routes the money into the
   balancing lines where it is visibly unreconciled, rather than booking it
   confidently to the wrong side. An honest gap beats a precise error.
3. A new `AMBIGUOUS_COMPONENT` warning carries the candidate categories and the
   signals that matched, so the question on screen is specific: *"Maladie could
   be a sick-leave deduction or a health-insurance contribution — which is it
   on your register?"* A warning that only says "ambiguous" makes the user do
   the classifier's thinking.
4. An entry in `savedCategories` suppresses both the ambiguity and the warning.
   The question is asked **once** per company per column, and never again.

**Verification:**

- `Maladie` is ambiguous, with both candidates named, rather than silently
  `absence_deduction`.
- `Assurance maladie` and `Mutuelle` stay unambiguous — a disambiguating signal
  resolves it.
- `Maladie` with a `savedCategories` override classifies as the override and
  raises nothing.
- A same-side pair raises no question.
- **The 46-header table from step 7 does not regress.** Every header that
  classified confidently must still classify confidently. This change can only
  add questions where there is genuine cross-side doubt — if it turns a
  settled header into a question, the ambiguity rule is too broad, and a
  classifier that asks about everything is as useless as one that guesses.

**Data:** existing. No schema change — the override table, the summary option
and the UI are all already there.

---

### Step 12 — the recurring forecast ignores headcount

**Finding:** the audit recorded base salary forecast −6.7% at the March cut, and
step 6 did not fix it, because the cause is different. Base is `RECURRING`, held
at the last actual period, so it never passed through the averaging path that
step 6 replaced. The error is that the run rate carries March's **141 heads**
forward through a year that ends at **151**: a recurring category is projected
at last month's level regardless of how many people it has to cover.

This is now the largest remaining forecast error, and with step 6 done it no
longer has an opposing error to hide behind — which is why gross at the March
cut reads −11.4% rather than −1.4%.

**Change:** project a recurring category per head and multiply by the headcount
expected in each remaining slot, rather than carrying its total. `headcount.ts`
already computes joiners, leavers and average headcount per slot, so the input
exists.

**Two things to be careful of:**

- **Do not double-count the scenario layer.** `scenario.ts` already models
  "hire N from slot X" on top of a computed forecast. If the forecast itself
  begins to extrapolate headcount, a scenario applied over it must not add the
  same heads twice.
- **Extrapolating a trend is not the same as holding a level.** A company that
  grew 141 to 151 over three months has not necessarily committed to 191 by
  December. Holding the *latest* headcount is defensible; projecting its growth
  rate is a forecast about hiring that Clarivo has no basis for. Prefer the
  former and say which was chosen.

**Verification:** the base-salary error at the March cut must improve against
the twelve-month actual, measured per category across every cut N=1..11 as in
step 6. Gross should move back toward accuracy for the right reason this time —
one error corrected rather than two cancelling. State the before and after for
every variable and recurring category, so a figure that gets worse is declared
rather than found later.

**Data:** existing. `headcount.ts` already derives the flows.

---

## Beyond correction: the one feature the audit argues for

Not a fix, so not numbered, but it is the audit's answer to the product's core
promise. A **variance bridge on `/dashboard`**: a waterfall from last period's
total to this one, with named drivers —

```
Previous gross → joiners → leavers → rate changes → bonuses & one-offs
→ overtime → absence/unpaid leave → retro & back pay → Current gross
```

each row naming the employees behind it, and the waterfall required to sum to the
actual change. The agent decomposed Jul→Aug 2025 by hand as headcount
`−147,931.98`, rate `+58,661.48`, mix `−5,231.03`, summing to `−94,500.72`, which
is exactly the actual gross move.

It needs step 1's correct totals underneath it, and step 7's classification to
separate retro from base. Build it after those, not before.

---

## Fixtures

Four of the defects above survived 285 passing tests because no fixture exercises
them. `samples/` has monthly data only. Missing, and needed by the steps that
cite them:

- semi-monthly and weekly cadences
- a register with **negative** deduction columns (step 1's sign convention)
- retro pay, severance and accrued-leave payout (step 7)
- a three-decimal currency and an LBP-scale currency (step 8a)
- a duplicate employee id, net above gross, negative net (steps 2 and 5)

All anonymised and realistic, in `samples/`, following
`packages/db/src/fixtures/annual2025.ts` for generation.

---

## What this plan does not change

- **The annual engine's calculation contract.** It tied out exactly. Steps 3a, 6
  and 7 change what feeds it and how one derived map is summed; none changes the
  bridge, the slot model or the coverage logic.
- **The slot model.** Every step that needs to know which period belongs where
  calls `assignSlot`, per CLAUDE.md. No step compares end dates.
- **`annualSalariesLive`.** It stays off until the annual steps here are done and
  step 8 of `ANNUAL_PAGE_FIX_PLAN.md` — the browser walkthrough — is complete.
- **The AI fallback architecture.** `callClaude` reporting failures rather than
  swallowing them, and the `"ai" | "rules"` label, are correct and stay.
