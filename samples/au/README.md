# Australian sample payroll files

Six synthetic, anonymised upload fixtures: two consecutive fortnights for each
of three payroll systems. They exist to test two things at once — the
**classifier**, which has to place Australian column headings, and the
**comparison**, which has to explain a 15% fall in gross between two periods.

Read `docs/AU_PAYROLL_SPEC.md` first. It carries the rules these files are
built on, with the ATO and legislation citations.

| Path | System | Period | Cadence |
|---|---|---|---|
| `xero_fortnight_2026-10-05_to_2026-10-18.csv` | Xero | 5–18 Oct 2026, paid 22 Oct | fortnightly (`bi_weekly`) |
| `xero_fortnight_2026-10-19_to_2026-11-01.csv` | Xero | 19 Oct–1 Nov 2026, paid 5 Nov | fortnightly |
| `myob_fortnight_2026-10-05_to_2026-10-18.csv` | MYOB | 5–18 Oct 2026 | fortnightly |
| `myob_fortnight_2026-10-19_to_2026-11-01.csv` | MYOB | 19 Oct–1 Nov 2026 | fortnightly |
| `employment_hero_fortnight_2026-10-05_to_2026-10-18.csv` | Employment Hero | 5–18 Oct 2026 | fortnightly |
| `employment_hero_fortnight_2026-10-19_to_2026-11-01.csv` | Employment Hero | 19 Oct–1 Nov 2026 | fortnightly |

Currency is **AUD**, two minor units. Every name, employee id, location and
figure is invented. There is no real person, ABN, fund USI or member number in
these files, and none may ever be added.

## The three sets carry the same payroll

This is deliberate and it is the point of the set. The same seven people, the
same hours, the same gross, the same net and the same employer superannuation
appear in all three, written in three different column vocabularies. **The only
variable is the headings**, so any difference in how Clarivo reads them is the
classifier's, not the data's.

Verified across all six files: gross equals the sum of the earnings columns,
gross minus every deduction equals net, and employer super is exactly 12% of
each employee's qualifying earnings.

| | Period 1 | Period 2 |
|---|---|---|
| Employees paid | 7 | 7 |
| Gross | 25,020.96 | 21,203.34 |
| PAYG withheld (incl. STSL) | 5,200.00 | 4,020.00 |
| Pre-tax deductions (salary sacrifice) | 500.00 | 500.00 |
| Post-tax deductions | 204.50 | 204.50 |
| Net | 19,116.46 | 16,478.84 |
| Qualifying earnings | 22,766.46 | 20,579.34 |
| Employer SG at 12% | 2,731.97 | 2,469.52 |
| Employer additional super | 50.00 | 50.00 |
| **Total employer super (outside gross)** | **2,781.97** | **2,519.52** |

Period 1: `25,020.96 − 5,200.00 − 500.00 − 204.50 = 19,116.46`.
Period 2: `21,203.34 − 4,020.00 − 500.00 − 204.50 = 16,478.84`.

**Employer SG is 10.92% of gross in period 1 (2,731.97 / 25,020.96) and 11.65%
in period 2 (2,469.52 / 21,203.34), and both are correct.** A check written as
"super ≥ 12% of gross" reports a breach
on both periods for a compliant employer. That is the headline the set exists
to make: see `docs/AU_PAYROLL_SPEC.md` §6.

## The people

| Id | Name | Department | FTE | What they exercise |
|---|---|---|---|---|
| AU-0001 | Harriet Okonkwo | Engineering | 1.0 | Salary sacrifice to super, 500.00 a fortnight — a **pre-tax deduction**, and the one case where super is understated by a gross-based test |
| AU-0002 | Callum Reyes | Operations | 1.0 | Overtime and allowances. Overtime and the overtime meal allowance are **not** qualifying earnings; the tool allowance is |
| AU-0003 | Priya Vaidyanathan | Finance | 0.6 | Part-timer. FTE below 1, no money effects |
| AU-0004 | Jonas Lindqvist | Sales | 1.0 | Commission of 1,500.00 in period 1 and nothing in period 2 — a one-off the forecast must not annualise. **All** commission is qualifying earnings |
| AU-0005 | Mei-Ling Tan | Engineering | 1.0 | One week of annual leave in period 2 with 17.5% leave loading, 302.88. Also the only STSL deduction, 120.00 |
| AU-0006 | Dougal Ferrier | Operations | 1.0 | Leaver. Terminated 14 Oct 2026, final pay in period 1: unused annual leave 1,600.00 plus loading 280.00, **neither of which is qualifying earnings** |
| AU-0007 | Noor Abdallah | Finance | 1.0 | Post-tax deductions (union fee 24.50, child support 180.00) and an employer additional super contribution of 50.00 under an enterprise agreement |
| AU-0008 | Tane Whitiora | Sales | 1.0 | Joiner. Started 26 Oct 2026, so period 2 is a half fortnight — 1,250.00, not a full 2,500.00 |

AU-0006 is in period 1 only (departed); AU-0008 is in period 2 only (new).

## Qualifying earnings, per employee

The figure the 12% applies to. It is **not** gross, and this table is what the
test-engineer should assert against.

| Id | P1 gross | P1 QE | Why QE ≠ gross | P2 gross | P2 QE |
|---|---|---|---|---|---|
| AU-0001 | 4,615.38 | 4,615.38 | gross is stated pre-sacrifice, so no add-back | 4,615.38 | 4,615.38 |
| AU-0002 | 3,310.50 | 2,936.00 | overtime 342.00 and overtime meal allowance 32.50 are out | 3,560.00 | 2,936.00 |
| AU-0003 | 2,052.00 | 2,052.00 | — | 2,052.00 | 2,052.00 |
| AU-0004 | 4,576.92 | 4,576.92 | commission is in, under s 10A(1)(b) | 3,076.92 | 3,076.92 |
| AU-0005 | 3,461.54 | 3,461.54 | — | 3,764.42 | 3,764.42 |
| AU-0006 | 4,120.00 | 2,240.00 | unused annual leave 1,600.00 and its loading 280.00 are termination payments, out | — | — |
| AU-0007 | 2,884.62 | 2,884.62 | — | 2,884.62 | 2,884.62 |
| AU-0008 | — | — | — | 1,250.00 | 1,250.00 |
| **Total** | **25,020.96** | **22,766.46** | | **21,203.34** | **20,579.34** |

`22,766.46 × 0.12 = 2,731.98`; the file carries 2,731.97, the sum of seven
per-employee amounts each rounded to the cent. One cent of rounding difference
between "12% of the total" and "the total of the 12%s" is expected and is not a
finding — see `docs/AU_PAYROLL_SPEC.md` §6.4.

**AU-0002 and AU-0005 are the pair that matters.** AU-0002's gross rises 7.53%
between the periods and his super does not move at all, because every extra
dollar is overtime. AU-0005's gross rises 8.75% and her super rises with it,
because leave and leave loading are qualifying earnings. A rule that reads
either one from gross gets both wrong, in opposite directions.

## The variance between the two periods

Gross falls 3,817.62, or 15.26%. Every dollar of it is explained:

```
Period 1 gross                                          25,020.96
  |
  |--[-] Leaver AU-0006, final pay in P1 only           -4,120.00   headcount
  |--[-] AU-0004 commission, one-off in P1              -1,500.00   one-off
  |--[+] Joiner AU-0008, half a fortnight worked        +1,250.00   headcount / timing
  |--[+] AU-0005 annual leave loading at 17.5%            +302.88   mix
  |--[+] AU-0002 overtime and overtime meal allowance     +249.50   rate / volume
  |
Period 2 gross                                          21,203.34
```

`-4,120.00 - 1,500.00 + 1,250.00 + 302.88 + 249.50 = -3,817.62`. Checked.

What a pay run would have to show to confirm each: a termination date of
14 Oct 2026 and a final-pay run for AU-0006; a commission statement for the
period ending 18 Oct for AU-0004; a start date of 26 Oct 2026 and a part-period
proration for AU-0008; an approved leave application covering five days for
AU-0005; and an approved overtime timesheet of 10 hours for AU-0002.

Employer super falls only 262.45 (9.43%) against a 15.26% fall in gross,
because the gross that disappeared — a termination payout and a commission —
was 1,880.00 non-QE and 1,500.00 QE.

## Where each layout came from, and how far to trust it

This is the part to read before writing a test that asserts a heading is
"what Xero prints". **Two of the three layouts are reconstructions.** A fixture
nobody can trust is worse than a gap, so each is graded.

### Employment Hero — **medium-high confidence**

Employment Hero's own help centre documents the Detailed Activity report's
columns and states that they appear in that order: locations and employees,
hours, gross earnings, pre-tax deductions, tax-exempt earnings, taxable
earnings, PAYG, STSL, SG super, employer contribution, net earnings, employer
liabilities, and gross plus super. The post-tax deductions column is documented
as optional, shown when "Show post-tax deductions" is enabled.

- Source: `help.employmenthero.com`, "Run a detailed activity report on
  payroll classic" and its Standard/Premium equivalent.
- **What is confirmed:** the set of columns and their order.
- **What is not:** exact capitalisation and punctuation. The help text is
  sentence-cased prose; the file uses title case (`Pre Tax Deductions`,
  `Super Guarantee (SG)`). Treat the spelling as *plausible*, the vocabulary as
  documented.
- **Omitted on purpose:** `Employer Liabilities`, because the fictional company
  has none configured and an all-zero column would be noise. The spec still
  lists the heading.

This report is an **aggregate**: it carries no per-pay-item earnings detail at
all. That is faithful, and it is a finding in itself — see below.

### MYOB — **low-to-medium confidence**

MYOB's help centre documents what the Payroll Register [Detail] and Payroll
Activity [Detail] reports *contain* — "the detail of the wages, taxes,
deductions and employer expenses" for each employee — and documents the
`PAYG Withholding` tax category and the seven superannuation contribution
types: Employee Additional, Employer Additional, Productivity, Redundancy,
Salary Sacrifice, Spouse, Superannuation Guarantee.

- Sources: `help.myob.com.au/prem19/win/rpa0205.754.htm`,
  `rpa0203.752.htm`, `payroll_r2.htm`, `payroll_2.010.htm`.
- **What is confirmed:** the Wages / Deductions / Taxes / Employer Expenses
  grouping; the names `PAYG Withholding`, `Salary Sacrifice`,
  `Superannuation Guarantee`, `Employer Additional`.
- **What is not:** the exported column headings. MYOB's help pages describe
  filters and subtotal options, not output columns. `Card ID`,
  `Base Salary`, `Base Hourly`, `Holiday Pay`, `Holiday Leave Loading`,
  `Unused Holiday Pay`, `Total Wages`, `Total Deductions` and `Net Pay` are
  **reconstructed** from MYOB's category vocabulary. MYOB says a default
  category list is created with a company file but does not publish it.
- Anything a customer renames is theirs anyway: MYOB payroll categories are
  user-editable, so no fixture can be canonical.

### Xero — **low confidence on the frame, medium on the pay items**

Xero Central is JavaScript-rendered and the Payroll AU API reference requires
authorisation, so neither could be read directly. Xero's own help article for
the Payroll Activity Details report describes it only as "a breakdown of
payroll activity for a specific date range or pay run".

- **What is confirmed:** that the Payroll Activity Summary groups by **pay
  item**, so the column vocabulary in any wide export is the organisation's own
  pay-item names.
- **What is not:** the frame columns and the shape of the export. `Employee ID`,
  `Full Name`, `Department`, `Gross Earnings`, `Net Pay`, `FTE`, `Start Date`
  and `Termination Date` are **reconstructed**, chosen to match the headings
  Clarivo's upload modal already auto-maps.
- `Ordinary Hours` is Xero's standard AU earnings-rate name and is used here as
  the **money** column, which is what a pay-item-wide export produces. That is
  not a mistake in the fixture — see the trap below.
- `Superannuation Guarantee Contribution` and `Salary Sacrifice
  (Superannuation)` follow Xero's superannuation line vocabulary.

**Do not cite the Xero or MYOB files as evidence of a vendor's export format.**
Cite them as realistic Australian column vocabulary, which is what the
classifier has to cope with either way.

## What Clarivo does with these files today

Run against `reconcileRegister` with gross and net mapped by hand. Every figure
below is produced by the current code on the current files, not estimated.

| File | Row breaches | Earnings Clarivo places | Employer cost Clarivo places |
|---|---|---|---|
| `xero_…10-18` | 9 across 7 rows | 2,422.50 of 25,020.96 | 2,731.97 of 2,781.97 |
| `xero_…11-01` | 9 | 1,172.00 of 21,203.34 | 2,469.52 of 2,519.52 |
| `myob_…10-18` | 10 | 25,240.96 against a gross of 25,020.96 | **0.00** of 2,781.97 |
| `myob_…11-01` | 10 | 21,400.46 against a gross of 21,203.34 | **0.00** of 2,519.52 |
| `employment_hero_…10-18` | 14 — every row, on both identities | **0.00** | 50.00 of 2,781.97 |
| `employment_hero_…11-01` | 14 | **0.00** | 50.00 of 2,519.52 |

**The upload gate refuses all six.** That is not a defect in the fixtures. The
files are arithmetically correct — the verification above proves it — and the
product cannot read them. This is the opposite of `samples/payroll_july_2026.csv`,
which is wrong on purpose so the gate can catch it. Here the gate is catching
Clarivo.

The individual misreadings, each reproducible with
`classifyComponent(header)`:

| Heading | Clarivo today | Should be | Cost |
|---|---|---|---|
| `Ordinary Hours` (Xero, a money column) | `other_quantity` | `base_salary` | The largest earning on the register drops out of gross entirely. 7 of 7 rows breach |
| `Salary Sacrifice (Superannuation)`, `Salary Sacrifice` | `base_salary` | pre-tax `other_deduction` | AU-0001 is out by 500.00 on **both** identities: the deduction is added to earnings and never subtracted from net |
| `Annual Leave`, `Annual Leave Loading`, `Holiday Leave Loading`, `Annual Leave Loading on Termination`, `Unused Annual Leave on Termination` | `absence_deduction` | `other_earning` (and `base_salary` for leave taken) | The amount moves **twice**: out of earnings and onto the deduction line. AU-0006 is out by 1,880.00 on both identities; AU-0005 by 2,033.65 |
| `Superannuation Guarantee`, `Super Guarantee (SG)` | `uncategorised` | `social_security_employer` | Counted as an unplaced **earning** toward gross. MYOB shows 0.00 employer cost against a true 2,781.97 |
| `PAYG`, `STSL` | `uncategorised` | `income_tax` | The largest deduction on the register read as an earning |
| `Pre Tax Deductions`, `Taxable Earnings` | `uncategorised` (taxable-base rule) | `other_deduction` / `ignore` | Both counted toward gross; `Taxable Earnings` double-counts the register |
| `Tax Exempt Earnings`, `Post Tax Deductions` | `income_tax` | `other_earning` / `other_deduction` | An earning booked as a tax; post-tax deductions on the statutory line |
| `Child Support` (MYOB) vs `Child Support Deduction` (Xero) | `uncategorised` vs `other_deduction` | both `other_deduction` | The same 180.00 lands on opposite sides of the bridge depending on whether the word "Deduction" is in the header |
| `Gross Plus Super` | `ignore` | `ignore` | Correct. The total-column rule earns its keep here |

Two more that `classifyComponent` never sees, because `suggestColumnRole` in
`packages/payroll-core/src/ingest.ts` claims them first:

- `Unused Annual Leave on Termination` and `Annual Leave Loading on Termination`
  are both offered as the **termination date** column, because the role rule
  matches the bare word `termination`. In these files the amounts (1,600.00 and
  280.00) are reported unreadable, so nothing is written. An **ETP of 20,000 to
  80,000** is a different story: it falls inside the Excel-serial window and is
  read as a date. `40000` becomes `2009-07-06`; `52500.50` becomes `2043-09-26`.
- `ETP` matches the FTE rule, because `ETP` is *équivalent temps plein* in the
  French vocabulary and an Employment Termination Payment in the Australian
  one. The FTE reader refuses the value (`fte_looks_like_percent`), so nothing
  is written — but the column is lost rather than classified.

## Using them

1. Upload the period-1 file, then the period-2 file, both as `bi_weekly`, AUD.
2. Map `Employee ID` / `Card ID` / `Employee Id` to the employee id,
   `Full Name` / `Employee Name` to the name, and the gross and net columns
   named in the table above. The Employment Hero files have no department.
3. Control totals to tick against: gross 25,020.96 and net 19,116.46 for
   period 1; 21,203.34 and 16,478.84 for period 2.
4. The comparison should report 1 departure (AU-0006), 1 new employee
   (AU-0008), AU-0004 decreased and AU-0002 and AU-0005 increased.

Until the classifier changes, expect the gate to refuse the files and the
breach list above to be what it says.
