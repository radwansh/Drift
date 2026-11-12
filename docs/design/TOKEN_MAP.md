# Token map: what every old class becomes

Swap by **meaning**, not by colour. A green number on a change is an increase (rust); a green tick on a
check is success (green). When in doubt, ask what the colour was telling the reader.

## 1. The shadcn bridge (in `globals.css`)

These variables keep their names, so `bg-card`, `text-muted-foreground`, `border-input` and every
`components/ui` primitive repaint with no edits. New code should still prefer the `cv-` utilities.

| shadcn variable | Ink & Signal role | Light | Dark |
| --- | --- | --- | --- |
| `--background` | `bg` | #F7F8F9 | #0C1116 |
| `--foreground`, `--*-foreground` | `ink` | #121A22 | #ECEFF2 |
| `--card` | `surface` | #FFFFFF | #121A22 |
| `--popover` | `surface-raised` | #FFFFFF | #1C2229 |
| `--primary` / `--primary-foreground` | `primary` / `on-primary` | #121A22 / #FFFFFF | #F3F5F7 / #121A22 |
| `--secondary`, `--muted`, `--accent` | `surface-sunken` (shadcn's "accent" is a hover ground, not cobalt) | #F0F3F5 | #080D11 |
| `--muted-foreground` | `ink-subtle` | #677079 | #989FA7 |
| `--destructive` | `danger` | #D02C61 | #D02C61 |
| `--border` | `line` (decorative hairline) | #E6EAED | #282F36 |
| `--input` | `border` (3:1, anything you can click or type into) | #7F8790 | #687078 |
| `--ring` | `focus` | #2F5BD3 | #79A1FC |
| `--radius` | `radius-lg` | 10px | 10px |
| `--sidebar` | Ink side menu | #121A22 | #080D11 |

Tailwind defaults now speak the system too: `font-sans` = Instrument Sans, `font-mono` = Geist Mono,
`rounded-sm/md/lg/xl` = 4 / 6 / 10 / 16px, `shadow-sm/md/lg` = the system's three shadows.

## 2. Class swaps

| Old | Meaning | New |
| --- | --- | --- |
| `text-green-600 dark:text-green-400` on an amount or % | increase | `<Variance>` (or `text-cv-delta-up-ink` + arrow + sign) |
| `text-red-600 dark:text-red-400` on an amount or % | decrease | `<Variance>` (or `text-cv-delta-down-ink` + arrow + sign) |
| `text-gray-500`, `.unchanged-text` | no change | `text-cv-delta-flat-ink`, "No change" |
| `.increase-text` / `.decrease-text` (from `lib/utils.ts`) | change | `<Variance>`; then delete the helper's class names |
| `Badge variant="success"` on a % change | increase | `<Variance percentOnly>` — a change is not a success |
| `Badge variant="destructive"` on a % change | decrease | `<Variance percentOnly>` — a change is not an error |
| `text-green-*`, `bg-green-100` on a check, "Reconciled", "Saved" | success | `Badge tone="success" icon="check"` / `text-cv-success-ink` + word |
| `text-red-*`, `text-destructive` on an error | error | `text-cv-danger-ink` + `x-circle` + word; `Notice tone="danger"` for blocks |
| `text-amber-*`, `bg-amber-50`, `.anomaly-warning` | warning | `text-cv-warning-ink`, `bg-cv-warning-soft`, `Notice tone="warning"` |
| `text-blue-*`, `bg-blue-50`, `.anomaly-info` | information | `text-cv-accent`, `bg-cv-accent-soft`, `Notice tone="info"` |
| `.anomaly-critical`, red flag rows | impossible data | `SeverityBadge severity="critical"` (danger) |
| anomaly `warning` on a comparison | a change worth review | `SeverityBadge severity="warning"` (signal, "Review") |
| a cell above the customer's threshold | flag | `<Variance flagged>` (signal-soft ground + square mark) |
| `text-foreground` | primary text | `text-cv-ink` |
| `text-muted-foreground` | secondary copy / captions | `text-cv-ink-muted` (copy) or `text-cv-ink-subtle` (captions, placeholders) |
| `bg-background` | page | `bg-cv-bg` |
| `bg-card`, `Card` | panel | `bg-cv-surface` + `border-cv-line`, or `<Panel>` |
| `bg-muted`, `bg-muted/50` | sunken | `bg-cv-surface-sunken` |
| `border`, `border-border` | hairline | `border-cv-line` |
| `border-input` | control edge | `border-cv-border` |
| `text-primary` used as a link or highlight | link / selection | `text-cv-accent` |
| `bg-primary/10`, `ring-primary/30` (selected) | selection | `bg-cv-accent-soft`, `ring-cv-accent` |
| `bg-destructive/10` | danger ground | `bg-cv-danger-soft` |
| `bg-black/50`, `bg-black/80` (overlays) | scrim | `bg-cv-scrim` |
| `text-2xl font-bold` page titles | title | `<PageHeader title>` (28/34, 600, −2%) |
| `CardTitle className="text-sm font-medium"` | panel heading | `<Panel title>` (20/28, 600) or `cv-type-subheading` (16/24) |
| `uppercase tracking-wider text-[10px]` | label | sentence case, `cv-type-caption` (12px floor) |
| `font-mono text-xs` on amounts | figure | `cv-num` (Geist Mono 13px, tabular, right-aligned) |
| `rounded-xl` on cards | radius | `rounded-cv-lg` (cards, tables), `rounded-cv-xl` (dialogs) |
| `shadow`, `hover:shadow-md` on cards | elevation | none: cards are outlined; `shadow-cv-md` only for menus and popovers |
| `border-l-4 border-l-green-500` stripes | decoration | remove; put a `Badge` in the header |
| `h-9` controls | control height | `h-10` (40px, `control-md`); `h-8` when dense |

## 3. Charts (`lib/chart-palette.ts`)

| Old | New |
| --- | --- |
| Per-component hex (`#3b82f6` salary, `#8b5cf6` bonus, `#ef4444` deduction…) on a variance chart | `deltaColor(value)`: rust up, cobalt down, grey zero. Variance charts diverge from zero; never a hue per component |
| Categories with any palette | `seriesColor(i)` = `chart-1` … `chart-6` in order; a 7th folds into "Other" (`foldIntoOther`) |
| `hsl(var(--primary))` actual bars | `CHART.current` (ink) |
| `hsl(var(--primary) / 0.4)` estimated | `CHART.previous` |
| `hsl(var(--primary) / 0.12)` + stroke, forecast | no fill, stroke `CHART.current` |
| Hatched missing period | hatch in `CHART.axis`; tooltip says "Not uploaded" |
| `hsl(var(--destructive))` leavers / reductions | `CHART.down` |
| `hsl(var(--primary) / 0.6 / 0.3)` statutory steps | `seriesColor(0)`, `seriesColor(1)`, `seriesColor(2)` |
| Previous vs current period side by side | `CHART.previous` vs `CHART.current` |
| `<CartesianGrid strokeDasharray="3 3">` | `<CartesianGrid {...gridProps}>` (solid hairline) |
| `tick={{ fontSize: 11 }}` | `{...axisProps}` / `{...categoryAxisProps}` (Geist Mono 12px, `ink-subtle`) |
| `contentStyle={{ fontSize: 13, borderRadius: 8 }}` | `{...tooltipProps}` (surface-raised, `line`, shadow-md) |
| bar radius `[4, 4, 0, 0]` | `BAR_RADIUS_VERTICAL` / `BAR_RADIUS_HORIZONTAL` (2px, `radius-xs`) |

Values, labels and legends stay in text tokens, never in series colours. Two or more series get a
legend; up to four are also labelled directly. Every chart sits in `ChartFrame`.

## 4. Type, space, shape, motion

| Style | Size / line / weight | Use |
| --- | --- | --- |
| `cv-type-title` | 28 / 34 / 600, −2% | page titles (`PageHeader`) |
| `cv-type-heading` | 20 / 28 / 600, −1% | panel headings |
| `cv-type-subheading` | 16 / 24 / 600 | groups, dialog titles |
| `cv-type-body` | 15 / 24 / 400 | default copy |
| `cv-type-body-sm` | 14 / 20 / 400 | dense UI, table cells |
| `cv-type-label` | 13 / 18 / 500 | field labels, table headers |
| `cv-type-caption` | 12 / 16 / 500 | the floor; captions, axis ticks |
| `cv-type-kpi` | 36 / 40 / 600, tabular | `Stat` figures |
| `cv-type-figure` | Geist Mono 13 / 20, tabular | amounts in tables (`cv-num`) |

Spacing is the 4px grid (`space-1` 4px … `space-24` 96px): panels pad 24px, stat cards 20px, table
cells 12px left and right, rows 40px (32px dense), page padding 40px desktop / 16px phone, 24px between
panels. Radii: 2px ticks, 4px badges and checkboxes, 6px buttons, inputs and notices, 10px cards and
tables, 16px dialogs; fully round only for avatars and toggles. Motion: 120ms ease-out for hover and
press, 200ms for menus; the drifted tick lifts once (900ms) when a comparison finishes; loading is the
scanning drift strip; `prefers-reduced-motion` turns both off.
