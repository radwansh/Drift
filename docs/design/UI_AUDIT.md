# Clarivo app UI audit: what ships today vs Ink & Signal

**Source.** Production deployment `dpl_J6LBfiYLJPhYiwonZCBP8fyuy9kg` (clarivo-app.com, Vercel project
`drift`), built from `radwansh/Drift` at `9710ae9` (8 Nov 2026). Read from the source; screenshots of
the live screens were taken on 26 Oct. Counts are over `apps/web/src/app/(main)`, `(auth)` and
`components/{annual,dashboard,detailed-view,employee-file,integrations,payroll-periods,settings,shared}`.

## In one table

| Area | Today | Ink & Signal |
| --- | --- | --- |
| Type | Inter for the app (root layout); Instrument Sans + Geist Mono only on the marketing pages | Instrument Sans for words, Geist Mono for figures, everywhere |
| Palette | shadcn default: blue primary `hsl(221 83% 53%)`, slate grounds, dark slate side menu | Ink, slate and paper; rust only for change, cobalt for links, selection and decreases |
| Design tokens | **0** `cv-` classes in the app | `cv-` tokens throughout (the marketing site already has them) |
| Colour classes | **520** shadcn semantic classes, **110** raw Tailwind palette classes, **8** hex literals | tokens only |
| Change colours | increase green, decrease red (`text-green-600`, `text-red-600`, green/red % badges) | increase rust, decrease cobalt, always with an arrow and a sign |
| Charts | 7 hard-coded hex per component (`#3b82f6`, `#8b5cf6`, `#ef4444`…), `hsl(var(--primary))` with opacity steps, dashed grids | diverging delta colours; `chart-1…6` for categories; solid hairline grid |
| Dark theme | next-themes toggles `.dark`, but the `cv-` dark tokens sit on `[data-cv-theme="dark"]`, which nothing sets | Dark keeps every role; primary turns paper; rust stays #E0592A |
| Radii, elevation | `rounded-xl` cards with `shadow`, `hover:shadow-md` | 10px cards outlined in `line`, no shadow; shadows only for menus and dialogs |

## Menus

- **Side menu** (`components/shared/sidebar.tsx`): 256px, dark slate. Brand is a blue `BarChart3` icon
  with "Clarivo" set in bold Inter and "Payroll Variance Analysis" beneath, not the logo. Items, in
  order: Employee File (admin and manager only), Dashboard, Annual Salaries, Detailed View, Payroll
  Periods, Integrations, Settings — Title Case. Active item: `bg-primary/20` blue tint. Foot: "v1.0.0".
- **Top bar** (`navbar.tsx`): 64px; "Welcome, {first name}" as the page's `h1`, theme toggle, a bell
  with no action, Clerk's `UserButton` unthemed (`afterSignOutUrl="/login"`, a path middleware now
  redirects).
- **Settings has no sub-navigation.** `/settings/column-mappings`, `/settings/users` and
  `/settings/billing` exist but nothing links to them; they are reachable only by typing the URL.
  The redesign adds tabs (boards "Settings: …").

## Screens and their KPIs

| Route | Title today | KPIs and panels |
| --- | --- | --- |
| `/employees` | "Employee File" | List with Paid in range / Currently employed / Everyone on record, range, period, cadence and currency, search, department and flag filters; columns Employee, Status, Critical flags, Department, Last paid slot, Latest gross, Latest net, Paid periods, Range gross (FTE optional) |
| `/employees/[id]` | the person's name | Header facts (hire date, termination date, FTE, tenure); summary band: Gross paid in range, Net paid in range, Employee deductions, Total employment cost, Recurring pay (latest clean period), Variable and one-off pay; Reconciliation (R3, R5); Every period in range; Gross by category per period; Component history; Exceptions; What changed, and when |
| `/dashboard` | "Payroll Variance Dashboard" | Net Variance, Employees Affected, New Employees, Departed Employees, Largest Increase, Largest Decrease; AI Summary (rule-based text labelled "AI"); Variance Distribution; Component Breakdown; Anomaly Flags; Department Breakdown; Top Movers |
| `/annual-salaries` | "Annual salaries" | Salaries paid, Total employer cost, Headcount, Cost per employee, Taxes and social security; Actual and forecast by period; Gross to net; Salary components; Cost by department (+ drill-down); Taxes and social security; Absences; Fixed vs Variable Pay; Headcount, joiners and leavers; Year-on-year; Budget vs forecast; Scenario planner; insights; data-quality warnings; change history; export |
| `/detailed` | "Detailed View" | Search, department filter, column picker, saved views, export; comparison table with expandable rows (components, net delta, "AI Anomaly Flags") |
| `/payroll-periods` | "Payroll Periods" | Search, type and status filters, Clear All, Upload New Period; period cards (Compare, Delete, Employees, Gross, Processing/Ready/Error, Reconciled/Does not reconcile); pagination; upload wizard (file → period → AI mapping → data check with 7 checks → save) |
| `/integrations` | "Integrations" | SAP SuccessFactors, ADP Workforce Now, Sage, Workday, Gusto cards: Last Sync, Schedule, Configure, Connect |
| `/settings` | "Settings" | Company Profile: Company Name, Tax ID / EIN, Address, Base Currency, Employee Range |
| `/settings/column-mappings` | "Column Mappings" | Export, Import, Edit, Add Mapping, Test Mapping; table Source Column, Mapped Component, Identifiers, Visible |
| `/settings/users` | "User Management" | Invite User (Name, Email, Role: Admin, Manager, Viewer); table Name, Email, Role, Status, Joined |
| `/settings/billing` | "Billing & Subscription" | Subscription status, Active Employees, Comparisons This Month, Next Billing Date; Invoice History; Pricing |
| `/sign-in`, `/sign-up` | Clerk prebuilt | grey gradient page, lockup image, Clerk's default (or `dark`) theme |

## Components

- **shadcn/ui primitives** (`components/ui`, 17): alert, alert-dialog, badge, button, card, checkbox,
  dialog, dropdown-menu, input, popover, scroll-area, select, separator, skeleton, table, tabs, tooltip.
- **Shared** (`components/shared`, 11): sidebar, navbar, nav-icons, empty-state, status-badge,
  currency-badge, currency-input, confirm-dialog, error-boundary, file-dropzone, loading-spinner.
- **Feature folders:** annual (24 files), employee-file (19), dashboard (9), detailed-view (5),
  payroll-periods (3, including the 1,246-line upload wizard), settings (2), integrations (1).
- **Design-system components** existed only for marketing, in `components/marketing/ui` (8 of the
  system's 10: TextField and Notice were never ported).
- **Icons:** about 70 Lucide icons at the default 2px stroke (the system draws at 1.75).

## Buttons

`variant="outline"` 57 times, `ghost` 14, `destructive` 10, `secondary` 8, plus `success` and `warning`
buttons (green and amber fills) and `info` badges. Primary actions are shadcn blue at 36px (`h-9`);
the system's primary is Ink at 40px, and it has no green, amber or rust buttons.

## Specific departures from the system

1. Increases in green and decreases in red on KPI cards, tables and % badges (the system: rust up,
   cobalt down; a change is not a success or an error).
2. The summary banner is titled "AI Summary" though the text is built by rules in the page
   (CLAUDE.md: never label rule-based text with a model name), with a coloured left-border stripe and
   a "Regenerate" button that only logs to the console.
3. Anomaly flags in red, amber and blue boxes with uppercase tracked type labels (the system: sentence
   case, no all-caps; status colours only with an icon and a word).
4. Component chart colours assigned by component name, so "deduction" is red and "bonus" purple; the
   system's variance charts diverge from zero in two colours.
5. Page titles in `text-2xl font-bold` with Title Case ("Payroll Variance Dashboard").
6. Periods read "Comparing June 2026 vs July 2026", previous first (the system: "July 2026 vs June 2026").
7. Every chart's hidden data table (`ChartFrame`) carried `sr-only` on the `<table>`, which cannot
   shrink below its content, so pages with charts were about 1,100px too wide. Fixed in the kit.

## Already right, and kept

- Money: one formatter, always `USD 1,234.56`, tabular figures in tables.
- Charts wrapped in `ChartFrame` with a text alternative.
- Role gating of the Employee File link and the employee-level procedures.
- The marketing site's design-system ports (now shared with the app through `components/cv`).

## Before and after

`before-after/` holds the Dashboard as captured on 26 Oct (the capture could not load the web font,
so the type there is a fallback serif; colours, layout and components are as shipped) and the rebuilt
Dashboard from this kit in light, dark and on a phone.

## Marketing site notes (out of scope here)

The landing page already uses the system's tokens and components. One departure remains: the hero
eyebrow "PAYROLL DASHBOARD · NOW IN BETA" is set in uppercase Geist Mono, where the system asks for
sentence case and no all-caps labels.
