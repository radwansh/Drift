# Screen map: route → canvas board → files → how to rebuild

Canvas: "Clarivo SaaS Redesign" (https://claude.ai/artifact/8YzwkXAX9pGQFwUdNAXPHh). Paths are under
`apps/web/src/`. "Legacy" counts are what `test/design-system.test.ts` still flags in that file.

Every screen shares the same frame, built in phase 3: the Ink side menu, the 64px top bar, and a page
that starts with `<PageHeader eyebrow title lede actions>`, followed by a toolbar `Panel` (or a bordered
row) and then content panels 24px apart. Panels are `Panel` (surface, `line` border, radius-lg, 24px
padding, no shadow). Tables sit in `Panel flush` or a `rounded-cv-lg border border-cv-line` box.

| # | Route | Board(s) | Status |
| --- | --- | --- | --- |
| 1 | `/dashboard` | Dashboard · Dashboard: first run · Dashboard: dark theme · Phone: dashboard | Done in the kit (phase 3) |
| 2 | `/employees` | Employee File: list | Phase 4 |
| 3 | `/employees/[externalId]` | Employee File: one person | Phase 4 |
| 4 | `/detailed` | Detailed View | Phase 4 |
| 5 | `/payroll-periods` + upload | Payroll periods · Upload payroll file (steps 1 to 5) | Phase 4 |
| 6 | `/annual-salaries` | Annual salaries | Phase 4 |
| 7 | `/integrations` | Integrations | Phase 4 |
| 8 | `/settings` (+ 3 sub-pages) | Settings: company · column mappings · users · plan and billing | Phase 4 |
| 9 | `/sign-in`, `/sign-up` | Sign in (Clerk, themed) | Done in the kit (phase 3) |
| — | Menu on a phone | Phone: menu open | Done in the kit (sidebar) |
| — | Loading, error, empty, confirm | Patterns: navigation, tables, charts, overlays, states | Phase 5 |

---

## 1. Dashboard — `/dashboard` (done)

Reference implementation for every other screen: read `app/(main)/dashboard/page.tsx` and
`components/dashboard/*` before starting phase 4. Patterns to copy from it:

- `PageHeader` with the comparison as the title, current period first: "July 2026 vs June 2026".
- KPI cards are `Stat` (`components/dashboard/kpi-card.tsx` wraps it). The figure is pre-formatted
  with `formatCurrency`; the change is `<Variance format={...}>`.
- Severity: `SeverityBadge` (critical → danger, warning → signal "Review", info → neutral).
- Charts: `ChartFrame` + Recharts with `CHART`, `axisProps`, `tooltipProps` from `lib/chart-palette.ts`.
  Variance bars diverge from zero: `deltaColor(value)`.

## 2. Employee File list — `/employees`

- **Board:** Employee File: list.
- **Files:** `app/(main)/employees/{page,loading,error}.tsx`, `components/employee-file/employee-list.tsx`
  (legacy 2), `employee-list-filters.tsx`, `employee-list-footer.tsx`, `employee-column-picker.tsx`.
- **Rebuild:**
  - Header: `PageHeader eyebrow="Employee File" title="Employees paid in {year}"` with the scope's
    lede; actions: the column picker trigger as `Button variant="secondary" iconLeft="columns"`.
  - Toolbar row (bordered, surface): `SegmentedControl` for "Who to list" (`LIST_SCOPES`, labels from
    `SCOPE_DEFINITIONS`), then Range, Period (when `range === "slot"`) and "Cadence and currency"
    selects, then the search input (`Input` with the `search` icon, placeholder "Name or external id").
    The scope's definition sits under the toolbar as 13px `text-cv-ink-subtle`.
  - Table in `Panel flush`: a `PanelBar` with "{n} people · {k} with a critical flag", the department
    and flags filters (`Select` size 32px) and a ghost "Clear"; then the table; then `PanelFoot` with
    "1–25 of 214 · sorted by …" and Previous/Next as `Button variant="secondary" size="sm"`.
  - Cells: Employee = name 14px/600 over the external id in Geist Mono 12px `text-cv-ink-subtle`, the
    whole cell a link to the file. Status = `Badge tone="neutral"` with `listStatus` text ("Active",
    "Left Apr 2026"). Critical flags = `Badge tone="danger" icon="alert"` with the count; zero in
    `text-cv-ink-subtle`. Figures `cv-num`.
- **Keep:** URL state (`employee-list-url.ts`), the "sorts this page only" header note, the column
  model (`employee-columns.ts`, F1), `localStorage` preferences, the F5 label "Critical flags".

## 3. Employee File, one person — `/employees/[externalId]`

- **Board:** Employee File: one person.
- **Files:** `components/employee-file/employee-file-view.tsx`, `employee-file-header.tsx` (legacy 2),
  `employee-summary-band.tsx`, `employee-reconciliation.tsx` (legacy 2), `employee-period-table.tsx`,
  `employee-period-chart.tsx` (legacy 1), `employee-component-matrix.tsx`, `employee-exceptions.tsx`,
  `employee-change-log.tsx`, `employee-file-panels.tsx`, plus `loading.tsx` and `error.tsx`.
- **Rebuild, top to bottom (the spec's order, unchanged):**
  - Back link "All employees" (`Button variant="ghost" size="sm"` with an arrow-left Lucide icon) and
    the Range / cadence selects on the right.
  - Header `Panel`: eyebrow "Employee File · {scope label}", the name in the `title` style, a row with
    the external id as a mono chip (`rounded-cv-sm bg-cv-surface-sunken font-cv-mono text-xs`), the
    department, and the status `Badge`. Facts in a 4-column `dl`: Hire date, Termination date, FTE,
    Tenure. Missing facts read "… not mapped" in `text-cv-ink-subtle`. The id-reuse and other-scope
    warnings become `Notice tone="warning"`.
  - Summary band: six `Stat`s in a 3-column grid (Gross paid in range, Net paid in range, Employee
    deductions, Total employment cost, Recurring pay latest clean period, Variable and one-off pay).
    Unavailable figures use `Stat muted` with the reason from `employee-file-text.ts`.
  - Reconciliation `Panel`: header badge "{n} of {m} tie out" (`success`/`warning`); table Check ·
    Period · Components imply · Register says · Difference · Result, each result a `Badge` with icon
    and word ("Ties out" success, "Off by …" danger, "Not provided" neutral). The annual-dashboard
    difference note becomes `Notice tone="warning"`.
  - Every period in range: the kinds are a `Badge` — Actual (neutral), Duplicate rows (warning, icon
    alert, and the row on `bg-cv-warning-soft`), Not paid (neutral), Not uploaded (neutral, figures
    shown as "Not uploaded", never 0). Flags column: `Badge tone="danger"`.
  - Gross by category: categories take `seriesColor(i)` in order; a duplicate slot's second row is a
    hatched `<pattern>` in `CHART.series[0]`; a missing slot is a hatched outline in `CHART.axis`.
  - Component history: values in `cv-num`; a change from the period before gets an arrow in
    `text-cv-delta-up-ink` / `text-cv-delta-down-ink` plus sr-only "Increase"/"Decrease".
  - Exceptions and "What changed, and when" side by side on desktop; changes use `<Variance>`.
- **Keep:** no AI narrative and no "all clear" badge (F11); the role panels ("Not available for your
  role") as `EmptyState` with `visual={null}`; `formatRatio` for FTE; every figure via `formatMoney`.

## 4. Detailed View — `/detailed`

- **Board:** Detailed View.
- **Files:** `app/(main)/detailed/page.tsx`, `components/detailed-view/comparison-table.tsx`
  (legacy 4), `employee-detail-row.tsx` (legacy 10), `column-picker.tsx` (legacy 1), `saved-views.tsx`,
  `export-button.tsx`.
- **Rebuild:**
  - `PageHeader eyebrow="Detailed View" title="{current} vs {previous}"`; the period toolbar reused
    from the Dashboard (`PeriodSelector` with `actions` = Saved views, Export, Columns · {n} of {m}).
  - Filter row: search ("Search by name or ID"), All departments select, status filter.
  - Table: status as words — Increased / Decreased use `<Variance percentOnly>` beside the word,
    Unchanged / New / Departed are neutral `Badge`s. Every delta cell is `<Variance format={…}>`; a
    cell above the customer's threshold gets `flagged` (signal-soft ground + square mark), nothing else.
  - Expanded row (`employee-detail-row.tsx`): the component table Component · Previous · Current ·
    Change, the components total and net rows on `bg-cv-surface-sunken`, then "Anomaly flags" as a
    list with `SeverityBadge`. Replace every green/red with delta tokens.
  - Saved views dialog: the re-skinned `Dialog` with `TextField` ("View name").
- **Keep:** the column model `{component, visible, mode}` and its four modes; saved views in
  `localStorage` (`drift_saved_views`); additive column mapping (fixed columns always present).

## 5. Payroll periods and the upload wizard — `/payroll-periods`

- **Boards:** Payroll periods; Upload payroll file steps 1 (file) to 5 (processing).
- **Files:** `app/(main)/payroll-periods/page.tsx`, `components/payroll-periods/period-card.tsx`,
  `upload-modal.tsx` (legacy 10), `mapping-row.tsx` (legacy 17), `components/shared/file-dropzone.tsx`,
  `components/shared/confirm-dialog.tsx`.
- **Rebuild the list:** the board shows a table rather than cards — Period · Dates · Cadence · Status ·
  Employees · Gross pay · Uploaded · File · Actions. Move each `PeriodCard`'s content into a row and
  keep its actions (Compare → `/dashboard?periodId=`, Delete → confirm). Status via `StatusBadge`
  (Processing with a scanning strip, Ready, Error); reconciliation as `Badge` "Reconciled" (success,
  check) or "Does not reconcile" (warning, alert) with the tooltip text unchanged. Toolbar: search,
  All cadences, All statuses, then ghost "Clear all" and primary "Upload period". Pagination in
  `PanelFoot`. "Delete July 2026?" uses `AlertDialog` with a `destructive` action.
- **Rebuild the wizard** inside the re-skinned `Dialog` (600px, radius-xl, 24px padding): a header
  with the title "Upload payroll file", "Step n of 5" in 13px ink-subtle and five 4px progress bars
  (ink when done, `line` when not); a footer with a hint on the left and Back (secondary) / Next
  (primary) on the right.
  1. File: the dropzone on `bg-cv-surface-sunken` with a dashed `border-cv-border`, "Supported formats"
     link, the chosen file as a mono chip.
  2. Period details: Period type select, Month and Year (or Start and End date) fields.
  3. Column mapping (`mapping-row.tsx`): source column (14px/500) over its sample (mono 12px), an arrow,
     the mapping select, then the role select (Pay component · Reporting dimension · Identifiers ·
     Records) and the AI confidence in mono. "Required before importing" in `text-cv-danger-ink` with
     the x-circle icon. "Create salary component" opens a nested `Dialog`.
  4. Data check: one row per check (Earnings add up to gross, Gross minus deductions equals net, No net
     above its gross, No negative net, No employee ID used twice, Every component has a category,
     Control totals) with a check-circle in `text-cv-success-ink` or an x-circle in
     `text-cv-danger-ink`, plus the word. Blocking failures: `Notice tone="danger"` "Nothing is saved
     until the register is corrected and re-uploaded." Non-blocking: `Notice tone="warning"`.
  5. Processing: `DriftStrip size="lg" animate="scan"` with "Saving your payroll data…"; then
     `Notice tone="success"` "Upload complete" with "Open the dashboard", or `Notice tone="danger"`
     "Import failed" with Back and Try again. "The pay imported. These columns did not." is a warning.
- **Keep:** every step's validation, `useUpload`, the AI mapping calls and the reconciliation gate.

## 6. Annual salaries — `/annual-salaries`

- **Board:** Annual salaries.
- **Files:** `components/annual/annual-dashboard.tsx` (legacy 2) and its children:
  `annual-kpi-cards.tsx`, `annual-kpi-card.tsx`, `annual-periods-chart.tsx` (legacy 9),
  `annual-bridge.tsx` (legacy 2), `annual-categories.tsx` (legacy 1), `annual-departments.tsx`,
  `annual-drilldown.tsx`, `annual-statutory.tsx` (legacy 4), `annual-absences.tsx`, `annual-mix.tsx`,
  `annual-headcount-chart.tsx` (legacy 3), `annual-yoy.tsx`, `annual-budget.tsx` (legacy 2),
  `annual-scenario.tsx` (legacy 2), `annual-insights.tsx`, `annual-warnings.tsx` (legacy 3),
  `annual-audit-trail.tsx`, `annual-export.tsx`, `category-manager.tsx` (legacy 3), `year-selector.tsx`.
- **Rebuild:**
  - Header: eyebrow "Annual salaries", title = the year ("2026"), lede "Calendar-year payroll totals and
    forecast"; actions: Categorise components (secondary), Set annual budget (secondary), Export
    (secondary, the existing menu). Year, cadence, currency and forecast-method selects in the toolbar.
  - KPI cards → `Stat` (keep every label and caption the scope rules produce).
  - Periods chart: actual bars `CHART.current` (ink); estimated `CHART.previous`; forecast outlined
    in `CHART.current` with no fill; missing hatched in `CHART.axis` with "Not uploaded" in the
    tooltip; "Last year" line `CHART.previous` dashed. Cumulative toggle → `SegmentedControl size="sm"`.
  - Gross to net bridge: subtotals (Gross, Net, Total employment cost) `CHART.current`; amounts that
    reduce `CHART.down`; amounts that add `CHART.up`. Never a third hue.
  - Salary components, statutory, absences, mix: categories via `seriesColor(i)` in order; a seventh
    folds into "Other" (`foldIntoOther`).
  - Headcount: the line `CHART.current`; joiners above the line `CHART.up`; leavers below `CHART.down`.
  - Warnings (`annual-warnings.tsx`): one `Notice` per warning, tone by severity (critical → danger,
    warning → warning, info → info) with the action button inside.
  - Insights: a `Badge` "Rule-based" when `source === "rules"`; the model name only when it is AI.
  - Budget and scenario inputs: `TextField mono` with the currency as `prefix`.
  - Category manager: `Dialog` with search, the uncategorised toggle and a table of components with a
    `Select` per row; "Saved" as `Badge tone="success" icon="check"`.
- **Keep:** the slot model, `kind` rendering (a missing month never vanishes), `ChartFrame` on every
  chart, the round-trip budget tests, and the print board pack.

## 7. Integrations — `/integrations`

- **Board:** Integrations.
- **Files:** `app/(main)/integrations/page.tsx`, `components/integrations/integration-card.tsx`.
- **Rebuild:** a 2-column grid of `Panel`s, one per system (SAP SuccessFactors, Workday, ADP Workforce
  Now, Sage HR and Payroll, Gusto): name as heading, one-line description, status `Badge`
  ("Connected" success with check, "Not connected" neutral), a `dl` with Last sync and Schedule in
  mono, then actions — Connect (primary) when not connected; Sync now (secondary), Configure
  (secondary), Disconnect (ghost) when connected. No third-party logos.

## 8. Settings — `/settings`, `/settings/column-mappings`, `/settings/users`, `/settings/billing`

- **Boards:** Settings: company · column mappings · users · plan and billing.
- **Files:** the four `page.tsx` files (column mappings: legacy 2), `components/settings/billing-card.tsx`
  (legacy 1), `user-invite-dialog.tsx`.
- **Shared:** `PageHeader eyebrow="Settings"` and a tab row under it (Company · Column mappings ·
  Users · Plan and billing) as links with `aria-current="page"`: 40px, 14px/500 `text-cv-ink-muted`,
  the current one `text-cv-ink` 600 with a 2px ink underline. Forms use a two-column grid of
  `TextField`s and `Select`s; sections are separated by a `line` rule with the label column (280px) on
  the left.
- **Company:** Company name, Tax ID / EIN, Address, Base currency, Employee range; "Save changes"
  primary, bottom right.
- **Column mappings:** table Column in your file · Sample (mono) · Maps to (select) · Type · Matches
  employees · In Detailed View (switch) · Status (`Badge`: AI suggestion = accent, Confirmed = success,
  Do not import = neutral). Actions: Import, Export, Test with a file (secondary); "Confirm n
  suggestions" (primary) when there are any.
- **Users:** table User (name over email) · Role · Status (Active success, Invited neutral) · Joined ·
  Actions (Resend invite, Remove as ghost buttons with `aria-label`s); "Invite a user" primary opens the
  re-skinned invite dialog (Name, Email, Role). Under it, the "What each role can do" matrix with
  check icons in `text-cv-success-ink` and a dash in `text-cv-ink-subtle`.
- **Plan and billing:** current plan `Panel` with usage as `Stat`s (Employees in your latest file,
  Comparisons this month, Users); plan cards in a 4-column grid, the current plan outlined in ink
  (`ring-1 ring-cv-ink`); invoices table; payment method. Prices stay whatever the page shows today.

## 9. Sign in and sign up (done)

`components/shared/auth-frame.tsx` draws the split layout from the board: Ink panel with the reversed
lockup on the left (desktop only), Clerk's card on the right themed by `getClerkAppearance(isDark)`.

## States (phase 5) — board "Patterns"

| State | Build it with |
| --- | --- |
| Page loading (`loading.tsx`) | `PageLoading` from `components/shared/loading-spinner.tsx` (scanning drift strip, label for screen readers) |
| Panel loading | `Skeleton` rows at the panel's real height |
| Error (`error.tsx`) | `Notice tone="danger"` with the existing title and text, "Try again" (secondary) and the existing back link |
| Empty | `EmptyState` (drift strip, title, one line, one primary action) |
| Confirm a delete | `AlertDialog`, title "Delete July 2026?", Cancel (secondary) then Delete (destructive) |
| Dark | nothing extra: every token switches on `.dark`. Check contrast of anything you hand-coloured |
