Clarivo compares payroll between two periods and shows exactly what changed, for payroll administrators, managers and owners of companies with 200 to 2,000 employees. The brand is **Ink & Signal**: the interface stays quiet in ink, slate and paper so that the one thing that moved is impossible to miss, in signal rust.

## Principles

1. **Neutral by default.** Ink, slate and paper carry almost every pixel. A screen with nothing changed should look calm.
2. **Color means change.** `signal` rust marks increases, flags and the drifted tick; `accent` cobalt marks decreases, links and selection. Status colours appear only with their word or icon. Nothing else gets a hue.
3. **Numbers never jump.** Tabular figures, right-aligned amounts, true minus signs, the customer's locale.
4. **Calm, then precise.** Plain words, small radii, hairlines before shadows.

## Logo

- **Symbol, the Drift C:** a ring with one segment drifted out of line, in rust. It is the product in one picture: everything lines up except the change that matters.
- **Wordmark:** Instrument Sans Bold, tracked −1.2%, with a square tittle: a piece of the i's stem lifted off the baseline.
- **One signal per mark.** In the lockup the rust lives in the symbol and the tittle is ink; the wordmark alone carries the rust tittle. Never two rust elements in one logo, never another colour for the segment.
- **Versions** are in the Logos assets: lockup, mark and wordmark, each in Ink, reversed (white) and mono, plus the app icon and the favicon cut. In React use the `Logo` component.
- **Clear space:** a quarter of the symbol's height on every side. **Minimum:** lockup 96px wide; symbol 24px, and the favicon cut below that.
- **Grounds:** Ink versions on `bg`, `surface` and light photography; reversed on `surface-inverse` and dark photography; mono in white on cobalt or rust grounds.
- **Don't** rotate, stretch, outline, shadow or re-letter it, set "Clarivo" in another typeface as a logo, or place the mark in any container other than the app-icon tile.
- In running text the name is "Clarivo", capitalised. The logo is lowercase.

## Color

| Core | Token | Hex | Job |
| --- | --- | --- | --- |
| Ink | `slate-900` → `ink`, `primary` | #121A22 | Text, primary buttons, dark surfaces |
| Paper | `slate-25` → `bg` | #F7F8F9 | App and page background |
| Signal | `rust-500` → `signal` | #E0592A | The change: logo segment, flags, increases, the drifted tick |
| Clarity | `cobalt-500` → `accent` | #2F5BD3 | Links, selection, focus, decreases |

- Build screens on `bg`, put content on `surface`, and use `surface-sunken` for table headers and tracks. Menus and popovers use `surface-raised` with `shadow-md`.
- Text: `ink` for primary copy, `ink-muted` for secondary, `ink-subtle` for captions and placeholders. All three hold 4.5:1 on every surface in both themes. Never set text in `signal`; use `signal-ink`.
- In the app, actions are Ink: the `primary` button. On the website, the sign-up call to action ("Get early access") is the cobalt `accent` button, and links are cobalt too. Never fill a button with rust.
- Change: increases use `delta-up` (marks) and `delta-up-ink` (text), decreases `delta-down` and `delta-down-ink`, no change `delta-flat` and `delta-flat-ink`. Direction always also shows as an arrow and a sign.
- Flags: `signal-soft` behind the cell plus the square `signal` mark, only for changes above the customer's threshold.
- Status: `success`, `warning`, `danger` with their `-ink` text and `-soft` grounds, always with the icon and a word. Danger is crimson and kept far from rust: a change is not an error.
- Edges: `line` for decorative hairlines, `border` (3:1) for anything you can click or type into.
- Dark theme keeps every role: `primary` turns paper with an ink label, `surface` becomes Ink, and rust stays #E0592A.

## Data visualization

- Two periods side by side: the previous period in `chart-previous`, the current in `chart-current`.
- Variance charts diverge from a zero baseline: increases `delta-up`, decreases `delta-down`, a neutral gray midpoint. Never a third hue in between.
- Categories such as salary components take `chart-1` to `chart-6` in that order, never cycled; a seventh folds into "Other". The order passes colour-blind separation in both themes.
- Gridlines are `chart-grid` hairlines on `surface`; the baseline is `chart-axis`. One y-axis per chart.
- Values, labels and legends stay in text tokens, never in series colours. Two or more series always get a legend; up to four are also labelled directly.
- Every chart has a hover tooltip and a table view (the Detailed View).

## Typography

- **Instrument Sans** for everything set in words: display at 600 with tight tracking, UI at 400 to 600. **Geist Mono** for figures in tables, IDs, pay codes and code. Both are on Google Fonts.
- Styles: `display-xl` for the landing hero only, `display` for marketing sections, `title` for app page titles, `heading` for cards, `subheading` for groups and dialogs, `body` by default, `body-sm` in dense UI, `button`, `label`, and `caption` as the 12px floor. `kpi` sets hero figures, `figure` sets table amounts, `code` sets IDs.
- Figures: `font-variant-numeric: tabular-nums`, right-aligned in columns, true minus (−), thousands and decimals in the customer's locale (€1,284.50 or 1.284,50 €).
- Sentence case everywhere, buttons and headings included. No all-caps labels.

## Spacing, shape and elevation

- 4px grid: `space-1` to `space-24`. Cards pad `space-6`, stat cards `space-5`, table cells `space-3` horizontally; rows are 40px (`control-md`), 32px when dense.
- App layout: a 240px side menu and content up to 1280px, page padding `space-10` on desktop and `space-4` on phones. Marketing: a 1200px container with sections `space-16` apart.
- Radii: `radius-xs` for ticks and bar ends, `radius-sm` for badges and checkboxes, `radius-md` for buttons, inputs and notices, `radius-lg` for cards and tables, `radius-xl` for dialogs; `radius-full` only for avatars and toggles. Signal marks are square.
- Borders first: cards are outlined in `line` with no shadow. `shadow-sm` for the selected segment, `shadow-md` for menus, `shadow-lg` for dialogs.
- Focus: every interactive element shows `focus-ring` (a 2px gap, then 2px of `focus`), at least 3:1 on every surface.

## Motion

120ms ease-out for hover and press, 200ms for menus and popovers. When a comparison finishes, the drifted tick lifts into place once (900ms). Loading is the scanning drift strip. Honour `prefers-reduced-motion`: no lift, no scan. No bounce and no parallax.

## Iconography

The `Icon` component holds the built-in set: 20px grid, 1.75 stroke, round caps and joins, `currentColor`. It covers the product (arrows, status, upload, columns, chart) and the website's trust points (globe, lock, layers, shield-check, users, ban, trash, mail). Extend it with Lucide at stroke 1.75; no filled, duotone or emoji icons. Up and down arrows mean the direction of a change and nothing else.

## Voice and content

- Calm, precise and plain. Say what changed, by how much and where to look: "14 employees changed by more than €250." Not "Whoa, big changes!"
- Use the product's words: Dashboard, Detailed View, payroll period, cadence (Monthly, Bi-monthly, Bi-weekly, Weekly), variance, salary components, column mapping.
- Periods read "April 2026 vs March 2026"; dates "14 Oct 2026"; numbers as numerals.
- "You" is the customer; "we" is Clarivo, used sparingly. No emoji, no exclamation marks, no superlatives.

## Using this system

- Fonts: load `https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600&family=Instrument+Sans:wght@400..700&display=swap`, or `next/font/google` with `Instrument_Sans` and `Geist_Mono` in the Next.js app.
- Tokens are CSS custom properties (`--ink`, `--signal`, `--space-4`, `--font-sans` and so on): Light on `:root`, Dark on `[data-theme="dark"]`.
- Components: `components/bundle.css`, then `components/bundle.js` (a classic script that needs React 18 on the page) expose `window.Clarivo`: Button, TextField, SegmentedControl, Badge, Variance, Stat, Notice, DriftStrip, Logo and Icon. `bundle.css` loads both fonts and falls back to Light values when tokens are absent.
