---
name: clarivo-design-system
description: Clarivo's Ink & Signal design system for apps/web. Use whenever you build, restyle or review any screen, component, chart, email-like page or state in the Clarivo app or marketing site — colours, type, spacing, buttons, tables, charts, badges, empty/loading/error states, dark theme — or when a task mentions the design system, the redesign canvas, tokens, cv- classes or components/cv.
---

# Clarivo design system (Ink & Signal)

Clarivo compares payroll between two periods and shows exactly what changed. The interface stays quiet
in ink, slate and paper so the one thing that moved is impossible to miss, in signal rust.

Before changing UI, read `docs/design/COMPONENTS.md` (what exists) and, for a whole screen,
`docs/design/SCREEN_MAP.md` (its canvas board and rebuild steps). `docs/design/TOKEN_MAP.md` lists the
replacement for every old class.

## Rules

1. **Neutral by default.** Ink, slate and paper carry almost every pixel. A screen with nothing
   changed looks calm.
2. **Colour means change.** `signal` rust marks increases, flags and the drifted tick; `accent` cobalt
   marks decreases, links, selection and focus. Status colours (`success`, `warning`, `danger`) appear
   only with their icon and word. Danger is crimson, never rust: a change is not an error.
3. **Numbers never jump.** Tabular figures, right-aligned amounts in Geist Mono (`cv-num`), true
   minus (−), the company's currency through `formatCurrency` / `formatMoney` (`USD 1,234.56`).
4. **Calm, then precise.** Plain words, small radii, hairlines before shadows. Cards are outlined in
   `line` with no shadow; `shadow-cv-md` for menus, `shadow-cv-lg` for dialogs.

## Use these, in this order

1. `@/components/cv`: Button, Variance, Stat, Badge, SeverityBadge, Notice, TextField,
   SegmentedControl, PageHeader, Panel (+ PanelBar, PanelFoot), EmptyState, DriftStrip, Logo, Icon.
2. `@/components/ui`: the shadcn primitives, already re-skinned (Dialog, Select, Table, Tabs,
   DropdownMenu, Tooltip…).
3. Plain markup with `cv-` utilities: `bg-cv-bg` page, `bg-cv-surface` panels, `bg-cv-surface-sunken`
   table headers and tracks, `text-cv-ink` / `-muted` / `-subtle`, `border-cv-line` hairlines,
   `border-cv-border` for anything clickable or typed into, `rounded-cv-md` controls,
   `rounded-cv-lg` cards, `rounded-cv-xl` dialogs, `shadow-cv-focus-ring` on focus.

Never: raw Tailwind palette colours (`text-green-600`), hex colours, `hsl(var(--…))` as a colour, a
button filled with rust, an all-caps label, a coloured left-border card, emoji, or a chart colour not
from `lib/chart-palette.ts`. `apps/web/test/design-system.test.ts` enforces the colour rules.

## Patterns

- **Page:** `<PageHeader eyebrow="Dashboard" title="July 2026 vs June 2026" lede="…" actions={…} />`,
  then a toolbar row, then panels 24px apart. Content max 1360px, padding 40px desktop / 16px phone.
- **Change:** `<Variance value={d} percent={p} format={(n) => formatCurrency(n, currency)} />`; add
  `flagged` only above the customer's threshold.
- **KPI:** `<Stat label="Net variance" value={formatted} variance={{ … }} caption="vs June 2026" />`.
- **Severity:** critical → `SeverityBadge` danger; warning → signal "Review"; info → neutral.
- **Charts:** `ChartFrame` + Recharts; `deltaColor(v)` for variance (diverge from zero, never a third
  hue); `seriesColor(i)` for categories; `CHART.previous` vs `CHART.current` for two periods;
  `gridProps`, `axisProps`, `tooltipProps`. Values and legends in text tokens.
- **States:** loading = `DriftStrip animate="scan"` (`PageLoading`); empty = `EmptyState`; error =
  `Notice tone="danger"` with "Try again"; delete = `AlertDialog` with a destructive action last.
- **Voice:** calm and plain. "14 employees changed by more than USD 250.00." Periods read
  "April 2026 vs March 2026"; dates "14 Oct 2026". Sentence case; product words: Dashboard, Detailed
  View, Employee File, payroll period, cadence (Monthly, Bi-monthly, Bi-weekly, Weekly), variance,
  salary components, column mapping. No exclamation marks, no superlatives.
- **Motion:** 120ms ease-out for hover and press, 200ms for menus; honour `prefers-reduced-motion`.
- **Accessibility:** real `<button>` and `<a>`; `aria-label` on icon-only buttons; focus ring on
  everything interactive; text 4.5:1 (the ink tokens hold it on every surface in both themes).
