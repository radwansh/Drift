# Clarivo Landing Page Content (Beta)
2026-10-14 · @Radwan
Copy for clarivo-app.com, written for business owners, managers and payroll admins, ready to hand to Claude Design.
## SEO setup
The page targets one main search, "payroll dashboard", plus what people type when salaries live in Excel files and mistakes slip through. Search volumes are not measured here: check the keywords in Google Keyword Planner before launch, then follow real queries in Search Console.
| Element | Copy | Note |
| URL | https://clarivo-app.com/ | Home page, canonical to itself |
| Title tag | Payroll Dashboard with Anomaly Alerts | Clarivo | 47 characters (keep under 60) |
| Meta description | Stop checking payroll in Excel. Clarivo turns your payroll file into one dashboard of salary KPIs and flags anomalies before payday. Free in beta. | 146 characters (keep under 155) |
| H1 | The payroll dashboard that catches mistakes before payday | The only H1 on the page |
| Social title | See every payroll change before you approve it | 46 characters |
| Social description | Salary KPIs in one click and alerts on payroll anomalies, before payday. Free during the beta. | 94 characters |
| Social image text | See every payroll change before you approve it. | 1200 × 630 px, set over the baseline strip |
| Language | English | Add French and Arabic pages later, linked with hreflang |

| Keyword | What the searcher needs | Where it appears |
| payroll dashboard (main) | One view of all payroll numbers | Title, H1, hero eyebrow, KPI eyebrow and sub-headline, image alt text |
| track salary expenses, salary costs | An owner or manager losing sight of salary spend | Problem section, role cards, FAQ |
| payroll Excel, payroll spreadsheet | An admin reconciling files by hand | Problem heading, How it works heading, FAQ |
| payroll variance report, compare payroll periods | Checking this period against the last | How it works, anomaly section, FAQ |
| payroll anomaly detection, payroll errors | Someone burned by a payroll mistake | Anomaly heading and cards, FAQ |
| payroll KPIs, payroll analytics | Metrics such as employer cost, headcount, cost per employee | KPI section and tiles |
| payroll reconciliation, payroll audit | Finance checking totals before sign-off | Data-check card, FAQ |

On-page rules:
- One H1, and one H2 per section, using the headings in this document as written: they carry the keywords.
- Header links jump to `#features`, `#pricing`, `#security` and `#faq`.
- Every image gets the alt text listed in the notes for Claude Design.
- Keep the page fast: hero screenshot in WebP, images below the fold load lazily.
Supporting pages to publish after launch, each linking back to the home page:
- "How to compare two payroll periods in Excel, and a faster way" (payroll Excel).
- "Payroll variance report: what to check before you approve payroll" (payroll variance report).
- "Payroll KPIs every business owner should track" (payroll KPIs).
## Header and hero
The hero answers three questions in five seconds: what Clarivo is (a payroll dashboard), what it does for you (every salary KPI, mistakes caught before payday) and what to do next (get early access).
| Element | Copy |
| Header links | Features · Pricing · Security · FAQ |
| Header buttons | Sign in · **Get early access** (primary, goes to `/sign-up`). Signed-in visitors see **Open Clarivo** instead. |
| Eyebrow | Payroll dashboard · Now in beta |
| Headline (H1) | The payroll dashboard that catches mistakes before payday |
| Alternative headlines | See every payroll change before you approve it. / Your salaries, clear in one click. |
| Sub-headline | Drop in your payroll file and Clarivo shows every salary KPI in one click: total payroll cost, headcount, employer cost and every change since last period. Anything unusual is flagged before you approve, so mistakes never reach a payslip. |
| Primary button | Get early access |
| Secondary button | See how it works (scrolls to the three steps) |
| Trust line under the buttons | Free during the beta · No credit card · Works with Excel or CSV from any payroll system |
| Visual | Dashboard screenshot: KPI cards across the top and one anomaly alert marked in rust-orange, labelled "Sample data" |
| Visual alt text | Clarivo payroll dashboard showing salary KPIs and a flagged payroll anomaly (sample data) |

Use "Get early access" on every sign-up button on the page, so visitors meet one action throughout.
## The problem
This section names the pain in the searcher's own words, payroll Excel files and salary costs nobody can explain, before Clarivo appears.
| Element | Copy |
| Headline (H2) | Still tracking salaries in payroll Excel files? |
| Body | Every payroll period, someone exports the register, opens last period's spreadsheet beside it and compares them line by line. It takes hours, the salary totals live in a dozen files, and nobody can say at a glance what payroll really costs this year. A missed allowance, a doubled bonus or a leaver still being paid is found only when an employee complains, or when the auditor does. |
| Stat 1 | **1 in 5** payrolls contains errors |
| Stat 2 | **$291**: the average cost of each payroll error |
| Stat 3 | **15** corrections per payroll period, on average |
| Source line (small, under the stats) | Source: EY survey of 508 payroll professionals at US companies with 250 to 10,000 employees, 2022. |
| Business owners | You sign off a salary total you can't fully explain. |
| Managers | Salary cost surprises show up after the month is closed. |
| Payroll admins | Hours of copy, paste and VLOOKUP, every single period. |
| Transition line | Clarivo replaces those spreadsheets with one payroll dashboard, and does the checking for you. |

The statistics come from [EY's payroll error survey, released through Business Wire](https://www.businesswire.com/news/home/20221222005093/en/EY-survey-Payroll-errors-average-$291-each-impacting-the-economy). They describe US companies, so keep the source line on the page.
## How it works
Three steps show that nothing changes in the payroll process: you keep exporting the file you already export.
| Element | Copy |
| Eyebrow | How it works |
| Headline (H2) | From payroll spreadsheet to dashboard in three steps |
| Line under the steps | No integration project, no IT ticket, no new payroll system. |

| Step | Title | Line |
| 1 | Upload your payroll file | Export the payroll register from the system you already use, as Excel or CSV, and drop it in. Monthly, bi-monthly, bi-weekly or weekly. |
| 2 | Clarivo maps your columns | Clarivo recognises your columns, such as basic salary, housing, overtime and tax, the first time. Confirm once and it remembers them for every period. |
| 3 | See every KPI and every change | Your payroll dashboard, the anomaly alerts and a plain-language summary are ready in moments. Compare any two periods, open any employee, or export the variance report for sign-off. |

## Every salary KPI in one click
This is the section the page is built around: the numbers an owner or manager wants, without opening a spreadsheet. Tile labels match the app, so the screenshot and the copy agree.
| Element | Copy |
| Eyebrow | Payroll dashboard |
| Headline (H2) | Every salary KPI in one click |
| Sub-headline | Upload this period's payroll and Clarivo builds your payroll dashboard for you. No formulas, no pivot tables, no waiting for month end: see where your salary expenses stand today. |
| Closing line | Need the detail? Open any employee in the Detailed View, or export the comparison to Excel, CSV or PDF. |

KPI tiles, in display order. The first eight are in the app today. The last six come from the Annual Salaries Dashboard: show them once its fixes ship.
| Tile | Line under the tile | Screen |
| Total variance | How much this payroll differs from the last one, and what drove it. | Dashboard |
| Employees affected | Everyone whose pay changed, at a glance. | Dashboard |
| New employees | Who joined the payroll this period. | Dashboard |
| Departed employees | Who left, so nobody is paid after they go. | Dashboard |
| Largest increase | The biggest pay rise this period, ready to check first. | Dashboard |
| Largest decrease | The biggest drop, before anyone calls payroll about it. | Dashboard |
| Pay components | Base, allowances, overtime, bonuses and deductions: see what moved. | Dashboard |
| Departments | Which teams drive the change in salary cost. | Dashboard |
| Paid so far this year | Net and gross salaries paid to date. | Annual Salaries |
| Full-year forecast | Where this year's payroll will land, period by period. | Annual Salaries |
| Total employer cost | Salaries plus employer contributions: the true cost of your team. | Annual Salaries |
| Taxes and social security | What you withhold and owe the authorities, to date. | Annual Salaries |
| Cost per employee and headcount | Average cost per head, and how your team is changing. | Annual Salaries |
| Budget vs forecast | Whether the year will land on budget, and by how much. | Annual Salaries |

## Payroll anomaly alerts
The alerts turn "a dashboard" into "a safety net": this is where Clarivo prevents the costly mistakes. The first four cards are checks the app runs today; add the data-check card once the Annual Salaries fixes ship.
| Element | Copy |
| Eyebrow | Anomaly alerts |
| Headline (H2) | Payroll anomaly alerts that stop costly mistakes |
| Sub-headline | Clarivo checks every employee's pay against the previous period. Anything unusual is flagged, ranked by severity and explained in plain language, so you fix it before payroll goes out, not after payday. |
| AI summary line | Plus a plain-language summary of each payroll: what changed, why, and what to check first. |
| Control line | Clarivo never changes your payroll. It shows you exactly where to look. |

| Severity | Card title | Card line |
| Warning | Net pay jumped, nothing explains it | Net pay changed by 20% or more, but no pay component changed. |
| Warning | A pay component dropped to zero | A component shows 0 this period, such as a housing allowance left blank. |
| Info | A pay component appeared or disappeared | A new bonus line this period, or a regular allowance that is suddenly missing. |
| Info | Joiners and leavers | Who joined and who left since the last payroll, so no one is paid by mistake. |
| Data check | Something doesn't add up | A missing pay period, a column Clarivo can't place, or totals that don't reconcile. |

Sample alert for the visual (fictional employee):
> **Warning** · Sara K., Sales. Net pay +32% with no change in any pay component. Check before you approve.
## Built for each role
One card per buyer, each written around what that person loses today: control for the owner, budget for the manager, hours for the payroll admin.
| Element | Copy |
| Eyebrow | Who it's for |
| Headline (H2) | Built for business owners, managers and payroll admins |

| Role card | Card headline | Card body |
| Business owners | Know what you're signing. | See your total salary cost, the employer cost and the reason for every change before you approve payroll, without opening a spreadsheet. |
| HR and finance managers | Keep salary expenses on track. | Follow salary costs by department, headcount, joiners and leavers, and the year against budget, all on one payroll dashboard. |
| Payroll administrators | Stop checking line by line in Excel. | Clarivo compares every employee with the last period and points you to the lines that need a second look. Export the variance report for sign-off. |
| Payroll bureaus and accountants | A second pair of eyes on every client payroll. | Check each client's payroll before it goes out, with one Clarivo workspace per client. |

## Security and data protection
Payroll buyers judge trust before features, so every point here must be true on launch day. The right-hand column says what to confirm first; publish a point only when its check is done.
| Element | Copy |
| Eyebrow | Security |
| Headline (H2) | Your payroll data stays yours |
| Sub-headline | Salaries are the most sensitive numbers a company has. Clarivo treats them that way. |
| Link | Read how we protect your payroll data → (goes to `/security`) |

| Point | Copy | Confirm before publishing |
| Hosted in the EU | Your payroll data is stored and processed in the European Union. | The Vercel functions run in Frankfurt (Step 4) and the Neon database is in an EU region |
| Encrypted | Encrypted in transit and at rest. | — |
| Kept separate | Each company's data is kept apart. No other customer can see it. | — |
| Verified sign-in | Every account is confirmed by an email code, with bot protection at sign-up. | The new sign-up form (Step 7) is live |
| Access by role | Admins, managers and viewers each see and change only what their role allows. | The role checks from the annual-dashboard review have shipped |
| No AI training | Your payroll data is never used to train AI models. | — |
| Deleted on request | Ask, and we delete your company's data. | You have decided who handles requests and how fast |

## Beta pricing
These are the flat, size-based prices we agreed for Clarivo as a self-serve micro-SaaS. Every plan includes every feature; plans differ only by company size. Clarivo is free during the beta, and when billing starts, beta founders keep at least 50% off for 24 months.
| Element | Copy |
| Eyebrow | Pricing |
| Headline (H2) | Simple payroll dashboard pricing, 50% off for beta founders |
| Sub-headline | Clarivo is free while it's in beta. When billing starts, every company that joined during the beta pays the founder price for 24 months. Every plan includes every feature. |
| Billing toggle | Monthly · Yearly (2 months free) |
| Badge on each paid plan | Beta founder: −50% for 24 months |
| Highlighted plan | Growth, tagged "Best for growing teams" |

> **`content.ts` is the source of truth for every figure below, not this file.**
> Prices are held once, in `PRICING.plans` in `apps/web/src/components/marketing/content.ts`,
> written with the `¤` placeholder and rendered per market by `money()`. This table is a
> record of what was agreed and drifted from the shipped numbers twice before being corrected
> on 2026-11-01: the Growth row carried €139/€69/€690/€1,390 against a shipped €99/€49/€490/€990,
> and the Bureau row published per-client prices the site deliberately does not show.
> Read a price from `content.ts`; change it there.

| Plan | For | List price | Beta founder price | Founder price, yearly | Button |
| Starter | Up to 100 employees | ~~€59~~ per month | **€29** per month | €290 per year (list €590) | Get early access |
| Growth | Up to 500 employees | ~~€99~~ per month | **€49** per month | €490 per year (list €990) | Get early access |
| Business | Up to 2,000 employees | ~~€299~~ per month | **€149** per month | €1,490 per year (list €2,990) | Get early access |
| Bureau | Payroll bureaus and accountants, up to 200 employees per client company | Priced per client company, from five clients | Founder discount applies | — | Talk to us |
| Enterprise | Over 2,000 employees or several countries | On request | Founder discount applies | — | Talk to us (opens an email to hello@clarivo-app.com) |

The US dollar column on `/us` is **$59 / $99 / $299** a month list, with the same founder
discount. These are list prices set per market, not conversions, so there is no FX rate to apply.

**Bureau carries no published number**, and the omission is deliberate: it sells by a different
unit — per client company rather than per company — so a figure sitting in the same row as
Starter reads as "the cheapest plan" to anyone scanning. Enterprise was pulled out for the same
reason. The terms that constrain the deal are still stated; only the number moves into the
conversation. See the comment above `bureau` in `content.ts`.

Every plan includes:
- The payroll dashboard with every salary KPI
- Anomaly alerts and AI payroll summaries
- Comparison of any two payroll periods, with the Detailed View for every employee
- The Annual Salaries Dashboard: paid to date, full-year forecast, employer cost and budget
- Excel, CSV and PDF exports
- Unlimited users
- Monthly, bi-monthly, bi-weekly and weekly payrolls
| Element | Copy |
| Plan size line | Clarivo counts the employees in each payroll file you upload. If a file goes over your plan's limit, we invite you to move up a plan; your comparison still runs. |
| Small print | Prices exclude VAT. Monthly billing, cancel anytime; yearly billing gets two months free. The founder price applies to companies that sign up during the beta and lasts 24 months from the first invoice. Fair use applies to AI summaries. |

Two decisions before publishing: if you set a closing date for founder prices (we discussed 31 January 2027), add it to the badge; and list the Annual Salaries Dashboard only once its fixes are live.
## FAQ
Each question targets a phrase from the keyword map, so the FAQ doubles as long-tail SEO. Keep the answers this short.
Headline (H2): **Payroll dashboard questions, answered**
| Question | Answer |
| What is a payroll dashboard? | A payroll dashboard shows your payroll's key numbers on one screen: total salary cost, headcount, employer cost and what changed since the last period. Clarivo builds yours from the payroll file you already export, so you never build one in Excel again. |
| How is Clarivo different from tracking payroll in Excel? | In Excel, someone rebuilds the comparison every period, and the checks depend on who builds it. Clarivo compares every employee and every pay component automatically, keeps your payroll history in one place and flags what looks wrong, in one click. |
| Which payroll systems does Clarivo work with? | Any system that exports to Excel or CSV: SAP, ADP, Sage, local payroll software or your own spreadsheets. Direct connections to SAP, ADP and Sage are on our roadmap. |
| What payroll anomalies does Clarivo detect? | Net pay that changed by 20% or more with no change in any pay component, pay components that drop to zero, new or missing components, joiners and leavers, and data issues such as a missing pay period. Each alert says who, what and why. |
| Do I need IT help to set it up? | No. Upload a file and Clarivo maps your columns the first time; confirm once and it remembers. There is nothing to install and nothing to connect. |
| Does Clarivo replace my payroll software? | No. Your payroll system still calculates and pays salaries. Clarivo checks what it produced and shows you what changed before you approve. It never changes your data. |
| What happens to my payroll data? | Each company's data is kept separate and encrypted, and it is never used to train AI models. The AI only recognises your columns, writes a plain-language summary and ranks alerts; it never changes a number. |
| Which pay frequencies and currencies does it handle? | Monthly, bi-monthly, bi-weekly and weekly payrolls, in any currency. Clarivo never adds amounts in different currencies together; each currency is reported on its own. |
| How much does Clarivo cost? | Clarivo is free during the beta, with no credit card. When billing starts, plans run from €59 to €299 a month by company size, and beta founders pay half: €29 to €149 a month for 24 months. |

## Final call to action and footer
The page ends on the same single action as the hero, restated as the outcome the visitor wants.
| Element | Copy |
| Headline (H2) | Approve your next payroll with confidence |
| Sub-headline | Upload two payroll periods and see every salary KPI, and every alert, in minutes. |
| Primary button | Get early access |
| Secondary button | Sign in |
| Trust line | Free during the beta · No credit card · Founder price for 24 months |
| Footer brand line | Clarivo. Payroll, clearly. |
| Footer: Product | Features · Pricing · Security · FAQ |
| Footer: Contact | hello@clarivo-app.com |
| Footer: Legal | Privacy policy · Terms · Data processing agreement |
| Footer: Company details | © 2026 Clarivo · [legal entity name] · [registered address] · [registration number] |

Optional founder line above the buttons: "Built by Radwan Sheb, an SAP payroll lead who has delivered payroll projects across Europe and the Gulf, including a 12-country rollout." It tells payroll buyers that Clarivo comes from their own world.
Fill in the company details in brackets before publishing; the contact address needs a mailbox first (Step 1 of the rename guide).
## Notes for Claude Design
Ask Claude Design to use the copy in this document word for word, in the section order below, with the Ink & Signal brand direction.
- **Brand direction, Ink & Signal:** a neutral ink-and-paper palette where colour only marks change. Rust-orange is for alerts and changes, cobalt for links and the primary button. Instrument Sans for text, Geist Mono for every figure and price.
- **Signature device:** a baseline strip of evenly spaced ticks with one tick drifted out of line in rust-orange, standing for an unexpected payroll change. Use it under the hero and as section dividers.
- **Severity:** pair each colour with its word (Warning, Info, Data check) and an icon, so meaning never relies on colour alone.
- **Sample data:** one fictional company in one currency, with the same numbers in the hero, the KPI tiles and the sample alert. Label every screenshot "Sample data".
- **Headings:** one H1 (the hero headline); every section heading marked H2 in this document stays an H2.
- **Accessibility:** alt text on every image, visible keyboard focus, and the layout checked at 390 px and 1440 px wide.
| Section | Anchor | Layout and visual |
| Header | — | Logo left, links centre, Sign in and the cobalt Get early access button right; sticky on scroll. |
| Hero | — | Headline, sub-headline, buttons and trust line on the left, dashboard screenshot on the right; stacked on mobile. The baseline strip runs underneath. |
| The problem | — | Three large stats in Geist Mono with the source line beneath, then the three role pains in one row. |
| How it works | `#how-it-works` | Three numbered steps side by side, joined by a thin line; stacked on mobile. |
| Every salary KPI in one click | `#features` | Tile grid, three across on desktop, one on mobile: label, a sample figure in Geist Mono, the one-line description. Hide the Annual Salaries tiles until those fixes ship. |
| Payroll anomaly alerts | — | Alert cards with a severity chip; the sample alert shown large, as it appears in the app. |
| Built for each role | — | Four cards, business owners first. |
| Security | `#security` | Two-column list with an icon per point, then the link to the security page. |
| Pricing | `#pricing` | Monthly/yearly toggle, four plan cards (Growth highlighted) with the list price struck through beside the founder price, then a full-width Enterprise strip and the "Every plan includes" list. |
| FAQ | `#faq` | Accordion, all answers closed by default. |
| Final call to action and footer | — | Centred headline, optional founder line and buttons, then a four-column footer. |

| Image | Alt text |
| Hero screenshot | Clarivo payroll dashboard showing salary KPIs and a flagged payroll anomaly (sample data) |
| KPI tiles | Payroll KPI tiles: total variance, employees affected, new and departed employees (sample data) |
| Sample alert | Payroll anomaly alert: net pay up 32% with no change in any pay component (sample data) |
| Step 1 | Uploading a payroll Excel file to Clarivo |
| Step 2 | Clarivo matching payroll columns such as basic salary and overtime |
| Step 3 | Payroll variance report ready for sign-off |
| Social image | Clarivo: see every payroll change before you approve it |

Structured data for the page head. Keep the prices in it equal to the pricing section. Also mark up the FAQ as FAQPage: Google stopped showing FAQ rich results on 7 May 2026 but still reads the markup to understand the page ([TechWyse](https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026)).
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://clarivo-app.com/#org",
      "name": "Clarivo",
      "url": "https://clarivo-app.com/",
      "logo": "https://clarivo-app.com/brand/clarivo-logo.svg",
      "email": "hello@clarivo-app.com"
    },
    {
      "@type": "SoftwareApplication",
      "name": "Clarivo",
      "applicationCategory": "BusinessApplication",
      "applicationSubCategory": "Payroll dashboard",
      "operatingSystem": "Web",
      "url": "https://clarivo-app.com/",
      "description": "Payroll dashboard that shows every salary KPI in one click and flags payroll anomalies before payday.",
      "publisher": { "@id": "https://clarivo-app.com/#org" },
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "EUR",
        "lowPrice": "0",
        "highPrice": "299",
        "offerCount": "5"
      }
    }
  ]
}
```