# Australian payroll in Clarivo

For an engineer who knows this codebase and nothing about Australian payroll.
It says what Australian payroll columns mean, where they belong in
`packages/payroll-core/src/annual/classify.ts`'s existing `Category` type, and
exactly what the Payday Super check computes — with the rule's source for every
figure, so nothing here has to be taken on trust or looked up again.

Fixtures: `samples/au/`, with `samples/au/README.md`. Six files, two
consecutive fortnights for each of Xero, MYOB and Employment Hero, carrying the
same payroll in three column vocabularies.

**This document specifies rules; it changes no code.** Section 9 lists the
defects it found, each reproducible.

---

## 0. How the sources were read, and what that costs

Statute and regulation were read **directly** from the Federal Register of
Legislation. Those citations are exact and can be checked by opening the URL.

`ato.gov.au` **refuses the fetch tool used here** (HTTP 403 on every path,
including the legal-database PDFs). ATO page content below was therefore read
through a search tool's summaries of those pages, not by opening them. Every
such citation is marked **(ATO, read indirectly)**. Before anything in this
document reaches a customer, a human should open those pages and confirm the
wording. Where no primary source could be reached at all, the line says
**to verify**.

Statutory rates and thresholds change every financial year. Nothing here is
stated from memory, and nothing here should be hard-coded without a recheck
against the ATO at the start of each financial year. **Radwan signs off payroll
rules.**

---

## 1. Deciding that a company is Australian

**The proxy, for now, is `companies.currencyCode === "AUD"`.** There is no
`country` column on the company record and no migration is being added for this
yet. Write the Australian behaviour against that proxy, and understand that it
is a proxy and not a fact.

Two known weaknesses, both of which an implementer must handle rather than
assume away:

1. **A New Zealand, Fijian, Papua New Guinean or other company that reports in
   AUD is treated as Australian.** It would get Australian pay-item
   classification and the Payday Super check.
2. **An Australian company that has not set its currency, or reports in another
   currency, is not treated as Australian.** `companies.currency_code` defaults
   to `'USD'`, so an Australian company that never touched the setting falls
   into this case. This is the likelier of the two in practice.

### 1.1 What to do in each case

**Do not gate the classifier vocabulary on the proxy.** Ship section 5's
strings globally. `Superannuation`, `PAYG Withholding`, `Annual Leave Loading`
and `STSL` are not words that appear on a French, Lebanese or Gulf register, so
a country gate in front of them buys nothing and adds a gate that can be wrong.
Gating the vocabulary would make weakness 2 actively harmful: an Australian
company left on USD would have its super column read as an unplaced earning,
which is the defect in section 9.1 and is worse than any misclassification the
ungated vocabulary could cause.

**Do gate the Payday Super check, on two signals rather than one:**

```
runPaydaySuperCheck  =  companies.currencyCode === "AUD"
                     && the register has at least one column classified
                        social_security_employer by an AU-super rule
```

The second signal is what keeps weakness 1 cheap. A New Zealand company
reporting in AUD has a `KiwiSaver Employer Contribution` column, not a
superannuation one; it matches no AU-super rule, so the check does not run and
nothing false is said. It also gives the "no super column" case (section 6.6)
for free, because it is the same condition.

**A wrong-jurisdiction match must never be silent — in either direction.**

- *Checked when it should not have been* (weakness 1): the card states its
  basis in words — "Based on this company reporting in AUD" — so a reader who
  knows the company is not Australian can see why the card is there and
  dismiss it. A card whose basis is invisible is a card nobody can correct.
- *Not checked when it should have been* (weakness 2): if the register carries
  a column the AU-super vocabulary recognises but `companies.currencyCode` is
  not `AUD`, **emit a warning rather than silently skipping**: "This register
  has a superannuation column, but the company currency is USD. Set it to AUD
  to enable the Payday Super check." A silent no-op here is the worse failure
  of the two: the employer with the real obligation gets nothing and never
  learns why.

### 1.2 Read the company's currency, not the period's

`payroll_periods.currency_code` is a **second** currency field, also defaulting
to `'USD'`, and the two can disagree — `annual/warnings.ts` already reports
mixed currency across periods. The proxy is the **company's**. A per-period
read would turn the gate on and off between periods of one year.

### 1.3 The real fix

A `country` column on `companies`, ISO 3166-1 alpha-2, set in the company
settings form. Backfilled `'AU'` where `currency_code = 'AUD'` and left null
otherwise, with null meaning "unknown" and closing the gate — the same rule
`visibleNavItems` uses for an unknown plan. Keeping the proxy in **one named
predicate** today (`isAustralianCompany(company)`, alongside `hasIntegrations()`
in `lib/plans.ts`) makes that a backfill and a one-line change rather than a
rewrite. Do not spread `currencyCode === "AUD"` through the engine.

---

## 2. Qualifying earnings — the statutory definition

This is the base the 12% applies to from 1 July 2026. It replaced ordinary time
earnings (OTE) and "salary or wages" as the single earnings base.

### 2.1 The statute

**Section 10A of the *Superannuation Guarantee (Administration) Act 1992***,
inserted by Schedule 1, Part 1, Division 1, item 11 of the ***Treasury Laws
Amendment (Payday Superannuation) Act 2025*** (Act No. 57 of 2025), heading
"Interpretation: expressions relating to qualifying earnings".

> A person's qualifying earnings are amounts covered by one or more of the
> following paragraphs:

| ¶ | Covers |
|---|---|
| 10A(1)(a) | "the person's **ordinary time earnings**" |
| 10A(1)(b) | "**all commissions** payable to the person" |
| 10A(1)(c) | "all payments for the performance of the person's duties as a member of the executive body" — board and executive-body fees |
| 10A(1)(d) | "all payments under a contract referred to in subsection 12(3)" — a contract wholly or principally for the person's labour |
| 10A(1)(e) | "all remuneration of the person as a member of the Parliament" |
| 10A(1)(f) | "all payments to the person for work referred to in subsection 12(8)" |
| 10A(1)(g) | "all remuneration of the person in circumstances referred to in subsection 12(9) or (10)" |
| 10A(1)(h) | **salary sacrifice**: where under an arrangement the person agreed to a reduction in amounts under (a)–(g) in return for the employer making a superannuation contribution, qualifying earnings equal the total of those reductions |

- **10A(2)**: an amount covered by more than one paragraph is **counted once**.
- **10A(3)**: qualifying earnings do **not** include (a) a payment representing
  the reversal of all or part of a sacrificed contribution, or (b) earnings,
  remuneration or payments excluded by regulation.
- **10A(4)**: a "payment of qualifying earnings to or for an employee" is a
  direct payment, **or** — for paragraph (1)(h) — the reductions made in return
  for the sacrificed contribution.
- **10A(5)**: the maximum contributions base formula (section 2.5).
- **10A(6)**: once a year's qualifying earnings exceed the maximum
  contributions base, the payment causing the excess is treated as reduced by
  the excess.

Source: Federal Register of Legislation, *Treasury Laws Amendment (Payday
Superannuation) Act 2025*, as made 6 November 2025 —
`https://www.legislation.gov.au/C2025A00057/asmade/2025-11-06/text/original/epub/OEBPS/document_1/document_1.html`.
The consolidated Act is compilation C2026C00272, compiled July 2026 —
`https://www.legislation.gov.au/C2004A04402/latest/text`. Read directly.

### 2.2 The answer to the question this was commissioned for

**Yes, salary-sacrificed super is inside qualifying earnings** — paragraph
10A(1)(h), and only to the extent the sacrificed amount *would itself have been*
qualifying earnings had it not been sacrificed. The ATO describes this as
"effectively the same as the rule that applied prior to Payday Super" **(ATO,
read indirectly** — `ato.gov.au/QE` and
`…/payday-super/paying-super-on-payday/what-payments-are-qualifying-earnings`).

The brief's secondary source — "QE is OTE plus commissions plus
salary-sacrificed amounts" — is **right as far as it goes** and incomplete. It
omits paragraphs (c) to (g): board and executive-body fees, labour-only
contractor payments, parliamentary remuneration, and the section 12(8)–(10)
categories. For a payroll register those matter mainly for **directors' fees**,
which a register does carry and which the brief's summary would miss.

One secondary source (Reckon) lists QE as *excluding* overtime, expense
allowances and termination payments. That is not a contradiction of the Act: it
is describing the content of paragraph (a), ordinary time earnings, which does
exclude those. It reads as a contradiction only because it omits paragraphs
(b)–(h).

### 2.3 What is out

- **Overtime**, where ordinary hours are identifiable — it is not OTE, and no
  other paragraph picks it up. Note the asymmetry: commission for work done
  *wholly outside* ordinary hours **is** in, under paragraph (b). **(ATO, read
  indirectly.)**
- **Expense allowances** and allowances that are fringe benefits — not salary
  or wages at all. Fringe benefits are also excluded by regulation (below).
- **Termination payments**: unused annual leave and long service leave paid on
  termination, redundancy payments and ETPs are not OTE.
- **Excluded by regulation** — *Treasury Laws Amendment (Payday
  Superannuation) Regulations 2026* (F2026L00133), made 23 February 2026,
  under s 10A(3)(b):
  - **reg 11, excluded employees**: certain Subclass 400/456 and 457/482 visa
    holders in national/state executive roles, and "a **part-time employee who
    is under 18**".
  - **reg 12, excluded earnings**: payments for a period of **parental leave**;
    payments during an eligible community service activity or ADF service where
    the ADF does not pay them; amounts an international social security
    agreement puts outside the Act; Aged Care Registered Nurses' Payment
    program amounts paid on or after 1 November 2022; **fringe benefits** under
    the FBTAA 1986; non-resident payments for work done outside Australia and in
    the Joint Petroleum Development Area; resident-of-a-non-resident-employer
    payments for work outside Australia; payments exempt under item 1.4 of the
    s 51-5 table of the ITAA 1997; and payments under a contract for **not more
    than 30 hours per week** for work "wholly or principally of a domestic or
    private nature".
  - Paragraphs (b) and (c) of reg 12 do not cover annual, sick or long service
    leave paid for the period of that activity or service.

  Source: `https://www.legislation.gov.au/F2026L00133/asmade/2026-02-23/text/original/epub/OEBPS/document_1/document_1.html`.
  Read directly.

**None of these exclusions is visible in a payroll file.** A register does not
say who is 17 and part-time, who holds a 482 visa, or which leave was parental.
See section 7.

### 2.4 Status of the ATO's own ruling

**Draft LCR 2026/D1 *Payday Super: qualifying earnings* has not been
finalised.** The ATO's advice-under-development page records finalisation as
pending the outcome of the appeal process from ***Department of Education v
Commissioner of Taxation* [2026] FCA 898**. Expected completion was listed as
October 2026; no final ruling was found as at 17 November 2026. **(ATO, read
indirectly.)** LCR 2026/1 (application and transitional provisions, finalised
5 August 2026) and LCR 2026/2 (eligible contributions) are final; the
qualifying-earnings one is not.

Consequence for the product: **the statutory text in 2.1 is settled; the
Commissioner's view on its edges is not.** Clarivo must not present an edge
case as decided.

### 2.5 The ceiling

**Section 10A(5)**: the maximum contributions base is the **basic concessional
contributions cap** for the financial year, divided by the charge percentage,
multiplied by 100, rounded down to the nearest $10. It is **annual** under
Payday Super; it was quarterly before.

For 2026-27 the ATO publishes a concessional cap of **$32,500** and a maximum
contributions base of **$270,830** **(ATO, read indirectly** — key
superannuation rates and thresholds**)**. The statutory formula reproduces that
figure exactly:

```
32,500 / 12 × 100 = 270,833.33  ->  rounded down to the nearest $10 = 270,830
```

That cross-check is the reason to trust the figure, and it is also the reason
not to hard-code it: the cap is indexed to AWOTE and moves. Keep it in a dated
table with the financial year as the key.

---

## 3. The rate

**Section 17A(2): "charge percentage means 12."** Read directly from the Act
(section 2.1's source). The individual SG amount is qualifying earnings
multiplied by the charge percentage.

- 12% applies **from 1 July 2025**. That date comes from secondary sources
  (the pre-Payday-Super section 19(2) rate table was not read directly); the
  12% itself is primary. **To verify: the exact wording of the superseded rate
  table, if it ever matters for a prior-year comparison.**
- **No further step is legislated.** The new section 17A(2) is a flat number,
  not a table, so there is nothing scheduled to step from. Secondary sources
  agree 12% was the final step of the earlier phase-in. **To verify** against
  the current compilation if a future-year forecast is ever built on it.

Clarivo must not hard-code `0.12`. Put it in the same dated table as the
maximum contributions base.

---

## 4. Payday Super timing, and the redesigned charge

All of this is primary, read directly from the Act.

### 4.1 Commencement

Payday Super commenced **1 July 2026**. It applies to qualifying earnings
**paid** from that date, **even where the work was done before it** **(ATO,
read indirectly)**.

### 4.2 The deadline

- **"QE day"** — s 17A(1): the day a payment of qualifying earnings is made to
  or for an employee. **Day zero is the day the employee is paid**, not the end
  of the pay period and not the pay run's processing date.
- **"usual period"** — s 6(1): starts on the QE day and ends on the **seventh
  business day after the QE day**. The contribution must be **received by the
  fund** within it, with enough information to allocate it. Received, not sent.
- **"business day"** — s 6(1): excludes weekends and a day that is a public
  holiday **for the whole of a State, the ACT or the Northern Territory**. So a
  Victoria-wide holiday shortens the window for every employer in Australia,
  and a local show-day holiday does not.
- **"extended usual period"** — s 6(1): ends on the **20th business day after
  the QE day**. Allowed by **s 18C(2) item 1** where the contribution is "the
  first eligible contribution made to a particular complying superannuation
  fund or RSA by the employer" for that employee — which covers a **new
  starter**, a **rehire** ("commenced or recommenced"), and a **fund switch**
  (after the employer ceased contributing to another fund for them). It attaches
  to the first contribution to a *particular fund*, not to a first QE day.
- **Out-of-cycle payments** — **s 18C(2) item 2**: where the QE day relates to
  qualifying earnings of a kind determined under **s 18C(3)** by legislative
  instrument, the contribution may be received "before the end of the usual
  period for the first standard QE day after the current QE day" — that is, the
  clock runs from the **next regular payday**, not from the off-cycle payment.
  The kinds are set by instrument; **to verify** which kinds are listed, from
  the instrument itself.
- **Exceptional circumstances** — s 18C(2) item 3 and s 18C(4): the extended
  period also applies under a Commissioner's determination. Reg 13 of the 2026
  Regulations prescribes natural disasters and widespread technology outages.

The brief notes a secondary source saying 7 **calendar** days. That source is
wrong. The Act says business days, in the s 6(1) definition of "usual period",
and defines "business day" in the same subsection.

### 4.3 The redesigned superannuation guarantee charge

A deliberate change of shape: the old SGC was calculated on **salary or wages**
(a wider base than OTE) and was not deductible. The new one is built from the
shortfall itself.

| Component | Section | What it is |
|---|---|---|
| Superannuation guarantee shortfall | s 16B(2) | The total of the four below |
| Individual SG amount | s 17A(2) | Qualifying earnings × 12% |
| Individual base shortfall | s 18C(1) | Individual SG amount − eligible contributions for the QE day |
| Individual final shortfall | s 18D(2) | Base shortfall − eligible contributions received in the late period |
| Notional earnings | s 19A | For each day in the late period with a final shortfall above nil: the notional sum × the general interest charge rate (s 8AAD, *Taxation Administration Act 1953*). The notional sum is the base shortfall plus earlier daily amounts — it compounds |
| Administrative uplift | s 19B(1) | **60%** of the sum of total final shortfalls and total notional earnings. Reducible by regulation, s 19B(2)–(3), including for a timely voluntary disclosure |
| Choice loading | s 20A(1) | The lesser of 25% of the relevant contributions and the choice loading limit, which is **$1,200** (s 20C(1)), reduced under s 20C(2) |
| Administrative penalty | s 59C(2) | A percentage of the amount left unpaid after the s 59A notice period: **25%** by default, **50%** if a penalty was incurred in the prior 24 months, **0%** where a s 18C(4) determination applies |

A contribution that misses the window but arrives before an assessment reduces
the shortfall without removing the interest and the uplift.

**Clarivo must never compute an SGC figure.** It is listed here so nobody has
to guess at the stakes of the check in section 6 — not so the product can
quantify them. See section 7.

---

## 5. The taxonomy, mapped onto `Category`

`Category` is defined in `packages/payroll-core/src/annual/types.ts`:

```
base_salary | allowance | bonus_commission | overtime | other_earning
income_tax | social_security_employee | other_deduction | absence_deduction
social_security_employer | other_employer_cost
absence_days | other_quantity
ignore | uncategorised
```

Column (a) is where the money sits in the gross-to-net bridge; (b) is whether
it counts toward qualifying earnings; (c) is the `Category` to assign.

### 5.1 The three rules the brief asked to verify

All three are **confirmed**.

1. **Employer superannuation is a cost on top of gross, not a deduction from
   it.** Confirmed. It is the employer's obligation under s 17A(2) and is never
   withheld from the employee's pay. Read as a deduction, `net = gross −
   deductions` fails on every Australian file by the whole super amount.
   Category: `social_security_employer`, which is in
   `EMPLOYER_COST_CATEGORIES` and therefore outside both identities in
   `reconcile.ts`.

2. **Salary-sacrifice super is a pre-tax employee deduction.** Confirmed. It
   reduces take-home pay and taxable income, and it **still counts toward
   qualifying earnings** under s 10A(1)(h). Category: `other_deduction`.
   Clarivo has no pre-tax/post-tax distinction and does not need one to balance
   — but see 5.4, because the QE calculation does need to find this column.

3. **PAYG withholding is income tax.** Confirmed. PAYG withholding is the
   employee's income tax withheld at source and remitted by the employer.
   Category: `income_tax`.

### 5.2 The table

| Pay item | (a) Where it sits | (b) QE? | (c) `Category` |
|---|---|---|---|
| Ordinary hours / base salary / wages | earning | **yes** (OTE) | `base_salary` |
| Casual loading, shift loading, penalty rates | earning | **yes** (OTE, paid for ordinary hours) | `base_salary` |
| Paid annual, personal/carer's, compassionate and long service **leave taken** | earning | **yes** — leave pay is in respect of ordinary hours | `base_salary` |
| **Annual leave loading** | earning | **yes**, by default — see 5.5 | `other_earning` |
| Overtime | earning | **no** | `overtime` |
| Overtime meal allowance | earning | **no** (expense allowance for overtime) | `allowance` |
| Allowances generally (tool, laundry, first aid, site, higher-duties) | earning | **yes** where paid for ordinary hours | `allowance` |
| Expense allowances, and allowances that are fringe benefits | earning | **no** | `allowance` |
| Travel/motor-vehicle allowance | earning | **depends** — a true expense reimbursement is out, a flat non-accountable allowance is in. Not resolvable from a header | `allowance`, and ask |
| Bonus (performance, paid for ordinary hours) | earning | **yes** | `bonus_commission` |
| Bonus referable to overtime only | earning | **no** | `bonus_commission` |
| **Commission** | earning | **yes — all of it**, s 10A(1)(b), even for work wholly outside ordinary hours | `bonus_commission` |
| Directors' fees / executive-body fees | earning | **yes**, s 10A(1)(c) | `other_earning` |
| Back pay, arrears, retro | earning | **yes** if the underlying amount was QE | `other_earning` |
| Unused annual leave / LSL paid on **termination** (Lump Sum A) | earning | **no** | `other_earning` |
| Leave loading paid **on a termination payout** | earning | **no** — it follows the payout | `other_earning` |
| Redundancy / severance pay | earning | **no** | `other_earning` |
| Payment in lieu of notice | earning | **no** (termination lump sum) | `other_earning` |
| **ETP** — taxable and tax-free components | earning | **no** | `other_earning` |
| Lump Sum E (back payment of leave on termination), Lump Sum W (return to work) | earning | **W: yes; E: no.** **To verify** against the final ruling | `other_earning` |
| **PAYG withholding** | employee deduction | n/a | `income_tax` |
| **STSL** (HELP/HECS, SFSS and the rest) | employee deduction | n/a | `income_tax` — it is withheld as part of the tax, not a separate levy |
| **Salary sacrifice to superannuation** | **pre-tax** employee deduction | **yes**, s 10A(1)(h) | `other_deduction` |
| Salary sacrifice, other (novated lease, devices) | **pre-tax** employee deduction | **no** — it reduces the (a)–(g) amounts and is not sacrificed to super | `other_deduction` |
| Employee additional super (post-tax, member voluntary) | post-tax employee deduction | **no** | `other_deduction` |
| Union fees, social club, workplace giving, salary packaging fees | post-tax employee deduction | n/a | `other_deduction` |
| Child support deduction, garnishee | post-tax employee deduction | n/a | `other_deduction` |
| Unpaid leave / leave without pay | employee deduction | n/a | `absence_deduction` |
| **Employer superannuation guarantee (SG)** | **employer cost, outside gross** | n/a | **`social_security_employer`** |
| Employer additional super, productivity, redundancy and spouse contributions | employer cost, outside gross | n/a | `other_employer_cost` |
| **RESC** (reportable employer super contributions) | **reporting only** | n/a | **`ignore`** — see 5.3 |
| **State payroll tax** | **employer cost, outside gross** | n/a | `other_employer_cost` |
| **Fringe benefits tax** | employer cost, outside gross | n/a | `other_employer_cost` |
| WorkCover / workers compensation premium | employer cost, outside gross | n/a | `other_employer_cost` |
| Portable long service leave levy | employer cost, outside gross | n/a | `other_employer_cost` |
| Superannuation guarantee **charge** (SGC) | employer cost, outside gross — a penalty to the ATO, not a contribution | n/a | `other_employer_cost` |
| Hours, ordinary hours worked, leave balances | quantity | n/a | `other_quantity` |
| Absence days | quantity | n/a | `absence_days` |
| Gross earnings, taxable earnings, total wages, total deductions, net pay, gross plus super | total | n/a | `ignore` |
| Super fund name, fund USI, member number, ABN, BSB, account number | text | n/a | `ignore` |

### 5.3 Why RESC is `ignore`, and not an employer cost

RESC is **not extra money.** It is a reporting figure for the employee's income
statement, covering extra super the employee can influence — salary sacrifice
above all. Standard SG, and contributions required by a collectively negotiated
industrial agreement the employee cannot influence, are **not** RESC **(ATO,
read indirectly** — "Identify reportable employer super contributions"**)**.

So on a register the RESC column is, in the ordinary case, the **same dollars**
as the salary-sacrifice column. Classified as `other_employer_cost`, it
double-counts the employer on-cost rate; classified as a deduction, it
double-counts the deduction side. `ignore` is the only answer that leaves the
bridge intact.

In `samples/au/`, AU-0001's 500.00 salary sacrifice is RESC; AU-0007's 50.00
employer additional contribution under an enterprise agreement is not.

### 5.4 Does Australia need a new `Category`?

**No. Do not add one.** Every Australian pay item above lands in one of the
existing fifteen, and three of them — `other_earning`, `other_employer_cost`
and `ignore` — are doing real work rather than absorbing leftovers.

There is one place where the model is genuinely short, and a category is the
wrong fix for it:

> **Clarivo cannot tell a pre-tax from a post-tax employee deduction, and the
> QE calculation needs to find exactly one pre-tax deduction — salary sacrifice
> to super.**

Adding `salary_sacrifice_super` as a sixteenth `Category` would put a
country-specific concept into a type the French, Lebanese and Gulf engines
share, and it would mean every `Record<Category, …>` in the repo gains a member
that is meaningless for fourteen-fifteenths of the customers.

**Recommendation instead:** the QE calculation reads the classifier's **rule
name**, which `classifyComponentWithReason` already returns, not the category.
Add a rule named `au-salary-sacrifice-super` that returns
`{ category: "other_deduction", rule: "au-salary-sacrifice-super" }`, and let
section 6 select on `rule`. `ClassificationReason.rule` is already surfaced in
the category manager (step 40), so this costs no new type and no new column,
and a user override through `component_categories` still wins on the category
while the rule stays visible.

The same device gives the super check its second gate signal (section 1.1):
a rule named `au-employer-super` returning `social_security_employer`.

### 5.5 Annual leave loading — what Clarivo should assume, and why

**Assume leave loading counts toward qualifying earnings.** Treat it as
`other_earning`, inside gross, and include it in the QE base.

The ATO's position is that annual leave loading is OTE **unless** the employer
can show it is paid to compensate for a lost opportunity to work overtime
**(ATO, read indirectly** — the "Superannuation on annual leave loading" page
and the OTE payment list, which splits loading into two rows on exactly that
test**)**.

The brief's understanding is correct, and so is its reasoning: **a payroll file
cannot show the exception.** The exception turns on the industrial instrument
and on evidence of the purpose of the loading, neither of which is in a column
or a cell. A product that guessed "exception applies" would under-state the QE
base and tell an employer they were compliant when they were not. Assuming the
loading is in is the assumption whose failure mode is an over-stated
expectation and a question, not a false clearance.

**This is an unresolved area of law and Clarivo must say so when it matters.**
On 10 July 2026 the Federal Court (Button J) held in ***Department of Education
v Commissioner of Taxation* [2026] FCA 898** that a salary loading allowance
was **not** OTE. The ATO issued an interim decision impact statement; one
report says it will appeal, which the sources read here do not confirm.
Finalisation of LCR 2026/D1 is on hold for the outcome (section 2.4).

So: carry the loading in the base, and where the Payday Super check's outcome
would **change** if the loading were excluded, say so in the card —
"this employee's result depends on annual leave loading being treated as
qualifying earnings, which the ATO's draft guidance has not finalised" — rather
than reporting a clean pass or a clean shortfall. `samples/au/` AU-0005 is that
employee: her leave loading is 302.88 of a 3,764.42 QE base, 8.0%.

### 5.6 A header cannot always decide QE

In `samples/au/`, the MYOB files have **one** `Holiday Leave Loading` column
carrying 280.00 for AU-0006 (loading on a termination payout — **not** QE) in
period 1 and 302.88 for AU-0005 (loading on leave taken — **QE**) in period 2.
The Xero files split the same money across `Annual Leave Loading` and
`Annual Leave Loading on Termination`, which can be decided from the header.

**Where the system does not split it, Clarivo cannot split it either.** The
right behaviour is the one `classify.ts` already has for `Maladie`: an
`AmbiguityRule` with the two candidates and a question, resolved by a word that
settles it (`termination`, `unused`), and the answer saved to
`component_categories` so it is asked once. Do not guess; do not quietly pick
the commoner case.

---

## 6. Strings a classifier should match

Match on **word boundaries after `normalize()`**, never on substrings. The
existing `SYNONYMS` table plus `vocabulary()` already does this; the list below
is vocabulary for it, not a new mechanism.

### 6.1 Employer superannuation — `social_security_employer`

```
super, supers, superannuation, superann, sg, sgc, sg super, super super,
super guarantee, superannuation guarantee, super guarantee (sg),
superannuation guarantee contribution, sgc contribution,
employer super, employer superannuation, employer super contribution,
employer contribution, super contribution, superannuation contribution,
super expense, superannuation expense, super payable, super accrued,
compulsory super, 12% super, ote super, qe super
```

The employer-side marker (`employer`, `er`, `empr`) must **not** be required: a
bare `Superannuation` column on an Australian register is the SG, because the
employee side of Australian super is a *deduction* and is always named as a
sacrifice or a voluntary contribution.

### 6.2 Salary sacrifice to super — `other_deduction`, rule `au-salary-sacrifice-super`

```
salary sacrifice, salary sacrifice (super), salary sacrifice (superannuation),
salary sacrifice super, salary sacrifice - superannuation, super salary
sacrifice, salary sacrificed super, sacrifice super, ss super, ss (super),
salary packaging - super, pre-tax super, employee pre tax super
```

Must be tested **before** the bare-salary rule (rule 12), which currently
claims every one of these. The marker word is `sacrifice`, not `salary`.

### 6.3 Salary sacrifice, other — `other_deduction`, **not** QE

```
salary sacrifice (other), salary sacrifice - other, salary sacrifice
(novated lease), novated lease, salary packaging, ss other, ss (other),
packaged benefit, device salary sacrifice
```

STP Phase 2 reports these as **type O**, and super sacrifice as **type S**
**(ATO STP Phase 2 position paper, read indirectly)**. Clarivo needs the same
split for exactly one reason: type S is added back into QE and type O is not.

### 6.4 Income tax — `income_tax`

```
payg, paygw, payg w, payg withholding, payg tax, payg withheld, tax withheld,
withholding tax, paygwh, w1, w2,
stsl, help, hecs, hecs-help, sfss, trsl, ssl, abstudy ssl,
study and training support loan, student loan deduction
```

`PAYG` and `PAYGW` alone match **nothing** today. On an Employment Hero export
`PAYG` is the entire withholding column.

### 6.5 Employer cost outside gross — `other_employer_cost`

```
payroll tax, state payroll tax, payroll tax expense,
fbt, fringe benefits tax,
workcover, work cover, workers compensation, workers comp, worker's
compensation, employer liabilities, employer expenses, employer on costs,
portable long service, plsl levy, long service levy,
super guarantee charge, sgc charge, sgc penalty,
employer additional, employer additional super, productivity super,
redundancy super contribution, spouse contribution
```

### 6.6 Earnings

```
ordinary hours, ordinary earnings, ordinary time earnings, ote,
qualifying earnings, qe earnings, base hourly, base salary,
casual loading, shift loading, penalty rates, penalties, higher duties,
annual leave, annual leave taken, holiday pay, personal leave,
personal/carer's leave, carers leave, sick leave, compassionate leave,
long service leave, lsl taken,
annual leave loading, leave loading, holiday leave loading, 17.5% loading,
unused annual leave, unused annual leave on termination, unused holiday pay,
unused lsl, lump sum a, lump sum b, lump sum e, lump sum w,
etp, etp taxable component, etp tax free component,
employment termination payment, redundancy pay, severance pay,
payment in lieu of notice, pilon, directors fees, director's fees
```

### 6.7 Headers that are totals or text — `ignore`

```
gross earnings, total earnings, total gross, total wages, taxable earnings,
tax exempt earnings, net earnings, net pay, take home pay,
total deductions, total tax, gross plus super, gross + super, total cost,
resc, reportable employer super contributions, reportable super,
super fund, super fund name, superannuation fund, fund usi, usi, spin,
member number, member no, abn, tfn, bsb, account number, payslip number
```

### 6.8 The dangerously ambiguous ones

This section is the reason the classifier matches tokens, not substrings. Each
line is a false match that would break a customer's gross-to-net.

| Fragment | Hits what it should | Also hits | Consequence |
|---|---|---|---|
| **`super`** as a substring | `Superannuation`, `Super Guarantee` | **`Supervisor Allowance`**, `Supervisor Loading`, `Supervision Allowance`, `Supermarket Allowance`, `Superintendent Allowance` | An allowance inside gross becomes an employer cost outside it. Gross falls by the allowance and the on-cost rate rises. **Match `super` only as a whole token** |
| **`super`** as a whole token | `Super`, `Super Guarantee` | **`Super Fund Name`**, `Super Fund`, `Fund USI` — text columns | Stored as `Number(val) \|\| 0` = 0.00 per head. `Super Fund Name` is `other_employer_cost` **today**, via the `fund` → `levy` synonym. Text patterns must be tested **before** the super rule |
| **`sacrifice`** | all salary sacrifice | `Salary Sacrifice (Other)` vs `(Super)` | Both are pre-tax deductions, so the bridge balances either way — and only the super one is added back into QE. Getting it wrong understates QE silently |
| **`tax`** | `PAYG Tax`, `Tax Withheld` | **`Payroll Tax`** and **`Fringe Benefits Tax`** (employer costs), `Taxable Earnings` (a total), `Tax Exempt Earnings` (an **earning**), `Pre Tax Deductions`, `Post Tax Deductions` | `Payroll Tax` → `income_tax` **today**: a state employer tax booked as an employee deduction, so net is understated by it. `Tax Exempt Earnings` → `income_tax` **today**: an earning booked as a tax, which moves the bridge twice |
| **`leave`** | `Unpaid Leave` (a deduction) | **`Leave Loading`**, `Annual Leave`, `Annual Leave Taken`, `Long Service Leave`, `Parental Leave` — every one an **earning** | All six are `absence_deduction` **today**. The amount leaves the earnings side and lands on the deduction side, so each dollar is wrong by two. This is the largest single defect |
| **`loading`** | nothing on its own | `Leave Loading`, `Casual Loading`, `Shift Loading` — all **earnings**; and `Loading` in `Salary Loading Allowance`, the item litigated in *[2026] FCA 898* | No loading is ever a deduction. A rule that reads `loading` as anything but an earning is wrong in every case |
| **`contribution`** | `Employer Contribution` | `Employee Additional Super` (a deduction), `Spouse Contribution` (a deduction), `Member Voluntary` | `contribution` is in the `levy` synonym group today, so an unmarked contribution becomes `other_employer_cost`. The employee-side ones then sit outside the bridge and net is unexplained |
| **`fund`** | nothing useful | `Super Fund Name` (text), `Social Club Fund` (a post-tax deduction), `Training Fund` (an employer levy) | `fund` → `levy` → `other_employer_cost` today, for all three |
| **`etp`** | `ETP`, `ETP Taxable Component` — Australian employment termination payments | **`ETP` = *équivalent temps plein*, the French FTE** — already a rule in `ingest.ts` | A direct collision between two country vocabularies on a three-letter token. See 9.3 |
| **`termination`** | `Termination Date` | **`Unused Annual Leave on Termination`**, `Annual Leave Loading on Termination`, `Employment Termination Payment` — all **money** | `ingest.ts` offers all of them as the termination-date column. See 9.3 |
| **`social`** | nothing, in Australia | **`Social Club`** → `social_security_employee` today | There is no employee social security in Australia. Any match on that line for an AU register is wrong by construction |
| **`charge`** | nothing | `Super Guarantee Charge` | A penalty payable to the ATO, not a contribution. It must never be counted toward the 12% in section 7 |
| **`hours`** | `Overtime Hours`, `Hours` — quantities | **`Ordinary Hours`**, which on a Xero pay-item export is the **money** column | → `other_quantity` today, so the largest earning on the register is excluded from both identities. The quantity rule needs a money/quantity signal beyond the word |
| **`deduction`** | `Child Support Deduction` | **`Child Support`** without the word | Same money, opposite sides of the bridge, depending on whether the system printed "Deduction". Name the *thing*, not the word |
| **`gross`** / **`net`** | `Gross Earnings`, `Net Pay` | `Gross Plus Super` — correctly `ignore` today | Correct. Keep it: `Gross Plus Super` as a component would add the employer super into gross |

---

## 7. The Payday Super check

The arithmetic, written so it can be implemented without going back to the ATO.

### 7.1 When it runs

Per employee, per period, when both gates in section 1.1 pass. If either fails,
the check does not run and section 1.1 says what is surfaced instead.

### 7.2 What is summed

```
QE(employee, period) =
      Σ components classified  base_salary
    + Σ components classified  allowance        where the allowance counts toward OTE
    + Σ components classified  bonus_commission
    + Σ components classified  other_earning    where the item counts toward QE
    + Σ components whose rule is au-salary-sacrifice-super   (as a positive amount)
```

Excluded from the sum, explicitly:

```
    −  everything classified  overtime
    −  allowances that are expense allowances or fringe benefits
    −  termination earnings: unused leave, its loading, redundancy, PILON, ETP
    −  everything classified  income_tax, social_security_employee,
       other_deduction, absence_deduction
    −  everything classified  social_security_employer, other_employer_cost
    −  everything classified  ignore, absence_days, other_quantity
    −  everything classified  uncategorised
```

Three things that are **not** inputs: `gross`, `net`, and the
`other_earnings_balance` line. Gross is the wrong base in both directions at
once (section 7.7). `uncategorised` money is excluded on purpose — see 7.6.

### 7.3 The salary-sacrifice add-back, and when **not** to apply it

The brief's concern — that including sacrificed super in QE would make a
gross-based test under-report for exactly the employees who sacrifice — is the
right worry, and the mechanism is more specific than it looks. **Whether the
sacrifice has to be added back depends on which side of the bridge the register
puts it:**

- **Sacrifice written as a deduction line** (every file in `samples/au/`, and
  the normal shape, because STP Phase 2 requires pre-sacrifice gross and the
  sacrificed amount to be reported separately): the earnings columns are
  already stated **pre-sacrifice**, so they already contain the sacrificed
  money. Adding it again double-counts.
- **Earnings stated net of the sacrifice** (salary packaging written as a
  reduced base): the sacrificed amount is missing from the earnings columns and
  **must** be added back.

**This is decidable from the file**, which is why it is a rule and not a
guess. Run the bridge:

```
if   round(gross − Σ deductions) == net          and the sacrifice column is
     one of those deductions
then earnings are pre-sacrifice           ->  do NOT add back
else if  round(Σ earnings + sacrifice) == gross
then earnings are post-sacrifice          ->  DO add back
else the register does not reconcile      ->  the gate refuses it anyway
```

In `samples/au/`, AU-0001's 500.00 sits on the deduction side and gross is
4,615.38 pre-sacrifice, so QE is 4,615.38 and **no add-back applies**. State
which branch was taken in the audit trail; the two give answers 500.00 apart
and nothing else in the file distinguishes them afterwards.

### 7.4 What the 12% applies to

**The 12% applies to QE as computed in 7.2, and to nothing else.**

```
expectedSG(employee, period) = roundToMinorUnits(QE × 0.12, minorUnits("AUD"))
actualSG(employee, period)   = Σ components whose rule is au-employer-super
shortfall                    = expectedSG − actualSG
```

Capped by the maximum contributions base, section 2.5: `expectedSG` for the
year stops once the employee's **year-to-date** QE passes $270,830 (2026-27).
Clarivo sees one period, so see 7.8.

### 7.5 Rounding and tolerance

- `roundToMinorUnits(v, 2)` — AUD has two minor units, from `minorUnits()` in
  `packages/payroll-core/src/money.ts`.
- The tolerance is `smallestUnit(2)` = **0.01**, per employee. Nothing smaller
  is a finding.
- **At a company level, expect a cent or two of drift** between "12% of the
  total QE" and "the total of each employee's 12%". In `samples/au/` period 1:
  `22,766.46 × 0.12 = 2,731.98`, while the seven per-employee amounts sum to
  `2,731.97`. **Compare per employee and sum the results.** Do not compare a
  company total against 12% of a company total and report the difference.

### 7.6 When the file carries **no** super column at all

**This is a different answer from "below 12%", and it must never be reported as
a breach.** The condition is the second gate in section 1.1 failing: no column
on the register classified `social_security_employer` by an AU-super rule.

```
result = "not_checkable"
severity = info
message = "This register has no employer superannuation column, so the
           12% check could not be run. Employer super is often paid from a
           separate process and does not appear on the pay register."
```

That wording is doing specific work. A register with no super column is
**normal**: employer super is frequently accrued and paid outside the payroll
export, and several report formats (Employment Hero's Gross to Net among them)
simply do not carry the employer side. Reporting that as a shortfall would
report a breach for every employer whose export happens to be the common kind.

The same `not_checkable` answer applies, with its own message, when:

- the super column exists but is **blank or null** for that employee (as
  opposed to **0.00**, which is a figure and *is* checkable);
- the register has a super column but the employee's QE base is 0.00, so the
  ratio is undefined;
- a QE-relevant column is `uncategorised`, so the base is known to be
  incomplete. Say which column: "Qualifying earnings could not be computed
  because `Ordinary Hours` is not categorised." An incomplete base producing a
  confident shortfall is worse than no answer.

### 7.7 Why the base is never gross

`samples/au/` exists to make this concrete. Employer **SG** is **10.92%** of
gross in period 1 (2,731.97 / 25,020.96) and **11.65%** in period 2
(2,469.52 / 21,203.34), and the employer is exactly compliant in both. A
`super ≥ 12% × gross` rule reports a breach on a correct payroll — and per
employee it is wrong in both directions:

- **AU-0002**: gross 3,310.50, QE 2,936.00. Super is 352.32 = 10.64% of gross
  and exactly 12% of QE. The gap is overtime and an overtime meal allowance.
  Gross **over**states the base.
- **AU-0006**: gross 4,120.00, QE 2,240.00. Super is 268.80 = 6.52% of gross
  and exactly 12% of QE. The gap is a termination payout. Gross overstates it
  badly enough to look like fraud.
- **Earnings stated net of a sacrifice** (7.3, second branch): gross
  **under**states the base, and a gross-based test would clear an employer who
  is short. This is the brief's case, and it is the one where the wrong answer
  is a false clearance rather than a false alarm.

### 7.8 What one period cannot settle, and must therefore suppress

Clarivo sees a period, not a year. Three suppressions follow:

1. **The maximum contributions base is annual.** An employee whose YTD QE has
   passed $270,830 correctly receives no further SG, and a single late-year
   period would read as a 100% shortfall. Where the available periods' QE for
   an employee sums above ~80% of the MCB, mark the result `not_checkable` and
   say why. Clarivo cannot see YTD from before the first uploaded period, so
   say that too.
2. **An out-of-cycle payment's super may be in the next period** (s 18C(2)
   item 2). A bonus-only or commission-only run showing no super is not
   evidence of a shortfall. Where a period's QE is dominated by
   `bonus_commission` and `other_earning`, check the following period before
   reporting anything.
3. **A new starter's first contribution has 20 business days** (s 18C(2)
   item 1), which can cross a period boundary. Where `hire_date` falls in the
   period — `samples/au/` AU-0008 — do not report a shortfall on the first
   period alone.

### 7.9 Wording

The check reports a **figure from the file**, never a legal conclusion. See
section 8 for the exact line, which the AI narrative, the audit summary and the
annual insights all have to respect.

---

## 8. What Clarivo cannot check, and must not claim

The brief's line is the right one and it is worth stating as a rule:

> **"This file shows employer super below 12% of qualifying earnings" is a
> finding. "This employer breached Payday Super" is a legal conclusion, and the
> product must not state it.**

### 8.1 Not in a payroll file at all

- **Whether the money reached the fund, and when.** The seven-business-day rule
  is about receipt by the fund (section 4.2). An export says what was
  *calculated*, not what was *paid*, to whom, or on what date. Clarivo has no
  clearing-house data, no fund confirmations and no bank file. **It can never
  say anything about the deadline.**
- **The QE day.** The register has a pay-period start and end; the deadline runs
  from the **payment date**, which most exports do not carry at all.
- **Public holidays**, and therefore the business-day count. The definition
  turns on a holiday being observed across a whole State, the ACT or the NT.
- **Whether an eligible contribution was made to a complying fund with enough
  information to allocate it.** A number in a column is not a contribution.

### 8.2 In the file, but not decidable from it

- **Every regulation 12 exclusion**: parental leave, community service, ADF
  service, social security agreement coverage, fringe benefits, non-resident
  work outside Australia. A `Parental Leave` column can be recognised; nothing
  else on that list can.
- **Every regulation 11 exclusion**: visa subclass, executive status, and "a
  part-time employee who is under 18". Clarivo has `fte` but no age and no visa.
- **Whether an allowance is an expense allowance** or a fringe benefit —
  section 5.2's `travel allowance` row.
- **Whether leave loading is referable to a lost opportunity to work overtime**
  — section 5.5. The answer lives in the industrial instrument.
- **Whether a bonus relates to ordinary hours or to overtime.**
- **Year-to-date position** against the maximum contributions base, before the
  first uploaded period.
- **Whether a contribution is RESC** — it turns on whether the employee could
  influence it, which is a fact about the arrangement, not the amount.

### 8.3 Three sentences the product must never write

1. *"This employer has breached its Payday Super obligations."* — Clarivo
   cannot see a contribution, a fund or a date. Write instead: "Employer super
   for 3 employees is below 12% of their qualifying earnings in this period."
2. *"Super was paid late."* — see 8.1. There is no version of this Clarivo can
   support, in any wording, from any payroll file.
3. *"Superannuation guarantee charge of $X is payable."* — section 4.3 exists
   so nobody writes this. Notional earnings compound daily at the GIC rate and
   the administrative uplift is 60% of a figure Clarivo cannot compute;
   quantifying a charge from a register would be a fabricated number attached
   to a legal exposure.

### 8.4 And one about the AI text

`packages/ai/` must name only causes the data supports. In `samples/au/`,
"gross fell 15.26% because a leaver's final pay and a one-off commission both
dropped out" is supported — the termination date, the joiner's start date and
the component-level deltas are all in the file. "Super fell less than gross
because the amounts that dropped out were largely not qualifying earnings" is
supported too, and is the kind of sentence worth writing.

"The employer reduced superannuation contributions" is **not** supported by the
same file, and is the shape of sentence to refuse. Rule-based text is never
labelled as AI, and an AI narrative never presents an inference about statutory
compliance as a finding.

---

## 9. Defects found in the current code

Each was reproduced against `packages/payroll-core/src` at commit `4ca973a`
and is demonstrated by a file in `samples/au/`. None is fixed here; this
document changes no code.

### 9.1 `classify.ts` — verified misclassifications

| Header | `classifyComponent` returns | Rule that fires | Should be |
|---|---|---|---|
| `Salary Sacrifice`, and all six variants in 6.2 | `base_salary` | `salary-bare` | `other_deduction` |
| `Leave Loading`, `Annual Leave Loading`, `Holiday Leave Loading`, `Annual Leave`, `Annual Leave Taken`, `Long Service Leave`, `Personal Leave`, `Parental Leave`, `Unused Annual Leave on Termination` | `absence_deduction` | `absence-money` | `other_earning` / `base_salary` |
| `Payroll Tax`, `Fringe Benefits Tax` | `income_tax` | `tax` | `other_employer_cost` |
| `Tax Exempt Earnings`, `Post Tax Deductions` | `income_tax` | `tax` | `other_earning` / `other_deduction` |
| `Super`, `Superannuation`, `Super Guarantee`, `Superannuation Guarantee`, `SG`, `SGC`, `PAYG`, `PAYGW`, `STSL`, `RESC`, `Employer Additional`, `Child Support`, `Lump Sum A/E/W`, `ETP`, `Directors Fees`, `Casual Loading`, `Shift Loading`, `Ordinary Earnings`, `WorkCover` | `uncategorised` | `no-match` | per section 5.2 |
| `Super Fund Name`, `Superannuation Fund`, `Fund USI` | `other_employer_cost` | `levy-unmarked` | `ignore` (text) |
| `Social Club` | `social_security_employee` | `employee-social` | `other_deduction` |
| `Ordinary Hours` (a money column) | `other_quantity` | `quantity` | `base_salary` |
| `Pre Tax Deductions` | `uncategorised` | `taxable-base` | `other_deduction` |
| `Meal Allowance (Overtime)` | `overtime` | `overtime` | `allowance` |
| `Unused Holiday Pay`, `Redundancy Pay`, `Pay Period Start`, `Pay Period End` | `base_salary` | `salary-bare` | `other_earning`, `other_earning`, `ignore`, `ignore` |

`Pay Period Start` and `Pay Period End` are worth a second look: the upload
writes a component as `Number(val) || 0`, so a date column classified
`base_salary` stores **0.00 against every employee** and then sits in the
bridge as base salary.

### 9.2 What that costs on a correct file

`reconcileRegister` against the six files in `samples/au/`, with gross and net
mapped by hand. Every file is arithmetically correct and **every file is
refused**:

| File | Row breaches | Earnings placed / gross | Employer cost placed / actual |
|---|---|---|---|
| `xero_…10-18` | 9 | 2,422.50 / 25,020.96 | 2,731.97 / 2,781.97 |
| `xero_…11-01` | 9 | 1,172.00 / 21,203.34 | 2,469.52 / 2,519.52 |
| `myob_…10-18` | 10 | 25,240.96 / 25,020.96 | **0.00** / 2,781.97 |
| `myob_…11-01` | 10 | 21,400.46 / 21,203.34 | **0.00** / 2,519.52 |
| `employment_hero_…10-18` | 14 | **0.00** / 25,020.96 | 50.00 / 2,781.97 |
| `employment_hero_…11-01` | 14 | **0.00** / 21,203.34 | 50.00 / 2,519.52 |

The MYOB row is the one to look at twice. Mapped earnings of 25,240.96 exceed a
gross of 25,020.96 by 220.00: the 500.00 salary sacrifice was added to earnings
and the 280.00 leave loading was taken out of them. The employer on-cost rate
reads **0%** against a true 11.12%.

### 9.3 `ingest.ts` — two column-role collisions

`suggestColumnRole` runs **before** `classifyComponent` in the upload modal and
an identifier or snapshot role wins, so these columns never reach the
classifier at all.

- **`{ words: ["termination"] }` → `termination_date`** claims
  `Unused Annual Leave on Termination`, `Annual Leave Loading on Termination`
  and `Employment Termination Payment` — all money. `readDateColumn` treats a
  bare number between **20,000 and 80,000** as an Excel serial, so
  `40000` is read as **`2009-07-06`** and `52500.50` as **`2043-09-26`**.
  Verified. Outside that window the column is reported
  `unreadable_values` and nothing is written, which is why
  `samples/au/`'s 1,600.00 and 280.00 are safe and a realistic ETP is not.
  A wrong termination date is not cosmetic: it drives the leaver checks and
  the headcount roll-forward.
- **`{ words: ["etp"] }` → `fte`** was written for the French *équivalent temps
  plein* and claims the Australian **Employment Termination Payment**.
  `readFteColumn` refuses the values (`fte_looks_like_percent`,
  `fte_out_of_range`) so nothing is written, but the column is lost rather than
  classified.

Both rules need a disambiguator: `termination` should require a date word
(`date`, `sortie`, `fin`) or the absence of a money word, and `etp` should be
gated on the company not being Australian — one of the few places where section
1's proxy genuinely earns its keep.

### 9.4 `reconcile.ts` — a true statement that reads as reassurance

`sideOf` puts `uncategorised` on the **earnings** side, so an unrecognised
column still counts toward gross and the register still balances. That is the
right design — it is why `samples/2025`'s `Expense Reimbursement` does not
break the gate — and on an Australian file it has a side effect worth naming:

**an unrecognised *earning* passes the gate silently**, while an unrecognised
deduction or employer cost breaks it. Only the second kind gets caught.

Reproducible from the fixtures: rename `Ordinary Hours` to `Ordinary Earnings`
in `xero_fortnight_2026-10-05_to_2026-10-18.csv` — one word, and the column is
still unrecognised, just unrecognised in a different way. Breaches fall from 9
to 5, **four of the seven rows then pass both identities cleanly**, and
`21,268.46 of 25,020.96 — 85.0% of gross — sits unplaced` in
`other_earnings_balance`. The remaining breaches are the salary sacrifice and
the leave loading, which are misplaced rather than merely unplaced.

The gate's silence means "it adds up", not "the categories are right". The
bridge is perfect and the annual dashboard's category breakdown is nearly
empty.

Recommendation, as a spec and not a change: where mapped earnings are below
some share of gross — 50% is a starting point for discussion — the upload's
data-check panel should say so as a **warning**, separate from the breach list.
The existing `unplacedColumns` warning names each column but does not say how
much of the payroll is unplaced in total. Radwan to set the threshold.

---

## 10. Sources

Read **directly**:

- *Treasury Laws Amendment (Payday Superannuation) Act 2025* (Cth), No. 57 of
  2025, as made 6 November 2025 —
  `https://www.legislation.gov.au/C2025A00057/asmade/2025-11-06/text/original/epub/OEBPS/document_1/document_1.html`.
  Sections 6(1), 10A, 16B, 17A, 18C, 18D, 19A, 19B, 20A, 20C, 59C.
- *Superannuation Guarantee (Administration) Act 1992* (Cth), compilation
  C2026C00272, compiled July 2026 —
  `https://www.legislation.gov.au/C2004A04402/latest/text`.
- *Treasury Laws Amendment (Payday Superannuation) Regulations 2026* (Cth),
  F2026L00133, made 23 February 2026 —
  `https://www.legislation.gov.au/F2026L00133/asmade/2026-02-23/text/original/epub/OEBPS/document_1/document_1.html`.
  Regulations 11, 12, 13.

Read **indirectly** — ATO pages, summarised by a search tool because
`ato.gov.au` returns HTTP 403 to the fetch tool used here. **Confirm by opening
each before anything built on it ships:**

- "How Payday Super works" —
  `ato.gov.au/businesses-and-organisations/super-for-employers/payday-super/about-payday-super`
- "What payments are qualifying earnings" and "Maximum contributions base" —
  `ato.gov.au/QE`
- "Payment deadlines for Payday Super"
- "List of payments that are ordinary time earnings" and "Superannuation on
  annual leave loading" — `ato.gov.au/OTE`
- "Identify reportable employer super contributions"
- "Key superannuation rates and thresholds" — contribution caps
- Draft LCR 2026/D1 *Payday Super: qualifying earnings* — **draft, not
  finalised**; and the ATO's advice-under-development page recording why
- ATO *Single Touch Payroll Phase 2* position paper (salary sacrifice types S
  and O; disaggregation of gross) —
  `softwaredevelopers.ato.gov.au`. The PDF timed out on fetch; read through
  search summaries only

Case law:

- *Department of Education v Commissioner of Taxation* [2026] FCA 898
  (Button J, 10 July 2026) — a salary loading allowance held not to be OTE.
  Judgment at `judgments.fedcourt.gov.au`; **not read in full here**. An ATO
  interim decision impact statement has issued; an appeal is reported but was
  not confirmed in the sources read.

Vendor documentation, with the provenance and confidence of each layout graded
in `samples/au/README.md`:

- Employment Hero help centre — Detailed Activity report columns and order
  (**medium-high**)
- MYOB help centre — `help.myob.com.au/prem19/win/rpa0203.752.htm`,
  `rpa0205.754.htm`, `payroll_r2.htm`, `payroll_2.010.htm` — report contents,
  the `PAYG Withholding` tax category and the seven superannuation contribution
  types (**low-to-medium** on column headings)
- Xero Central — Payroll Activity Details report. JavaScript-rendered and the
  Payroll AU API reference requires authorisation; **neither could be read**
  (**low** on the frame)
