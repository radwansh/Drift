# Clarivo landing page: design hand-off

This folder holds everything needed to build the public landing page at `/` (Step 3 of the Clarivo rename plan). The design was approved in Claude Design on 14 October 2026. Follow the design for layout and look, and `content.md` for wording.

Sources, for reference only: the canvas [Clarivo Landing Page](https://claude.ai/artifact/Bu6uX2aYKCDTDpvMk4bQF1) (version 1791984392-f0f8), the [Clarivo design system](https://claude.ai/artifact/AaTTLP2YXrSUe2ieCxJteH) (version 1791983806-7026), the [Clarivo Logo & Brand](https://claude.ai/artifact/PBCWCY1p2TqvAbCa4Z6GoH) canvas and the [Clarivo Landing Page Content (Beta)](https://claude.ai/artifact/LAiXjwF63FL3LEdGUsCiRa) doc. Everything you need from them is copied here.

## Files

| Path | What it is | Use it for |
| --- | --- | --- |
| `docs/landing/content.md` | Page copy, SEO table, keyword map, alt texts, JSON-LD | Every word on the page, the metadata and the structured data |
| `docs/landing/design/Main.static.html` | The design as plain HTML: no scripts, local fonts, design-system CSS inline | Open it in a browser. It is the reference for structure, spacing, colours and responsive behaviour. Don't ship it |
| `docs/landing/design/screenshots/1440/`, `390/` | Every section at 1440 px and 390 px, plus the switch and billing variants (`--annual-live`, `--yearly`, `--confirmed-points-only`, `--signed-in`, `--menu-open`) | Visual comparison after the rebuild |
| `docs/landing/design/screenshots/full-page-*.jpg` | Whole page at both widths | Quick overview |
| `docs/landing/design/source/` | The Claude Design canvas files (`Main.dc.html`, phone boards, `canvas.json`) | Only if the static export leaves a question open. `{{name}}` holes are filled by the script at the end of `Main.dc.html` |
| `docs/landing/design/fonts/` | Instrument Sans and Geist Mono (latin, OFL) for the static export | Nothing in the app; use `next/font/google` there |
| `docs/landing/design-system/tokens.css` | All colour, shadow, spacing, radius and size tokens as `--cv-*` custom properties, plus `.cv-type-*` type styles | Import once, globally |
| `docs/landing/design-system/tailwind/` | The same tokens mapped for Tailwind v4 (`@theme inline`) and v3 (`theme.extend`) | Use the file that matches the installed Tailwind |
| `docs/landing/design-system/components/` | Reference implementation of the components (`bundle.js`, `bundle.css`), prop types (`index.d.ts`) and one README per component | Port what the page uses to React + Tailwind. Don't load `bundle.js` in the app |
| `docs/landing/design-system/README.md` | Brand book: colour roles, type, voice, logo rules | Decisions the design leaves open |
| `apps/web/public/brand/` | Logos (lockup, mark, wordmark; normal, reversed, mono), `clarivo-favicon.svg`, `favicon.ico`, `clarivo-app-icon.svg`, `clarivo-app-icon-512.png`, `apple-touch-icon.png` (180 px) and `clarivo-social.png` (1200 × 630 social image) | Header and footer logos, icons, Open Graph and Twitter image, JSON-LD logo |

## Sections

One H1, one H2 per section, in this order. The dark bands use `surface-inverse` (`#121A22`).

| # | Section | Anchor | Heading | Notes |
| --- | --- | --- | --- | --- |
| 1 | Header | `#top` on the wrapper | | Sticky. Logo (lockup, 24 px high), links to the four anchors, Sign in (ghost button) and Get early access (accent button). Below 861 px the links fold into a `<details>` menu |
| 2 | Hero | | H1: The payroll dashboard that catches mistakes before payday | The visual is built in HTML from components (Stat, Badge, Logo mark), not an image. It keeps `role="img"` and the alt text from `content.md` as `aria-label`. The baseline strip (DriftStrip, 160 ticks, tick 86 drifted) sits under the section |
| 3 | The problem | | Still tracking salaries in payroll Excel files? | Three figures in Geist Mono, the EY source line with its link, three role pains |
| 4 | How it works | `#how-it-works` | From payroll spreadsheet to dashboard in three steps | Three numbered steps joined by a line; stacked on mobile |
| 5 | Every salary KPI in one click | `#features` | Every salary KPI in one click | Eight live tiles, then six Annual Salaries tiles behind a switch |
| 6 | Payroll anomaly alerts | | Payroll anomaly alerts that stop costly mistakes | Dark band. Four alert cards with severity chips, the Data check card behind a switch, the sample alert shown large with a Variance table |
| 7 | Built for each role | | Built for business owners, managers and payroll admins | Four cards, business owners first |
| 8 | Security | `#security` | Your payroll data stays yours | Seven points, four of them behind checks (see below), then the link to `/security` |
| 9 | Pricing | `#pricing` | Simple payroll dashboard pricing, 50% off for beta founders | Monthly / Yearly toggle, four plans (Growth highlighted), Enterprise strip, "Every plan includes", plan size line, small print |
| 10 | FAQ | `#faq` | Payroll dashboard questions, answered | Nine `<details>`, all closed, two columns on desktop |
| 11 | Final call to action | | Approve your next payroll with confidence | Baseline strip (tick 74 drifted), optional founder line, two buttons, trust line |
| 12 | Footer | | | Dark. Reversed lockup, brand line, Product, Contact and Legal columns, company details line |

Components the page uses, with the props it passes:

| Component | Props used |
| --- | --- |
| Button | `variant` accent, secondary or ghost; `size` lg; `href` (renders a link) |
| Badge | `tone` accent or signal; `icon` alert, info or search; default tone for "Sample data" |
| Stat | `label`, `value`, `caption` |
| Variance | `value`, `percent`, `currency` EUR (signed amount with arrow and colour) |
| SegmentedControl | `label`, `options`, `value`, `onChange` (the billing toggle; the only stateful component) |
| DriftStrip | `size` lg, `count`, `drift` (index of the rust tick) |
| Logo | `variant` lockup or mark, `tone` reversed, `height` |
| Icon | `name` ban, chart, check, chevron-down, columns, globe, layers, lock, menu, shield-check, trash, upload, users; `size` |

The icon paths are in `design-system/components/bundle.js` (`ICONS`). Port them as they are rather than swapping in another icon set, so the strokes match.

## Launch switches

The design has four switches. In `Main.static.html` every element they control carries `data-switch="<name>"`; the export shows the canvas defaults. Keep the switches in one typed config file (for example `src/config/launch.ts`) so turning one on is a one-line, reviewable change. Don't use environment variables for them.

| Switch | Controls | Value at launch | Turn on when |
| --- | --- | --- | --- |
| Signed in (`signedIn` / `signedOut`) | Header: Sign in + Get early access, or Open Clarivo (to `/dashboard`); the Sign in row in the mobile menu | Decided per visitor with Clerk's client-side components, so the page stays static | Not a switch in code |
| `annualSalariesLive` | The six Annual Salaries KPI tiles, the Data check alert card, and the "Annual Salaries Dashboard" line under "Every plan includes" | Off | The Annual Salaries fixes are on main and confirmed by Radwan |
| `unconfirmedSecurityPoints` | Four security points. Use one flag per point | All four off | Each point's check is done (below) |
| `founderLine` | "Built by Radwan Sheb, …" above the final buttons | On | Already approved |

The four security points and their checks, from `content.md`:

| Point | Show it when |
| --- | --- |
| Hosted in the EU | Vercel functions run in Frankfurt (`fra1`) and the Neon database is in an EU region |
| Verified sign-in | The new Registration Form at `/sign-up` (Step 7) is live |
| Access by role | The role checks from the annual-dashboard review have shipped |
| Deleted on request | Radwan has decided who handles deletion requests and how fast |

Encrypted, Kept separate and No AI training show from day one.

The billing toggle is state, not a switch: monthly by default. Every price element carries `data-switch="billing-monthly"` or `"billing-yearly"`; see `09-pricing--yearly.png`.

## Build notes

- **Tokens.** Import `design-system/tokens.css` globally, then map it with the Tailwind file that matches the project. Every name has a `cv-` prefix, so it never overwrites shadcn/ui's `--primary`, `--accent`, `--border`, `--chart-*` or `--radius-*`. Don't import `bundle.css` as it is: it reads unprefixed variables such as `var(--accent)`, which shadcn already defines in another format.
- **Fonts.** `next/font/google`: `Instrument_Sans` (400, 500, 600, 700) with `variable: '--font-instrument-sans'`, and `Geist_Mono` (400, 500, 600) with `variable: '--font-geist-mono'`. `tokens.css` picks both up through `--cv-font-sans` and `--cv-font-mono`. Geist Mono sets every figure and price.
- **Light only.** The page is designed light, with two dark bands. Keep it light even when the app follows the system theme.
- **Static.** The marketing pages render statically. Only the header's signed-in check and the billing toggle are client components; the mobile menu and the FAQ use native `<details>`.
- **Links.** `Main.static.html` uses absolute `https://clarivo-app.com/...` links. Make them relative (`/sign-up`, `/sign-in`, `/dashboard`, `/security`, `/privacy`, `/terms`, `/dpa`) so previews work. Keep `mailto:hello@clarivo-app.com`.
- **Metadata.** Title, description, canonical `https://clarivo-app.com/`, Open Graph and Twitter (`summary_large_image`) from `content.md`, with `/brand/clarivo-social.png` (1200 × 630) as the image and the social alt text from `content.md`. Icons: `/brand/clarivo-favicon.svg`, `/brand/favicon.ico`, `/brand/apple-touch-icon.png`.
- **Structured data.** Use the JSON-LD in `content.md`, with one correction: its logo URL `/brand/clarivo-logo.svg` doesn't exist. Use `https://clarivo-app.com/brand/clarivo-app-icon-512.png`. Also add `FAQPage` markup generated from the same data as the visible FAQ, so the two never drift apart.
- **Accessibility.** Visible keyboard focus (the static export has the styles), alt text from `content.md`, colour never the only signal (each severity chip has a word and an icon), 44 px touch targets in the mobile menu.
- **Check.** Compare the rebuilt page with `screenshots/` at 390 px and 1440 px wide, including the variants.

## Open before going live

These are Radwan's decisions or tasks, not code. Ask before guessing any of them.

- Company details in the footer: `[legal entity name]`, `[registered address]`, `[registration number]`.
- `hello@clarivo-app.com` needs a mailbox before the page links to it (Step 1).
- Text for `/privacy`, `/terms`, `/dpa` and `/security` under the Clarivo name (Step 2). Never invent legal text.
- A closing date for founder prices (31 January 2027 was discussed). If set, it goes in the "Beta founder" badge.
- Clerk production keys and DNS (Step 5), the EU region (Step 4), and domain auto-renew, which is off (the domain expires on 10 October 2027).
