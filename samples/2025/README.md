# 2025 payroll fixtures

Twelve monthly CSVs for a ~150-person company, as upload fixtures for the
annual dashboard. Generated — do not hand-edit:

```bash
pnpm samples:annual-2025
```

The generator is `packages/db/src/fixtures/annual2025.ts`. It is seeded, so a
re-run reproduces these files byte-for-byte; changing the seed, the headcount
curve or any rate rewrites all twelve.

## The year

Growth through the first half to a peak of 158, a restructuring in August
concentrated in Operations and Support, then measured recovery. 180 distinct
people across the year, 8 departments, 4 salary bands, a 4.2% merit review in
July, annual bonuses in March and year-end bonuses in December.

| Month | Headcount | Joiners / leavers | Gross | Overtime | Absence | Expenses |
|---|---|---|---|---|---|---|
| Jan | 132 | — | 1,366,253 | 99 h | 61.5 d | 34,721 |
| Feb | 136 | +4 / −1 | 1,393,180 | 98 h | 62.5 d | 32,732 |
| Mar | 141 | +6 / −2 | 2,110,083 | 909 h | 34.0 d | 26,814 |
| Apr | 147 | +8 / −1 | 1,586,867 | 871 h | 34.0 d | 11,486 |
| May | 152 | +6 / −2 | 1,585,830 | 81 h | 35.0 d | 10,055 |
| Jun | 158 | +8 / −3 | 1,621,843 | 106 h | 28.0 d | 14,256 |
| Jul | 157 | +2 / −16 | 1,658,951 | 96 h | 860.5 d | 1,614 |
| Aug | 143 | +2 / −0 | 1,564,451 | 108 h | 831.5 d | 737 |
| Sep | 146 | +3 / −0 | 1,614,977 | 65 h | 31.5 d | 55,963 |
| Oct | 149 | +3 / −2 | 1,645,045 | 131 h | 31.5 d | 45,043 |
| Nov | 151 | +4 / −2 | 1,867,412 | 1,377 h | 30.5 d | 41,819 |
| Dec | 151 | +2 / −0 | 2,151,891 | 178 h | 400.0 d | 46,300 |

A leaver's `endMonth` is their last month worked, so the 16 July leavers are
what produces the August drop.

Overtime spikes for a product launch in March–April and peak season in
November. Absence peaks over the summer holidays and again in December.
Expense refunds follow conference season — busy in Q1 and Q4, near zero in
August.

## What the engine makes of it

Verified by running `computeSummary` over all twelve:

```
coverage                12/12, every period "actual"
gross                   USD 20,166,782
employer costs          USD  2,058,667
total employment cost   USD 22,225,449
employee deductions     USD  4,503,065
net                     USD 15,663,717
balance                 USD          0   <- reconciles exactly
earnings balance        USD    321,539   <- the expense refunds, by design
absence days            2,440.5
overtime hours          4,116
joiners 48   leavers 29   avg headcount 146.9   turnover 19.7%
variable pay share 12.9%   overtime 1.93% of base
effective tax 16.5%   employer on-cost 10.2%
```

`balance` closing to exactly zero means gross, net and every deduction are
internally consistent, not merely plausible.

## Two things to know before uploading

**Upload each file as Monthly**, with the matching month and year, currency
USD. The identifier headers match what the upload modal auto-maps, so no
manual column mapping is needed.

**January's joiner and leaver figures read as blank.** That is correct: there
is no December 2024 to compare against. Everything from February onward
populates. Upload a 2024 period if you want January's flows filled in.

## The deliberately uncategorised column

`Expense Reimbursement` does not match any classifier rule — neither does
`Expense Refund`. That is intentional. It leaves the column `uncategorised`,
which:

- raises the data-quality warning, and
- appears as the `other_earnings_balance` line, which exists precisely because
  real uploads carry columns nobody has mapped.

Recategorising it to "other earning" in the category manager takes that balance
to zero, which exercises the whole path end to end. If you would rather it
classify on its own, `Travel Expenses Refund` maps to `allowance`.

Every other component header was checked against
`classifyComponentWithReason` and lands in its intended category.

## Conventions

Deductions are positive numbers, matching `samples/payroll_june_2026.csv`.
Employer costs sit on top of gross, never inside it.

```
Gross = base + allowances + bonuses + commission + overtime + expenses
Net   = Gross − income tax − employee social security − loan − unpaid leave
```
