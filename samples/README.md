# Sample payroll files

Everything here is a synthetic, anonymised upload fixture. Three sets, for three
different jobs.

| Path | What it is | Use it for |
|---|---|---|
| `payroll_june_2026.csv`, `payroll_july_2026.csv` | Two hand-written monthly registers, ~20 people | The comparison pipeline: upload June, then July, then run a comparison |
| `2025/` | Twelve generated monthly registers, ~150 people — see `2025/README.md` | The annual dashboard: a full year with growth, a restructuring, a merit review and bonuses |
| `employee-file/` | Three small generated registers | The Employee File's two upload-path traps. Documented below |

## A warning about the 2026 pair

**`payroll_july_2026.csv` does not reconcile, and the upload gate refuses it.**
Its mapped earnings do not sum to its Gross column for three employees — E001 by
300.00, E005 by 20.00 and E017 by 200.00, 520.00 in total.

That is not a defect in the fixture so much as a record of a real one: Clarivo
ingested that file, built a dashboard on it and wrote a narrative about it
without a word, before the reconciliation gate existed. `apps/web/test/
reconciliation-gate.test.ts` now pins the refusal, and
`provision-and-ingest.test.ts` had to correct its own inline sheet for exactly
this reason.

So if an upload of July fails, that is the gate working. The Employee File is
where the breach became visible per person: its reconciliation strip names the
slot, the expected figure, the register's figure and the difference.

## `employee-file/` — the two writer fixtures

Generated — do not hand-edit:

```bash
pnpm samples:employee-file
```

The generator is `packages/db/src/fixtures/employeeFile/index.ts`. Every figure
in it is a literal, so a re-run reproduces these files byte-for-byte.
`apps/web/test/employee-file-fixtures.test.ts` ingests the same rows and asserts
what follows.

Section 8 of `docs/EMPLOYEE_FILE_PLAN.md` lists nine fixtures as required for
v1. Seven of them are **engine** fixtures, built and asserted in
`packages/payroll-core/src/employee/`, because what they test is arithmetic:
`gap`, `leaver-settlement`, `joiner-prorated`, `rehire`, `transfer`,
`impossible` and `mixed-sign`. These two are here instead because what they test
is what `processUpload` *writes*, which an engine fixture would have to assume.

Both registers reconcile, which is a precondition rather than a detail — see the
warning above:

```
Gross = base + housing allowance
Net   = Gross − income tax − employee social security
```

Deductions are positive numbers and employer costs sit on top of gross, matching
`samples/2025` and `payroll_june_2026.csv`. The identifier headers are the ones
the upload modal auto-maps, so no manual column mapping is needed.

### `employee-file-duplicate-row.csv` — January 2026, 4 rows, 3 people

E002 appears **twice**, byte-identical: the duplicated-export shape, which is
the one nothing in the data can tell apart from a genuine second payment.

**This file cannot be uploaded through the app.** `validateRows` treats a
repeated employee id as an error, not a warning, and `payrollPeriods.ingest`
refuses before anything is written. The gate is there deliberately: as a warning
the period was marked `ready` with both rows in it, and the comparison then kept
the first row per id and dropped the rest, so one person paid twice produced a
dashboard reading "no change" with no flag of any kind.

So duplicate rows in `employee_snapshots` are historical data — written before
that gate existed, or by a path that skips it. The fixture's job is to exercise
the writer, which the test does by calling `processUpload` directly, and to
prove the gate refuses the same rows.

What the engine should make of it:

- `payroll_periods.total_gross` is **17,600** — every row accumulated, which is
  why summing duplicates is the figure that ties to the register.
- All four snapshot rows share one `created_at`, because they are inserted in a
  single statement. That is why `created_at` cannot break a duplicate-row tie,
  and why the Employee File has no `DISTINCT ON` anywhere.
- E002's January slot is `kind = "duplicate"` with a gross of **8,800** — both
  rows summed, both carried through for display, and the slot excluded from K5,
  K6, K7, K8 and every delta.
- The file names the R6 gap: `period_component_totals` and the annual dashboard
  keep one row per employee per period, so for this employee the two screens
  differ by the dropped row, on purpose.
- The duplicate marker is visible from the **list**, without opening a file.

### `employee-file-reupload-1.csv` / `-2.csv` — February 2026, same window twice

The second upload corrects E003's base salary, which was understated: 3,000
becomes 3,300, so her gross goes from 3,300 to 3,600.

Both uploads go through the real gate and both are accepted. `processUpload`
always inserts and nothing deletes, so both periods exist and both are `ready` —
de-duplication is a read-time decision, made by `dedupePeriods`.

What the engine should make of it:

- February is **one** slot, carrying 3,600. Never 3,300, and never the sum.
- `supersededCount` is **1**, so the coverage line can say "1 superseded upload
  ignored" rather than leaving the second upload unexplained.
- `mergedRunCount` is 1. A re-upload is superseded; an off-cycle run sharing a
  month is merged. The two are different facts and the file says which.

E003 is deliberately in **both** fixtures. Her full-year gross is therefore
3,300 (January) + 3,600 (February), which means a re-upload assertion read off a
year total would pass for the wrong reason. Assert it on the slot.
