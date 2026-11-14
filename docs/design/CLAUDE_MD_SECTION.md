<!-- Paste the section below into CLAUDE.md, after "### Charts and accessibility". -->

### Design system: Ink & Signal

The whole app — marketing and `(main)` — draws from the Clarivo design system. Its React
implementation is `apps/web/src/components/cv` (import from `@/components/cv`); the tokens are
`src/app/clarivo-tokens.css`, mapped for Tailwind in `tailwind.config.ts` as `cv-` utilities. The
skill `.claude/skills/clarivo-design-system` carries the rules; `docs/design/` holds the brief, the
screen map and the token map. The target screens are the canvas "Clarivo SaaS Redesign".

- **Colour means change.** Rust (`delta-up`) for increases, cobalt (`delta-down`) for decreases, grey
  for none, always with an arrow and a sign — use `<Variance>`. Status colours (`success`, `warning`,
  `danger`) only with an icon and a word. Danger is crimson, kept away from rust: a change is not an
  error. Nothing else gets a hue, and no button is filled with rust.
- **Two vocabularies, one palette.** `globals.css` maps shadcn's HSL variables (`--primary`,
  `--muted-foreground`…) onto the tokens, so `components/ui` and classes like `bg-card` repaint on
  their own. New code uses `cv-` utilities. Opacity modifiers do not work on `cv-` colours (a complete
  colour has no channels): use the `-soft` tokens or `bg-cv-scrim`. shadcn's `--accent` is a hover
  ground, not cobalt.
- **Themes.** Light on `:root`; Dark on `.dark` (next-themes), `[data-theme="dark"]` and
  `[data-cv-theme="dark"]`, which scopes a dark region: the side menu uses it. The marketing layout
  pins `data-theme="light"`.
- **Money** still goes through `formatCurrency` / `formatMoney`; pass `format` to `<Variance>` so a
  component never formats money itself.
- **Charts** take colours from `lib/chart-palette.ts` (`CHART`, `seriesColor`, `deltaColor`) as
  explicit `fill`/`stroke`; categories use `chart-1…6` in order and fold a seventh into "Other".
- **`test/design-system.test.ts`** fails on raw Tailwind palette colours, hex colours and
  `hsl(var(--…))` used as a colour anywhere under `src/`. `lib/clerk-appearance.ts` is the one
  exemption: Clerk needs concrete hex values, which mirror the tokens there.
- **Type** is Instrument Sans (words) and Geist Mono (figures, ids, codes), self-hosted through
  `src/app/fonts.ts`. Sentence case everywhere; product names keep capitals (Dashboard, Detailed View,
  Employee File).
