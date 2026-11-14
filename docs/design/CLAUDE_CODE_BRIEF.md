# Claude Code brief: rebuild the Clarivo app on Ink & Signal

Read this file first, then `docs/design/SCREEN_MAP.md` for the screen you are on. Work in the
repository root of `radwansh/Drift`. Everything in this kit mirrors the repository's own paths, so
`apps/web/src/components/cv/button.tsx` here goes to `apps/web/src/components/cv/button.tsx` there.

## What this is

The marketing site already runs on the Clarivo design system (Ink & Signal). The signed-in app
(everything under `apps/web/src/app/(main)`) does not: it uses Inter, shadcn's default blue and slate
palette, green for increases and red for decreases, seven hard-coded chart colours and none of the
`cv-` tokens. This kit moves the app onto the design system without changing what any screen does.

- **Target design:** the canvas "Clarivo SaaS Redesign"
  (https://claude.ai/artifact/8YzwkXAX9pGQFwUdNAXPHh). One board per screen; board names are listed
  per route in `docs/design/SCREEN_MAP.md`.
- **Design system:** "Clarivo" (Ink & Signal), version `1792939260-744f`. Its rules are summarised in
  `.claude/skills/clarivo-design-system/SKILL.md`, which this kit adds so later sessions follow them.
- **Base commit:** `9710ae9` on `main` (8 Nov 2026). If `main` has moved, reconcile each replaced
  file with what changed since rather than overwriting blindly (see "Replaced files" below).

### Already verified against 9710ae9

With every file in this kit applied to a clean checkout of `9710ae9`:

| Check | Result |
| --- | --- |
| `pnpm --filter @saas/web typecheck` | 0 errors |
| `pnpm --filter @saas/web lint` | 0 errors, 30 warnings (was 34; none added) |
| `pnpm --filter @saas/web test` | 17 files, 310 tests pass (306 existing + 4 new design-system guards) |
| `next build` | passes; marketing pages stay static, `(main)` stays dynamic |

`docs/design/before-after/` holds screenshots of the Dashboard before and after, light, dark and
phone, taken from that build.

## Ground rules

1. **No behaviour changes.** Data flow, tRPC procedures, role gating (`visibleNavItems`,
   `payDetailProcedure`), money maths, the Employee File's "no AI narrative" rule and every number
   stay exactly as they are. This is a visual rebuild. If a screen seems to need a logic change, stop
   and ask Radwan.
2. **Money keeps its formatter.** Amounts go through `formatCurrency` (`lib/utils.ts`) or
   `formatMoney` (`components/annual/annual-utils.ts`), which print `USD 1,234.56`, as CLAUDE.md
   requires. The canvas shows `$` only for brevity. `<Variance>` takes a `format` prop for this:
   `format={(n) => formatCurrency(n, currency)}`. Never let a component format money on its own.
3. **Colour means change.** Increases are rust (`delta-up`), decreases cobalt (`delta-down`), no change
   grey (`delta-flat`), always with an arrow and a sign. Status colours (`success`, `warning`,
   `danger`) appear only with their icon and word. Nothing else gets a hue. No button is ever filled
   with rust.
4. **Use the kit's components** (`@/components/cv`) wherever one exists; otherwise the re-skinned
   shadcn primitives in `@/components/ui`. Use `cv-` utilities (`bg-cv-surface`, `text-cv-ink-muted`,
   `border-cv-line`) in new markup. `docs/design/TOKEN_MAP.md` lists the swap for every old class.
5. **Charts** keep `ChartFrame` and set colours with explicit `fill`/`stroke` props from
   `CHART` in `lib/chart-palette.ts`, never a Tailwind class (Recharts drops classes on legend marks).
6. **Sentence case** for every heading, label and button. Product words keep their capitals:
   Dashboard, Detailed View, Employee File.
7. **Keep CLAUDE.md true.** It is the repository's source of truth. Phase 6 adds a design-system
   section to it (text in `docs/design/CLAUDE_MD_SECTION.md`).
8. **One phase per commit**, on a branch, with the checks green before the next phase:

```bash
git switch -c design/ink-and-signal
pnpm --filter @saas/web typecheck && pnpm --filter @saas/web lint && pnpm --filter @saas/web test
```

## The phases

### Phase 0 — bring the kit in

```bash
mkdir -p docs/design .claude/skills/clarivo-design-system
cp -R clarivo-claude-code-kit/docs/design/. docs/design/
cp clarivo-claude-code-kit/CLAUDE_CODE_BRIEF.md docs/design/CLAUDE_CODE_BRIEF.md
cp clarivo-claude-code-kit/.claude/skills/clarivo-design-system/SKILL.md .claude/skills/clarivo-design-system/
```

Commit: `docs(design): Ink & Signal brief, audit and screen map`.

### Phase 1 — foundation: tokens, fonts, Tailwind

Copy these over the repository's files:

| File | What changes |
| --- | --- |
| `apps/web/src/app/clarivo-tokens.css` | Light on `:root` and `[data-theme="light"]`; Dark on `.dark` (what next-themes sets), `[data-theme="dark"]` and `[data-cv-theme="dark"]`, so the app finally gets the Dark theme. Adds `--cv-scrim`. |
| `apps/web/src/app/globals.css` | shadcn's HSL variables mapped onto Ink & Signal, light and dark, so every `bg-card`, `text-muted-foreground`, `border-input` repaints untouched. Lucide icons at stroke 1.75. Focus-ring fallback. `.cv-num` for table figures. Legacy `increase-text` etc. re-pointed by meaning. Print and `/blog` styles kept as they were. |
| `apps/web/tailwind.config.ts` | `font-sans` is Instrument Sans, `font-mono` Geist Mono; `rounded-sm/md/lg/xl` and `shadow-sm/md/lg` are the design system's; `success`/`warning` read the tokens; `max-w-content` (1360px). All `cv-` utilities kept. |
| `apps/web/src/app/fonts.ts` (new) | Instrument Sans and Geist Mono, self-hosted with `next/font/local` from the files already in `src/app/fonts/`. |
| `apps/web/src/app/layout.tsx` | Loads both fonts on `<html>`; Inter is gone. Clerk props unchanged. |
| `apps/web/src/app/(marketing)/layout.tsx` | Reads the fonts from `fonts.ts` instead of declaring them a second time. Still pins `data-theme="light"`. |

Then delete `apps/web/src/app/fonts/inter-latin.woff2` (nothing references it any more).

Check: typecheck, lint, test, and `pnpm --filter @saas/web build`. Open `/` and `/dashboard`: the
marketing page must look exactly as before; the app is already in Ink & Signal colours and type
(shapes come in phases 2 and 3). Commit: `feat(design): Ink & Signal tokens, fonts and Tailwind theme`.

### Phase 2 — components

1. Add `apps/web/src/components/cv/` (the whole folder). It is the one design-system library for the
   app and the marketing site: the eight components that lived in `components/marketing/ui`
   (Badge, Button, DriftStrip, Icon, Logo, SegmentedControl, Stat, Variance — same APIs, small
   additions), the two the marketing port left out (TextField, Notice), and five app pieces
   (PageHeader, Panel, EmptyState, SeverityBadge, SummarySeverityBadge). API: `docs/design/COMPONENTS.md`.
2. Replace `apps/web/src/components/marketing/ui/index.ts` with the kit's one-line re-export, then
   delete the eight old files next to it:
   `git rm apps/web/src/components/marketing/ui/{badge,button,drift-strip,icon,logo,segmented-control,stat,variance}.tsx`.
   Every marketing import goes through that barrel, so nothing else changes.
3. Copy the re-skinned shadcn primitives over `apps/web/src/components/ui/`: `button`, `badge`,
   `card`, `input`, `checkbox`, `skeleton`, `tabs`, `alert`, `table`, `dialog`, `alert-dialog`,
   `select`. Same exports and props; each file's header says what it now draws.
4. Add `apps/web/src/lib/chart-palette.ts` and `apps/web/src/lib/clerk-appearance.ts`.
5. Replace `apps/web/src/components/annual/chart-frame.tsx`: adds an optional `rowHeader`, and fixes a
   real bug — `sr-only` sat on the `<table>`, which never shrinks below its content, so every page
   with a chart was ~1,100px too wide and scrolled sideways. The class now sits on a wrapper.
6. Add `apps/web/test/design-system.test.ts` (see "The guard" below).

Check, then commit: `feat(design): components/cv library and re-skinned primitives`.

### Phase 3 — shell, sign-in and the Dashboard (the reference screen)

| File | What changes |
| --- | --- |
| `src/components/shared/sidebar.tsx`, `nav-icons.ts` | The Ink side menu, 240px: lockup logo, items with 20px icons, active item on accent-soft with a cobalt icon, "Clarivo 1.0 · Beta" foot. Scoped dark with `data-cv-theme="dark"`. Same `role` prop and gating. |
| `src/components/shared/navbar.tsx`, `theme-toggle.tsx` (new) | 64px top bar on surface: menu button (phone), company name, theme toggle, notifications, Clerk `UserButton` themed. The company name is the one addition to behaviour in this kit: one `settings.getCompany` query, cached for five minutes and shared with the settings page; if it fails, the bar shows no name. |
| `src/app/(main)/layout.tsx` | Skip link, `lg:pl-60` for the 240px menu, content capped at `max-w-content`, page padding 16px phone / 40px desktop. `force-dynamic` and the role lookup unchanged. |
| `src/lib/constants.ts` | Nav labels in sentence case (Annual salaries, Payroll periods), icons matched to the canvas. Order and `roles` unchanged, so `employee-file-ui.test.ts` still holds. |
| `src/app/(auth)/sign-in/…/page.tsx`, `sign-up/…/page.tsx`, `src/components/shared/auth-frame.tsx` (new) | Clerk's screens framed and themed with `getClerkAppearance()` (board "Sign in"). |
| `src/components/shared/empty-state.tsx`, `status-badge.tsx`, `loading-spinner.tsx` | Rebuilt on `cv` (drift strip for loading; status always icon + word). Same props. |
| `src/components/dashboard/*` (9 files) and `src/app/(main)/dashboard/page.tsx` | The Dashboard exactly as board "Dashboard": KPI grid, summary + anomaly flags row, diverging variance charts, department and movers tables with `<Variance>`. Same data, same props (some optional props added). |

Check, then QA by eye at 1440px, 1024px and 390px, light and dark: menu, top bar, Dashboard, sign-in.
Commit: `feat(design): Ink & Signal shell and Dashboard`.

### Phase 4 — the other screens, one commit each

Follow `docs/design/SCREEN_MAP.md`, in this order: Employee File (list, then one person), Detailed
View, Payroll periods with the upload wizard, Annual salaries, Integrations, Settings (company,
column mappings, users, plan and billing). For each screen:

1. Open its canvas board(s) and the files the screen map names.
2. Rebuild the JSX on `cv` components and `cv-` utilities. Keep every hook, query, handler and test id.
3. Remove the screen's files from `LEGACY_FILES` in `apps/web/test/design-system.test.ts`.
4. Run the checks. The guard fails if you missed a legacy colour, or forgot to delete a line.

### Phase 5 — states and polish

Loading (`loading.tsx` files: drift strip `animate="scan"`), errors (`error.tsx` files: `Notice
tone="danger"` with "Try again"), empty states, dark theme on every screen, phone widths, the board
pack print (`@media print` in globals.css is unchanged — print the annual page once to confirm).

### Phase 6 — close out

When `LEGACY_FILES` is empty: delete it and the second guard test; delete the legacy utilities block
in `globals.css`; drop the unused `success`/`warning` variants from `ui/button.tsx`; paste
`docs/design/CLAUDE_MD_SECTION.md` into `CLAUDE.md` (after "Charts and accessibility"); update the lint
warning count in CLAUDE.md's Commands block if it changed.

## The guard

`apps/web/test/design-system.test.ts` is a ratchet. Every file under `src/` must be free of raw Tailwind
palette colours (`text-green-600`), hex colours, `hsl(var(--…))` used as a colour and the legacy
increase/decrease/anomaly utilities — except the files in `LEGACY_FILES`, which are the screens still
to migrate (22 today). A file outside the list that gains one fails the build; a file in the list that
no longer has one fails until its line is deleted. The list is the true to-do list at every commit.
`lib/clerk-appearance.ts` is exempt for good: Clerk computes shades from concrete hex values.

## Replaced files

If `main` has moved past `9710ae9`, run `git diff 9710ae9 -- <file>` for each replaced file before
copying it. The ones most likely to have moved are `lib/constants.ts` (nav), `app/(main)/layout.tsx`
and `components/dashboard/*`. Re-apply any newer logic to the kit's version, never the other way round.

## Done means

- Every route in `SCREEN_MAP.md` matches its board in light and dark, at 1440px and 390px.
- `LEGACY_FILES` is gone; typecheck, lint (no new warnings), all tests and `next build` pass.
- No amount is formatted outside the two formatters; no chart colour outside `CHART`.
- Keyboard: every control shows the focus ring; the skip link works; dialogs trap focus (Radix).
- CLAUDE.md carries the design-system section.

## Decisions to confirm with Radwan

1. **Currency display.** The design system's examples show symbols (`€1,284.50`); CLAUDE.md requires
   ISO codes (`USD 1,234.56`) and tests pin them. The kit keeps codes. Switching is one line in
   `lib/utils.ts` plus test updates, and only on Radwan's say-so.
2. **Dashboard "Regenerate".** The button only logged to the console, so the rebuilt summary card has
   none and says "Rule-based". Bring it back when there is an AI narrative to regenerate.
3. **Nav casing.** "Annual salaries" and "Payroll periods" follow the system's sentence case; Employee
   File, Dashboard and Detailed View keep their capitals as product names.
