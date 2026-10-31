# Product Marketing Context

**Document version:** v3
**Last updated:** 2026-10-30

Sources for this draft: `apps/web/src/components/marketing/content.ts` (the shipped copy),
`docs/landing/content.md` (approved copy, SEO table, keyword map), `docs/landing/README.md`
(launch switches), `docs/landing/design-system/README.md` (Ink & Signal brand book) and the
live production site at https://www.clarivo-app.com/. Anything not covered by those files is
marked **[ASK RADWAN]** rather than guessed.

## Product Overview
**One-liner:** The payroll dashboard that catches mistakes before payday.
**What it does:** You upload the payroll register your payroll system already exports, as Excel
or CSV. Clarivo compares it with the previous period, shows every salary KPI on one dashboard,
and flags anything unusual — per employee and per pay component — before payroll is approved.
It never changes payroll data.
**Product category:** Payroll dashboard (the main keyword). Marked up as schema.org
`SoftwareApplication`, `applicationCategory: BusinessApplication`,
`applicationSubCategory: Payroll dashboard`.
**Product type:** B2B SaaS, multi-tenant web app. Public beta.
**Business model:** Free during the beta, no credit card. When billing starts: Starter €59/mo
(up to 100 employees), Growth €99/mo (up to 500), Business €299/mo (up to 2,000); Enterprise and
Bureau on request. Companies that join during the beta pay half for 24 months (€29 / €49 / €149).
Yearly billing gets two months free. Prices exclude VAT. Every plan includes every feature;
the value metric is employees per uploaded payroll file.

**Currency:** euro only, on every plan, with no local-currency price published. Correct for
Malta; wrong for the United States, Australia and New Zealand, which are three of the four
markets in the first campaign. Unresolved — see Learnings.

## Target Audience
**Target companies:** small and mid-sized companies that still reconcile payroll in Excel
(Radwan, 2026-10-30 — widened from the earlier "200 to 2,000 employees"). The shipped pricing
already matched this before the copy did: Starter covers up to 100 employees at €59/€29, so a
40-person company has always had a plan. Growth reaches 500 and Business 2,000; above that, or
across several countries, is Enterprise. Payroll bureaus and accountants are a second segment,
sold per client company from five clients up.

The qualifier that still holds is **capability, not headcount**: the company must be able to
export a payroll register to Excel or CSV, and must have at least two periods to compare. A
five-person company passes that test and will not pay €59 for it, so the real floor is
commercial and nobody has set it. **[ASK RADWAN]** — is there a stated minimum company size, or
does Starter simply run down to whoever will pay?

**Target markets (first campaign, Radwan 2026-10-30):** United States, Australia, New Zealand
and Malta. All four are English-first, so this is regional targeting rather than translation.
Three consequences are already known and logged in Learnings: the euro-only price, the Frankfurt
region, and the payroll vocabulary `classify.ts` does not recognise for the US, AU and NZ.
French and Arabic pages remain future work and are unaffected by this campaign.
**Decision-makers:** Business owners, HR and finance managers, payroll administrators.
**Primary use case:** Check this payroll period against the last one, and catch an error before
it reaches a payslip.
**Jobs to be done:**
- Know what I am signing off before I approve payroll.
- Keep salary cost by department, headcount and the year against budget visible without a spreadsheet.
- Stop rebuilding the period-over-period comparison by hand every period.
**Use cases:**
- Pre-approval check of a payroll register against the previous period.
- Variance report exported for sign-off (Excel, CSV, PDF).
- A bureau or accountant reviewing each client payroll before it goes out, one workspace per client.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Business owner (decision maker) | Total salary cost, employer cost, the reason for every change | Signs off a salary total they cannot fully explain | "Know what you're signing." |
| HR / finance manager (champion) | Salary cost by department, headcount, joiners and leavers, budget | Salary cost surprises arrive after the month is closed | "Keep salary expenses on track." |
| Payroll administrator (user) | Which lines changed and need a second look | Hours of copy, paste and VLOOKUP every period | "Stop checking line by line in Excel." |
| Payroll bureau / accountant (user and buyer) | A check on every client payroll before release | No consistent review across clients | "A second pair of eyes on every client payroll." |
| IT (technical influencer) | Nothing to install or connect | Integration projects and tickets | Upload a file; no integration project, no IT ticket, no new payroll system |

## Problems & Pain Points
**Core problem:** Every period, someone exports the register, opens last period's spreadsheet
beside it and compares line by line. It takes hours, the totals live in a dozen files, and
nobody can say at a glance what payroll costs this year.
**Why alternatives fall short:**
- Excel: the comparison is rebuilt every period and the checks depend on who builds it.
- Payroll software: it calculates and pays, but does not say what changed since last period.
**What it costs them:** Third-party research cited on the site — EY survey of 508 payroll
professionals at US companies with 250 to 10,000 employees, 2022: 1 in 5 payrolls contains
errors, $291 average cost per payroll error, 15 corrections per period on average.
Source: https://www.businesswire.com/news/home/20221222005093/en/EY-survey-Payroll-errors-average-$291-each-impacting-the-economy
These are EY's figures about the payroll industry, not measurements of Clarivo.
**Emotional tension:** A missed allowance, a doubled bonus or a leaver still being paid is found
only when an employee complains, or when the auditor does.

## Competitive Landscape
**Direct:** Radwan's answer (2026-10-30): software companies selling payroll solutions to small
and mid-size companies — **Odoo, Sage, NetSuite, QuickBooks**.

Read that set carefully before writing against it. All four are accounting or ERP suites with a
payroll module: they **calculate and pay**. Clarivo does neither — it is read-only by design and
works from a file those systems export. So they are the names a buyer already has, and the
software Clarivo sits on top of, rather than products a buyer chooses instead of Clarivo.

What follows for copy:
- They are **where the file comes from**, which is the integration story, not the rivalry.
- The real alternative to Clarivo is the next row down: Excel plus a manual reconciliation, or
  not checking at all. That is what the home page's first H2 argues with, and it is right to.
- A "Clarivo vs QuickBooks" page would invite the answer "we already have QuickBooks" and lose.
  **"Payroll variance reporting for QuickBooks / Odoo / Sage / NetSuite exports"** is the same
  keyword demand without the false either/or. Run `competitor-profiling` on the four to confirm
  what each one's payroll reporting actually does before committing to that framing.
- If any of the four ships period-over-period variance with anomaly flagging, that is a genuine
  overlap and this section needs rewriting. Nobody has checked yet.
- **This set has not been re-checked against the four campaign markets.** Odoo, Sage, NetSuite
  and QuickBooks were named for the old ICP. Which systems a small company in Sydney, Auckland,
  Austin or Valletta actually exports its register from is unknown here, and it decides the
  "variance reporting for <system> exports" page set. No scraping or SEO data source (Firecrawl,
  DataForSEO, Ahrefs, Semrush) is connected in this repo, so nothing has been measured — do not
  let a plausible-sounding local vendor list into copy without checking it first.

**Secondary:** Payroll software's own reporting (SAP, ADP, Sage and local packages) — calculates
and pays, but does not diff two periods or flag anomalies.
**Indirect:** Excel plus a manual VLOOKUP reconciliation — the status quo the copy argues with,
and the thing the home page names in its first H2.

## Differentiation
**Key differentiators:**
- Period-over-period diff per employee and per pay component, not a static report.
- Anomaly alerts ranked by severity and explained in plain language, before approval.
- Works from a file export, so there is nothing to install and nothing to connect.
- Read-only by design: Clarivo never changes payroll data.
**How we do it differently:** Column mapping is confirmed once and remembered, so the comparison
is one click every period instead of a rebuild.
**Why that's better:** The check happens before payday rather than after a complaint or an audit.
**Why customers choose us:** [ASK RADWAN] — no win/loss evidence yet; the beta has no public
customers.

## Objections
| Objection | Response |
|-----------|----------|
| Does this replace my payroll system? | No. Your payroll system still calculates and pays. Clarivo checks what it produced and never changes your data. |
| Do I need IT to set it up? | No. Upload a file; Clarivo maps your columns the first time and remembers them. Nothing to install, nothing to connect. |
| What happens to my payroll data? | Each company's data is kept separate and encrypted, and it is never used to train AI models. The AI recognises columns, writes the summary and ranks alerts; it never changes a number. |

**Anti-persona:** Companies that want payroll calculated or paid for them; anyone who cannot
export a payroll register to Excel or CSV; a company with only one period of payroll history,
since there is nothing to compare it with. "Companies under about 200 employees, where a
spreadsheet still fits" was listed here until 2026-10-30 and is **retired**: it contradicted the
Starter plan, and it contradicts the new ICP.

## Switching Dynamics
**Push:** Hours of manual comparison every period; an error found after payday.
**Pull:** Every salary KPI in one click, with the unusual lines already pointed out.
**Habit:** Last period's spreadsheet, and the person who knows how it works.
**Anxiety:** Uploading the company's most sensitive numbers to a product in beta; whether the
tool will change something in payroll.

## Customer Language
**How they describe the problem:**
- "tracking salaries in payroll Excel files"
- "copy, paste and VLOOKUP, every single period"
- [ASK RADWAN] — no interviews or support tickets yet. The phrases above are the site's own
  copy, not recorded customer speech. Run `customer-research` once there are beta users.
**How they describe us:** [ASK RADWAN] — no reviews, testimonials or recorded calls yet.
**Words to use:** payroll dashboard, salary KPIs, payroll anomaly, variance, pay component,
column mapping, payroll period, cadence (Monthly, Bi-monthly, Bi-weekly, Weekly), Detailed View,
employer cost, before payday.
**Words to avoid:** emoji, exclamation marks, superlatives, "platform", "seamless", "powerful",
"revolutionary". Never claim a security point whose launch switch is off.
**Glossary:**
| Term | Meaning |
|------|---------|
| Payroll dashboard | One screen of a payroll's key numbers: total salary cost, headcount, employer cost, change since last period |
| Variance | The signed difference between this period and the last |
| Pay component | A line of pay: basic salary, housing, overtime, bonus, tax, deduction |
| Cadence | Pay frequency: Monthly, Bi-monthly, Bi-weekly, Weekly |
| Column mapping | Matching the customer's spreadsheet columns to Clarivo's components, confirmed once |
| Detailed View | The per-employee screen inside the app |
| Beta founder price | Half price for 24 months for companies that sign up during the beta |

## Brand Voice
Brand: **Ink & Signal**. The interface stays quiet in ink, slate and paper so the one thing that
moved is impossible to miss, in signal rust.

| Attribute | Means | Doesn't mean | Example line |
|-----------|-------|--------------|--------------|
| Calm | States the fact and stops | Flat or vague | "Clarivo never changes your payroll. It shows you exactly where to look." |
| Precise | Says what changed, by how much, and where to look | Jargon or false precision | "Net pay changed by 20% or more, but no pay component changed." |
| Plain | Short words, everyday grammar | Dumbed down | "Stop checking line by line in Excel." |
| Honest about readiness | Names what is not ready yet | Hedging every sentence | "This document is being prepared and will be published before Clarivo leaves beta." |

**Tone by context:**
- Support: calm and specific; name the file, the period and the column.
- Launch: understated. "Now in beta", not "introducing".
- Errors: say what happened and the next action; never blame the file.
- Sales: the buyer's own numbers, not adjectives.
- Social: LinkedIn is the one channel — https://www.linkedin.com/company/clarivo-app (company
  page, confirmed by Radwan 2026-10-30). Same voice as Sales: the buyer's own numbers, not
  adjectives, and no claim behind an off switch. No other channel is established, so do not
  draft for X, Instagram or TikTok without asking.
**Terms we own:** payroll dashboard; "before payday"; the drifted tick (one tick out of line, in rust).
**Never use (and why):** exclamation marks and superlatives (the brand book forbids them); emoji
(same); a bare currency symbol in in-product figures — the app formatters use the currency code
(`USD 1,234.56`); any security claim behind an off switch, because it would be a false statement
about data protection.

## Proof Points
**Metrics:** None of Clarivo's own. The only numbers on the site are the EY industry figures
(sourced above) and the sample company's figures, which are fictional and labelled "Sample data".

**Scope limit on the EY figures after the ICP change:** the survey covered US companies with
**250 to 10,000 employees**. Under the old 200-to-2,000 ICP the sample sat squarely on top of
the audience. Under the new one it does not cover the lower half of it. The figures stay
citable as what they are — industry research on payroll error rates, with the sample named in
the source line on the page — but they cannot be used to tell a 40-person company how often
*it* gets payroll wrong. The disclosure is already in place; what needs review is the sentence
the figures are attached to.
**Customers:** None public. The beta is invitation-only via the early-access form.
**Testimonials:** None. Do not write one.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Catches mistakes before payday | The four live anomaly checks: net pay moved with no component change; a component dropped to zero; a component appeared or disappeared; joiners and leavers |
| Every salary KPI in one click | The eight live KPI tiles: total variance, employees affected, new, departed, largest increase, largest decrease, pay components, departments |
| No integration project | Excel or CSV export from any payroll system; column mapping confirmed once |
| Read-only | "Clarivo never changes your payroll" — in the alerts section and in the FAQ |
| Credible author | Founder line (switch on): "Built by Radwan Sheb, an SAP payroll lead who has delivered payroll projects across Europe and the Gulf, including a 12-country rollout." |

## Goals
**Business goal:** Fill the beta with small and mid-sized companies that become founder-priced
paying customers, starting in the United States, Australia, New Zealand and Malta.
**Conversion action:** "Get early access" — the lead form (waitlist mode is on, so every
sign-up button opens the form rather than linking to `/sign-up`). Secondary: "Talk to us" by
email for Enterprise and Bureau.
**Founder-price deadline:** **31 January 2027** (confirmed by Radwan 2026-10-30). Companies that
sign up before it pay the founder price for 24 months from their first invoice.

The site does not say this yet. `PRICING.founderBadge` reads "Beta founder: −50% for 24 months"
and `smallPrint` says "companies that sign up during the beta" — true but undated, so a reader
cannot tell whether they have a week or a year. A date is a real deadline rather than a
manufactured one, so it can be stated plainly. It is a public commercial commitment, so the
wording is Radwan's call, not a skill's: do not add it to copy without asking.

**Current metrics:** [ASK RADWAN] — no traffic, signup or conversion numbers available in the repo.

## Launch switches that constrain copy
From `apps/web/src/config/launch.ts`, read before writing any claim:

| Switch | State today | What it gates |
|---|---|---|
| `annualSalariesLive` | off | Six Annual Salaries KPIs, the "Data check" alert card, the Annual Salaries line in "Every plan includes". **Now a market gate too** — see Learnings |
| `securityPoints.hostedInTheEu` | **on** (since 2026-10-30, PR #9) | "Hosted in the EU" — now live and sayable |
| `securityPoints.verifiedSignIn` | off | "Verified sign-in" |
| `securityPoints.accessByRole` | off | "Access by role" |
| `securityPoints.deletedOnRequest` | off | "Deleted on request" |
| `founderLine` | **on** | The Radwan Sheb founder line |
| `waitlistMode` | **on** | Early-access buttons open the lead form |

True today without a switch: encrypted in transit and at rest; each company's data kept
separate; payroll data never used to train AI models.

## Learnings
*Decisions and tested lessons. Newest first. Keep it to about 20 active entries.*

| Date | Learning | Evidence | Applies to | Status |
|------|----------|----------|------------|--------|
| 2026-10-30 | ICP widened to small and mid-sized companies. This closes a copy-vs-product gap rather than changing the product: Starter already read "Up to 100 employees" at €59/€29. The home page still says otherwise in three places — the "Built for business owners, managers and payroll admins" section, the Enterprise boundary ("Over 2,000 employees or several countries"), and the sentence the EY figures hang on. | Radwan 2026-10-30; `PRICING.plans` in `content.ts` | copywriting, copy-editing, pricing, cro, content-strategy, llms.txt | active |
| 2026-10-30 | First campaign markets: United States, Australia, New Zealand, Malta. English-first in all four, so this is regional targeting, not translation. | Radwan 2026-10-30 | seo, seo-hreflang, site-architecture, ads, content-strategy, launch | active |
| 2026-10-30 | One global English page, no per-market URLs. hreflang needs a distinct URL per annotation, and the only facts that could differ per market today are the currency (one value), the residency claim (one value) and statutory vocabulary the engine does not have — so four pages would be near-duplicates competing with each other on a domain whose sitemap holds five URLs, four of them legal placeholders. Shipped instead as a one-member `en` + `x-default` set on `/`, which is the only remaining lever for "this page is not country-specific" since GSC country targeting was removed in 2022. | `alternates.languages` in `app/(marketing)/page.tsx`; measured sitemap of 5 URLs with `/security`, `/privacy`, `/terms`, `/dpa` all rendering `LegalPagePlaceholder` | seo-hreflang, site-architecture, programmatic-seo, seo | active |
| 2026-10-30 | The EY figures surveyed US companies with 250 to 10,000 employees, so they no longer span the ICP. Citable as industry research with the sample named; not usable as a claim about a 40-person company's own error rate. | `PROBLEM.source` in `content.ts` | copywriting, copy-editing, ai-seo, ads, content-strategy | active |
| 2026-10-30 | `classify.ts` has no entry for superannuation, KiwiSaver, ESCT, 401(k), Medicare, PAYG or student loan; FICA, PAYE and garnishment are present. An unrecognised column classifies as uncategorised, so the money lands in the `other_earnings_balance` / `balance` lines, the employer on-cost rate is understated and the statutory line is wrong — and step 4's gate treats an unplaced column as a warning rather than a blocker, so the file imports and shows an unexplained gap instead of refusing. Product gap, not a marketing one; do not fix it from a marketing task. | grep of `packages/payroll-core/src/annual/classify.ts`, 2026-10-30 | product first; then content-strategy, programmatic-seo, competitors, ads before any AU/NZ/US content ships | active |
| 2026-10-30 | That gap is **not** a live false claim, and the launch switches are the reason: every surface that would expose it — the "Taxes and social security" and "Total employer cost" tiles and the "Data check" alert — sits behind `annualSalariesLive`, which is off. So `annualSalariesLive` is now a market-coverage gate as well as a QA gate. Turning it on while AU or NZ companies are in the beta publishes a statutory breakdown the classifier cannot produce correctly. Add the vocabulary before the switch, not after. | `FEATURES.annual` and `ALERTS.dataCheck` in `content.ts`; `launch.ts`; the same switch filter in `llms.txt/route.ts` | launch, copywriting, seo, product | active |
| 2026-10-30 | Pricing is euro only. Right for Malta, wrong for the other three markets. `/llms.txt` now states "listed in euro" in words, so an assistant cannot read the € figure and quote "$59" to an American buyer. The page itself still shows only €. | `PRICING.plans` in `content.ts`; the "Markets, languages and currency" section of `llms.txt/route.ts` | pricing, cro, ai-seo, copywriting | active |
| 2026-10-30 | `fra1` is a genuine trade-off, not a mistake to reverse. Frankfurt serves Malta well and is roughly 250–280 ms RTT from Sydney and Auckland, and "Hosted in the EU" is neutral-or-worse in the US where buyers often prefer US residency. Moving off `fra1` turns `hostedInTheEu` off in the same commit — the switch's own comment requires it, and the claim was false the last time the two drifted apart. No decision taken; nothing changed. | `vercel.json`; the `hostedInTheEu` comment in `launch.ts`; PR #9 | performance, core-web-vitals, copywriting, seo | watch |
| 2026-10-31 | Per-market URLs: `/` in euro, `/us` in dollars, one shared `Landing` component. Separate URLs, never IP-switching at one URL — Googlebot crawls mostly from US addresses, so serving by location would mean only one version is ever indexed. `/au` and `/nz` wait for AUD and NZD; USD for an Australian is barely better than EUR. | Implemented; hreflang mesh in `components/marketing/landing.tsx` | seo, seo-hreflang, pricing, programmatic-seo | active |
| 2026-10-31 | A new public marketing route MUST be added to `isPublicRoute` in `middleware.ts`. The matcher skips paths containing a dot, which is why `/robots.txt` and `/llms.txt` need no entry — but `/us` has no dot, so it matched and Clerk redirected every visitor to sign-in. Typecheck passed; only fetching the page found it. | Measured on the dev server before the first commit | seo, site-architecture, any new page | active |
| 2026-10-31 | Money on the landing page has two mechanisms, not one. Most figures are currency-placeholder strings substituted by `money()`, but the alerts card renders through the `Variance` component, which takes a number and an ISO code via `Intl.NumberFormat`. Grepping for the placeholder is blind to it: it printed a euro amount on the dollar page. Check both when adding a market. | Measured in the rendered HTML of `/us` | copywriting, pricing, seo | active |
| 2026-10-31 | The EU hosting disclaimer renders on every market page, by Radwan's decision. It states where a customer's payroll data physically goes, which an Australian buyer needs for APP 8 cross-border obligations — a material fact, not a benefit line to show or hide by audience. | Radwan 2026-10-31; enforced structurally by the shared `Landing` component | copywriting, security copy, seo | active |
| 2026-10-30 | The four named competitors (Odoo, Sage, NetSuite, QuickBooks) calculate and pay payroll; Clarivo is read-only and consumes their exports. They are the source of the file, not an either/or choice, so "vs" pages invite "we already have QuickBooks". Frame as "variance reporting for <system> exports". | Radwan 2026-10-30; `ALERTS.control` and the FAQ both state Clarivo never changes payroll | competitors, competitor-profiling, copywriting, programmatic-seo | active |
| 2026-10-30 | Functions are pinned to `fra1` in `vercel.json` at the repo root, so "stored and processed in the EU" is true on both halves. It was false before: functions ran in `iad1` against an `eu-central-1` database. | PR #9; production deployment reports `regions: ["fra1"]` | seo, copywriting, security copy | active |
| 2026-10-30 | Canonical host is `www.clarivo-app.com`; the apex 308-redirects to it. Every canonical, sitemap entry, robots host line and JSON-LD `@id` must name `www`. | `SITE.url` comment in `content.ts`; live homepage canonical measured as `https://www.clarivo-app.com/` | seo, schema, site-architecture, llms.txt | active |
| 2026-10-30 | Yearly prices (€290 / €490 / €1,490) exist only after a client-side toggle, so they are absent from the server-rendered HTML that AI crawlers read. | `sections/pricing.tsx` is a `"use client"` component with `useState("monthly")` | ai-seo, pricing, cro | active |

## Changelog

- v4 (2026-10-31) — Per-market URLs shipped: `/` euro, `/us` dollars, full hreflang mesh, EU disclaimer on both. USD list prices 59/99/299 set by Radwan. Four Learnings rows added, two of them bugs that typecheck could not catch.
*Newest first. One line per revision: what changed and why.*
- v3 (2026-10-30) — **Repositioning.** ICP widened from "200 to 2,000 employees" to small and mid-sized companies, and the first campaign markets (US, AU, NZ, Malta) recorded. Rewrote Target Audience, the anti-persona (retired the "under 200 employees" exclusion, which contradicted the Starter plan), Business model (euro-only currency), Competitive Landscape (the vendor set is unverified for the new markets), Proof Points (the EY sample no longer spans the ICP) and Goals. Added eight Learnings rows: the single-global-page decision, the `classify.ts` vocabulary gap and its `annualSalariesLive` consequence, the euro-only price and the `fra1` trade-off. Downstream skills now generate against the wider ICP and the four markets.
- v2 (2026-10-30) — Radwan answered three of the six open fields: the competitor set (with the read-only caveat worked through), the LinkedIn company page, and the 31 January 2027 founder-price deadline. `hostedInTheEu` flipped to on in the switch table after PR #9. Still open: customer verbatims, how customers describe us, why customers choose us, current metrics.
- v1 (2026-10-30) — Initial context, drafted from `content.ts`, `docs/landing/content.md`, `docs/landing/README.md`, `docs/landing/design-system/README.md` and the measured live site. Competitors, customer verbatims, win/loss and current metrics left as [ASK RADWAN].
