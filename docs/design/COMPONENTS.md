# Components: where they live and how to use them

```
apps/web/src/
├── components/cv/            ← the Clarivo design system in React. Import from "@/components/cv".
├── components/ui/            ← shadcn/ui primitives (Radix), re-skinned. Same APIs as before.
├── components/shared/        ← the app shell and shared states (sidebar, top bar, auth frame …).
├── components/marketing/ui/  ← one line: export * from "@/components/cv". Do not add files here.
├── lib/chart-palette.ts      ← chart colours and Recharts prop presets.
└── lib/clerk-appearance.ts   ← Clerk theme (light and dark) built from the tokens.
```

Rule of thumb: **reach for `cv` first, then `ui`, then plain markup with `cv-` utilities.** Never
re-create a `cv` component in markup, and never add a colour that is not a token.

## components/cv

### Button

```tsx
<Button>Compare periods</Button>                                   // primary (Ink): one per screen
<Button variant="secondary" iconLeft="download">Export</Button>
<Button variant="ghost" size="sm">Clear</Button>
<Button variant="danger">Delete period</Button>                    // destructive confirmations only
<Button variant="accent" href="/sign-up">Get early access</Button> // marketing sign-up only
<Button href="/payroll-periods" iconLeft="upload">Upload a period</Button>
<Button variant="ghost" iconOnly icon={<RefreshCw />} aria-label="Refresh" />
<Button loading>Comparing</Button>                                  // scanning strip + aria-busy
```

`variant`: primary · accent · secondary · ghost · danger. `size`: sm 32 · md 40 · lg 48. `href` renders a
real link. `iconLeft`/`iconRight` take the built-in icon names; `icon` takes any node (Lucide). No
button is filled with rust.

### Variance — every signed change

```tsx
<Variance value={4030} percent={6.2} format={(n) => formatCurrency(n, currency)} />
<Variance value={-120} percent={-0.8} format={fmt} />          // cobalt, arrow down, true minus
<Variance value={0} />                                          // "No change", grey
<Variance value={1390} percent={7.7} format={fmt} flagged />    // above the customer's threshold
<Variance value={d.absoluteChange} percent={d.percentageChange} percentOnly />
```

Direction is spoken to screen readers ("Increase", "Decrease"), shown as an arrow and a sign, and
coloured last. Always pass `format`, so money goes through the app's formatter.

### Stat — KPI cards

```tsx
<Stat label="Net variance" value={formatCurrency(v, currency)}
      variance={{ value: v, percent: p, format: fmt }} caption="Net pay vs June 2026" />
<Stat label="Largest decrease" value="None" muted caption="Nobody was paid less" />
<Stat label="Headcount" loading />
```

`value` is always pre-formatted. `aside` puts a badge or icon button in the label row.

### Badge

`tone`: neutral · signal · accent · success · warning · danger. `icon` (12px), `dot` (the square mark,
default on for `signal`). Status tones always carry a word, and an icon where the meaning is a status.

```tsx
<Badge tone="success" icon="check">Reconciled</Badge>
<Badge tone="warning" icon="alert">Duplicate rows</Badge>
<Badge tone="signal">3 flags</Badge>
```

### SeverityBadge / SummarySeverityBadge

`<SeverityBadge severity="critical" | "warning" | "info" />` — critical is danger (impossible data:
negative net, net above gross), warning is signal and reads "Review" (a change worth a look), info is
neutral. `SEVERITY_ORDER` sorts critical first. `<SummarySeverityBadge severity="routine" | "review" |
"critical" />` for the comparison summary.

### Notice

`<Notice tone="info" | "success" | "warning" | "danger" title="…" action={<Button …/>}>text</Notice>` —
inline messages and page-level errors. Danger renders `role="alert"`, the rest `role="status"`.

### TextField

```tsx
<TextField label="Company name" defaultValue={name} />
<TextField label="Annual budget" mono prefix={currency} hint="Leave empty to remove the budget." />
<TextField label="Email" type="email" error="Enter a work email address." />
```

Label, hint and error are wired with `htmlFor` and `aria-describedby`; `mono` sets Geist Mono for
figures and ids.

### SegmentedControl

`<SegmentedControl label="Payroll cadence" options={[{ value: "monthly", label: "Monthly" }, …]}
value={v} onChange={setV} size="sm" />` — toggles with `aria-pressed`. For cadence, ranges, "Who to
list", chart modes. Not for navigation (use links).

### PageHeader, Panel, PanelBar, PanelFoot, EmptyState

```tsx
<PageHeader eyebrow="Detailed View" title="July 2026 vs June 2026"
            lede="Every employee, every component." actions={<Button …/>} />

<Panel title="Top movers" description="The largest changes in net pay." actions={<Button …/>}>…</Panel>
<Panel flush>                           {/* tables edge to edge */}
  <PanelBar>21 people · 1 with a critical flag</PanelBar>
  <Table>…</Table>
  <PanelFoot>1–25 of 214</PanelFoot>
</Panel>

<EmptyState title="No payroll data yet" description="…" action={<Button href="/payroll-periods">…</Button>} />
```

`Panel compact` uses the 16/24 heading for dense grids; `headingId` wires `aria-labelledby`.
`EmptyState visual={null}` drops the drift strip (role and account panels).

### DriftStrip, Logo, Icon

- `DriftStrip` — the signature baseline with one drifted rust tick. `size` xs · sm · md · lg,
  `animate="lift"` once after a comparison, `animate="scan"` while loading, `label` when it means
  something to a screen reader.
- `Logo` — `variant` lockup · mark · wordmark, `tone` brand · reversed · mono, `height`. Reversed on
  the Ink menu; never recoloured, outlined or placed in a container other than the app-icon tile.
- `Icon` — the 25 built-ins (arrows, status, upload, search, download, columns, chart, users, lock …)
  on a 20px grid at 1.75 stroke. Anything else is Lucide; `globals.css` sets every Lucide icon to
  stroke 1.75. Up and down arrows mean the direction of a change and nothing else.

## components/ui (shadcn, re-skinned)

| Primitive | What it draws now |
| --- | --- |
| `button` | `default` = primary Ink, `outline`/`secondary` = secondary, `ghost`, `destructive` = danger, `link` = cobalt. 32/40/48px. `success`/`warning` kept only so old call sites compile |
| `badge` | the design system's badge tones; `variant="signal"` added |
| `card` | surface, `line` border, radius-lg, no shadow, 24px padding; `CardTitle` 20/28 |
| `input`, `select` | 40px, surface, 3:1 `border`, focus ring; select menu on surface-raised + shadow-md |
| `checkbox` | radius-sm, ink when checked |
| `table` | sunken header, 13px/500 labels, 40px rows, 12px padding, hairlines, tabular figures |
| `tabs` | segmented look on surface-sunken |
| `dialog`, `alert-dialog` | scrim, surface, radius-xl, shadow-lg, 16/24 title |
| `alert` | the Notice look; `variant="destructive"` is danger |
| `skeleton` | surface-sunken |
| `dropdown-menu`, `popover`, `tooltip`, `scroll-area`, `separator` | unchanged files; colours, radii and shadows come from the bridge and the Tailwind theme |

## components/shared (the shell)

`sidebar.tsx` (Ink menu, role-gated items from `NAV_ITEMS`), `navbar.tsx` (top bar), `theme-toggle.tsx`
(`ThemeToggle`, `useIsDark`), `auth-frame.tsx` (sign-in/up layout), `status-badge.tsx` (`StatusBadge
status="processing" | "ready" | "error" | …`), `empty-state.tsx` (the old API, drawn with `cv`),
`loading-spinner.tsx` (`LoadingSpinner`, `PageLoading`: the scanning strip).

## lib

- `chart-palette.ts` — `CHART` (previous, current, up, down, flat, grid, axis, text, series[6]),
  `seriesColor(i)`, `deltaColor(v)`, `foldIntoOther(items)`, `gridProps`, `axisProps`,
  `categoryAxisProps`, `tooltipProps`, `legendProps`, `BAR_RADIUS_*`. Values are `var(--cv-…)`
  strings, so charts follow the theme with no re-render.
- `clerk-appearance.ts` — `getClerkAppearance(isDark)` for `<SignIn>`, `<SignUp>` and `<UserButton>`.
  Clerk needs concrete colours, so this file mirrors the token hex values; keep it in step when
  `clarivo-tokens.css` changes.
