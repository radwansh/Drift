/**
 * Landing page copy, word for word from docs/landing/content.md.
 *
 * It lives here rather than inline in the sections for one reason that the
 * hand-off README is explicit about: the FAQ is rendered twice — once visibly
 * and once as FAQPage structured data — and the two must never drift apart.
 * The same applies to the pricing table and the JSON-LD offer range.
 *
 * Do not reword anything here without changing content.md: the headings carry
 * the keyword map, and the security points are claims about data handling.
 */

import type { IconName } from "./ui";

/**
 * Markets, and why every figure below is written with `¤` rather than a
 * currency symbol.
 *
 * The first campaign targets the United States, Australia, New Zealand and
 * Malta. Of those only Malta is in the euro area, so the landing page exists at
 * three URLs — `/` in euro, `/us` in dollars and `/au` in Australian dollars —
 * each crawlable, each carrying the full hreflang mesh. They are separate URLs
 * on purpose: serving different content at one URL by visitor IP would mean
 * Googlebot, which crawls mostly from US addresses, only ever indexes one
 * version.
 *
 * `¤` is U+00A4, the generic currency sign. Every price and every sample figure
 * stores the numerals once and `money()` substitutes the symbol, because the
 * dollar ladder Radwan set ($29/$49) uses the same numerals as the euro
 * one. Holding two copies of the same numbers is how a price drifts — which has
 * already happened once in this repo between `content.ts` and
 * `docs/landing/content.md`. One set of numerals cannot drift from itself.
 *
 * The Australian ladder is the exception, and the reason the per-market layer
 * at the bottom of this file exists: A$49 and A$79 are different *numerals*,
 * not the same numerals under another symbol, so they are held once in
 * `MARKETS.AUD.plans` and nowhere else. `/` and `/us` read the ladder stored on
 * `PRICING.plans` itself, through the same object, so those two cannot drift
 * apart whatever happens to Australia.
 *
 * It also preserves formatting exactly: signs, thousands separators and the `M`
 * suffix on the sample figures are part of the stored string, so nothing is
 * re-formatted per market and `−¤860` stays `−$860`.
 *
 * Prices are **list prices per market, not conversions.** $29 is not €29 at
 * some rate; it is the dollar price, and A$49 is the Australian one. There is
 * therefore no FX rate policy and no small print about which currency is
 * actually charged.
 *
 * **A price and a sample figure take different symbols in Australia**, which is
 * the one place the two readings of "the currency sign" come apart.
 *
 * A *price* says `A$49`. It is read beside `/us`'s `$49`, often by someone
 * comparing the two pages, and a reader who takes an Australian price for a US
 * one has a 50% error in the number that decides the sale.
 *
 * A *sample figure* — the demo dashboard's `+$18,420` and `−$860` — says plain
 * `$`. Those stand in for the reader's **own** payroll, and nobody in Australia
 * writes `A$` for a domestic amount; `A$` is a disambiguator for international
 * contexts. Stamping it on twenty illustrative figures read as a foreign
 * product describing Australian money from the outside. The currency is stated
 * once, in the pricing small print, which is where it is load-bearing.
 *
 * So `money()` is for prices and `sampleAmount()` for sample amounts. They
 * differ for `AUD` alone; for `EUR` and `USD` both substitute the same symbol,
 * so a call site that picks the wrong one is only visibly wrong on `/au`. The
 * two maps are deliberately separate rather than one map with a flag, because
 * the choice is about what the number *is*, not about how to format it.
 *
 * Not named `figure()`: `sections/hero.tsx` wraps its sample in a `<figure>`
 * element, and a function of that name sitting beside that tag is a trap for
 * the next reader even though JSX resolves lowercase tags as strings.
 */
export type Currency = "EUR" | "USD" | "AUD";

/** For prices. Australia disambiguates against `/us`. */
const PRICE_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", AUD: "A$" };

/** For sample amounts standing in for the reader's own payroll. */
const FIGURE_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", AUD: "$" };

/** Substitutes the market's price symbol into a stored price. */
export function money(text: string, currency: Currency): string {
  return text.split("¤").join(PRICE_SYMBOL[currency]);
}

/**
 * Substitutes the market's figure symbol into a stored sample amount.
 *
 * Used by the hero's headline variance and the KPI tiles. Everything else —
 * the price cards, the pricing FAQ answer, the JSON-LD offers and `llms.txt` —
 * is a price and goes through `money()`.
 */
export function sampleAmount(text: string, currency: Currency): string {
  return text.split("¤").join(FIGURE_SYMBOL[currency]);
}

export const SITE = {
  /**
   * The host that actually serves the site. Vercel has the apex
   * `clarivo-app.com` 308-redirecting to `www`, so a canonical of
   * `https://clarivo-app.com/...` named a URL that immediately redirects — in
   * every canonical tag, every sitemap entry, the robots `host` line and the
   * JSON-LD @id. Those should name the serving URL.
   *
   * Only used in machine-readable output, never in visible copy, so the brand
   * is still written `clarivo-app.com` everywhere a person reads it.
   *
   * To make the apex canonical instead, flip the redirect in Vercel so `www`
   * points at the apex and change this back — both halves have to move
   * together or the mismatch returns the other way round.
   */
  url: "https://www.clarivo-app.com",
  name: "Clarivo",
  email: "hello@clarivo-app.com",
  /** 47 characters. content.md keeps this under 60. */
  title: "Payroll Dashboard with Anomaly Alerts | Clarivo",
  /** 146 characters. content.md keeps this under 155. */
  description:
    "Stop checking payroll in Excel. Clarivo turns your payroll file into one dashboard of salary KPIs and flags anomalies before payday. Free in beta.",
  socialTitle: "See every payroll change before you approve it",
  socialDescription:
    "Salary KPIs in one click and alerts on payroll anomalies, before payday. Free during the beta.",
  socialImageAlt: "Clarivo: see every payroll change before you approve it",
} as const;

export const NAV = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
] as const;

export const HERO = {
  eyebrow: "Payroll dashboard · Now in beta",
  /** The only H1 on the page. */
  headline: "The payroll dashboard that catches mistakes before payday",
  subHeadline:
    "Drop in your payroll file and Clarivo shows every salary KPI in one click: total payroll cost, headcount, employer cost and every change since last period. Anything unusual is flagged before you approve, so mistakes never reach a payslip.",
  primary: "Get early access",
  secondary: "See how it works",
  trust: "Free during the beta · No credit card · Works with Excel or CSV from any payroll system",
  visualAlt:
    "Clarivo payroll dashboard showing salary KPIs and a flagged payroll anomaly (sample data)",
} as const;

export const PROBLEM = {
  headline: "Still tracking salaries in payroll Excel files?",
  body:
    "Every payroll period, someone exports the register, opens last period's spreadsheet beside it and compares them line by line. It takes hours, the salary totals live in a dozen files, and nobody can say at a glance what payroll really costs this year. A missed allowance, a doubled bonus or a leaver still being paid is found only when an employee complains, or when the auditor does.",
  stats: [
    { value: "1 in 5", label: "payrolls contains errors" },
    { value: "$291", label: "the average cost of each payroll error" },
    { value: "15", label: "corrections per payroll period, on average" },
  ],
  source:
    "Source: EY survey of 508 payroll professionals at US companies with 250 to 10,000 employees, 2022.",
  sourceHref:
    "https://www.businesswire.com/news/home/20221222005093/en/EY-survey-Payroll-errors-average-$291-each-impacting-the-economy",
  pains: [
    { role: "Business owners", line: "You sign off a salary total you can't fully explain." },
    { role: "Managers", line: "Salary cost surprises show up after the month is closed." },
    { role: "Payroll admins", line: "Hours of copy, paste and VLOOKUP, every single period." },
  ],
  transition:
    "Clarivo replaces those spreadsheets with one payroll dashboard, and does the checking for you.",
} as const;

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  headline: "From payroll spreadsheet to dashboard in three steps",
  closing: "No integration project, no IT ticket, no new payroll system.",
  steps: [
    {
      title: "Upload your payroll file",
      line: "Export the payroll register from the system you already use, as Excel or CSV, and drop it in. Monthly, bi-monthly, bi-weekly or weekly.",
      icon: "upload" as IconName,
    },
    {
      title: "Clarivo maps your columns",
      line: "Clarivo recognises your columns, such as basic salary, housing, overtime and tax, the first time. Confirm once and it remembers them for every period.",
      icon: "columns" as IconName,
    },
    {
      title: "See every KPI and every change",
      line: "Your payroll dashboard, the anomaly alerts and a plain-language summary are ready in moments. Compare any two periods, open any employee, or export the variance report for sign-off.",
      icon: "chart" as IconName,
    },
  ],
} as const;

/**
 * The sample company, read from docs/landing/design/Main.static.html.
 *
 * One fictional company in one currency, and the same figures in the hero, the
 * KPI tiles and the sample alert — the README is firm about that, because a
 * visitor who spots two different "total variance" numbers stops trusting the
 * screenshots. Every surface showing these also carries a "Sample data" badge.
 */
export const SAMPLE = {
  company: "Halden Logistics",
  period: "September 2026 vs August 2026",
  badge: "Sample data",
  totalVariance: "+¤18,420",
  totalVariancePct: "+2.6%",
  employeesAffected: "37",
  headcount: "248",
  newEmployees: "4",
  departedEmployees: "2",
} as const;

export const FEATURES = {
  eyebrow: "Payroll dashboard",
  headline: "Every salary KPI in one click",
  subHeadline:
    "Upload this period's payroll and Clarivo builds your payroll dashboard for you. No formulas, no pivot tables, no waiting for month end: see where your salary expenses stand today.",
  closing:
    "Need the detail? Open any employee in the Detailed View, or export the comparison to Excel, CSV or PDF.",
  tilesAlt:
    "Payroll KPI tiles: total variance, employees affected, new and departed employees (sample data)",
  /**
   * The first eight are in the app today. Figures are the sample company's,
   * taken from the design so the tiles match the hero. The minus signs are
   * U+2212, as the design has them.
   */
  live: [
    { label: "Total variance", value: "+¤18,420", caption: "+2.6%", line: "How much this payroll differs from the last one, and what drove it." },
    { label: "Employees affected", value: "37", caption: "of 248", line: "Everyone whose pay changed, at a glance." },
    { label: "New employees", value: "4", line: "Who joined the payroll this period." },
    { label: "Departed employees", value: "2", line: "Who left, so nobody is paid after they go." },
    { label: "Largest increase", value: "+¤1,240", caption: "Sara K., Sales", line: "The biggest pay rise this period, ready to check first." },
    { label: "Largest decrease", value: "−¤860", caption: "Tom R., Operations", line: "The biggest drop, before anyone calls payroll about it." },
    { label: "Pay components", value: "+¤9,310", caption: "Overtime", line: "Base, allowances, overtime, bonuses and deductions: see what moved." },
    { label: "Departments", value: "+¤7,840", caption: "Sales", line: "Which teams drive the change in salary cost." },
  ],
  /** Behind the annualSalariesLive switch. */
  annual: [
    { label: "Paid so far this year", value: "¤6.47M", line: "Net and gross salaries paid to date." },
    { label: "Full-year forecast", value: "¤8.69M", line: "Where this year's payroll will land, period by period." },
    { label: "Total employer cost", value: "¤11.27M", line: "Salaries plus employer contributions: the true cost of your team." },
    { label: "Taxes and social security", value: "¤4.75M", line: "What you withhold and owe the authorities, to date." },
    { label: "Cost per employee and headcount", value: "¤5,063", caption: "248 employees", line: "Average cost per head, and how your team is changing." },
    { label: "Budget vs forecast", value: "−1.8%", line: "Whether the year will land on budget, and by how much." },
  ],
} as const;

export const ALERTS = {
  eyebrow: "Anomaly alerts",
  headline: "Payroll anomaly alerts that stop costly mistakes",
  subHeadline:
    "Clarivo checks every employee's pay against the previous period. Anything unusual is flagged, ranked by severity and explained in plain language, so you fix it before payroll goes out, not after payday.",
  aiSummary:
    "Plus a plain-language summary of each payroll: what changed, why, and what to check first.",
  control: "Clarivo never changes your payroll. It shows you exactly where to look.",
  sampleAlt:
    "Payroll anomaly alert: net pay up 32% with no change in any pay component (sample data)",
  /** The first four run today; the Data check card sits behind annualSalariesLive. */
  cards: [
    {
      severity: "Warning",
      tone: "signal" as const,
      icon: "alert" as IconName,
      title: "Net pay jumped, nothing explains it",
      line: "Net pay changed by 20% or more, but no pay component changed.",
    },
    {
      severity: "Warning",
      tone: "signal" as const,
      icon: "alert" as IconName,
      title: "A pay component dropped to zero",
      line: "A component shows 0 this period, such as a housing allowance left blank.",
    },
    {
      severity: "Info",
      tone: "accent" as const,
      icon: "info" as IconName,
      title: "A pay component appeared or disappeared",
      line: "A new bonus line this period, or a regular allowance that is suddenly missing.",
    },
    {
      severity: "Info",
      tone: "accent" as const,
      icon: "info" as IconName,
      title: "Joiners and leavers",
      line: "Who joined and who left since the last payroll, so no one is paid by mistake.",
    },
  ],
  dataCheck: {
    severity: "Data check",
    tone: "neutral" as const,
    icon: "search" as IconName,
    title: "Something doesn't add up",
    line: "A missing pay period, a column Clarivo can't place, or totals that don't reconcile.",
  },
  /** Fictional employee, per content.md. */
  sample: {
    severity: "Warning",
    employee: "Sara K.",
    department: "Sales",
    line: "Net pay +32% with no change in any pay component. Check before you approve.",
  },
} as const;

export const ROLES = {
  eyebrow: "Who it's for",
  headline: "Built for business owners, managers and payroll admins",
  cards: [
    {
      role: "Business owners",
      headline: "Know what you're signing.",
      body: "See your total salary cost, the employer cost and the reason for every change before you approve payroll, without opening a spreadsheet.",
      icon: "check" as IconName,
    },
    {
      role: "HR and finance managers",
      headline: "Keep salary expenses on track.",
      body: "Follow salary costs by department, headcount, joiners and leavers, and the year against budget, all on one payroll dashboard.",
      icon: "chart" as IconName,
    },
    {
      role: "Payroll administrators",
      headline: "Stop checking line by line in Excel.",
      body: "Clarivo compares every employee with the last period and points you to the lines that need a second look. Export the variance report for sign-off.",
      icon: "columns" as IconName,
    },
    {
      role: "Payroll bureaus and accountants",
      headline: "A second pair of eyes on every client payroll.",
      body: "Check each client's payroll before it goes out, with one Clarivo workspace per client.",
      icon: "users" as IconName,
    },
  ],
} as const;

/**
 * Security points. `gate` names the launch switch that must be on before the
 * point appears; the three without a gate are true from day one.
 */
export const SECURITY = {
  eyebrow: "Security",
  headline: "Your payroll data stays yours",
  subHeadline:
    "Salaries are the most sensitive numbers a company has. Clarivo treats them that way.",
  link: "Read how we protect your payroll data →",
  linkHref: "/security",
  points: [
    {
      title: "Hosted in the EU",
      copy: "Your payroll data is stored and processed in the European Union.",
      detail:
        "Clarivo runs in Frankfurt. The application's functions are pinned to Vercel's fra1 region and the database is Neon Postgres in AWS eu-central-1 — the same region, so your payroll file is not carried across continents to be processed. The region is set in vercel.json in the repository rather than only in a dashboard, so it travels with the code.",
      icon: "globe" as IconName,
      gate: "hostedInTheEu" as const,
    },
    {
      title: "Encrypted",
      copy: "Encrypted in transit and at rest.",
      detail:
        "Every request to Clarivo is served over HTTPS; there is no unencrypted route to the application. Your payroll data is encrypted at rest by the infrastructure that stores it.",
      icon: "lock" as IconName,
      gate: null,
    },
    {
      title: "Kept separate",
      copy: "Each company's data is kept apart. No other customer can see it.",
      detail:
        "Every row of payroll data carries the company it belongs to, and every query that reads it is restricted to the company of the person signed in. The separation is enforced in the application on each request, rather than left to whichever query happens to be written.",
      icon: "layers" as IconName,
      gate: null,
    },
    {
      title: "Verified sign-in",
      copy: "Every account is confirmed by an email code, with bot protection at sign-up.",
      detail:
        "Accounts are created through a verified email code, and sign-up carries bot protection.",
      icon: "shield-check" as IconName,
      gate: "verifiedSignIn" as const,
    },
    {
      title: "Access by role",
      copy: "Admins, managers and viewers each see and change only what their role allows.",
      detail:
        "An administrator, a manager and a viewer each reach only what their role permits, checked on every request rather than hidden in the interface.",
      icon: "users" as IconName,
      gate: "accessByRole" as const,
    },
    {
      title: "No AI training",
      copy: "Your payroll data is never used to train AI models.",
      detail:
        "The written summaries are generated through Anthropic's API, which does not use what is sent to it to train models. The AI layer is also optional: with no model configured Clarivo writes the same summaries from its own rules instead, and the interface says which of the two produced the text you are reading.",
      icon: "ban" as IconName,
      gate: null,
    },
    {
      title: "Deleted on request",
      copy: "Ask, and we delete your company's data.",
      detail:
        "Ask, and your company's payroll data is deleted, including the uploaded files.",
      icon: "trash" as IconName,
      gate: "deletedOnRequest" as const,
    },
  ],
} as const;

/**
 * **The beta founder discount is gone from every market.**
 *
 * Each plan carried two ladders — a list price and a founder price at half of
 * it — and the page struck the list price through beside the founder one. One
 * ladder is stored now, and it is the list price, because that is what the
 * Polar checkout actually charges. The two had drifted: the page promised €14
 * while the live checkout billed €29, so a visitor who followed the pricing
 * section to the checkout paid double what the section quoted. Removing the
 * second ladder removes the thing that could disagree.
 *
 * `founderMonthly` and `founderYearly` are therefore not fields any more, nor
 * is `founderBadge`, and the yearly figure is ten times the monthly one (two
 * months free) off the list price rather than the founder price.
 */
export const PRICING = {
  eyebrow: "Pricing",
  headline: "Simple payroll dashboard pricing",
  subHeadline:
    "Clarivo is free while it's in beta. Every plan includes every feature, and the price goes by how many employees you pay.",
  toggle: { monthly: "Monthly", yearly: "Yearly (2 months free)" },
  cta: "Get early access",
  plans: [
    {
      name: "Starter",
      for: "Up to 500 employees",
      listMonthly: "¤29",
      listYearly: "¤290",
      highlighted: false,
    },
    {
      name: "Growth",
      for: "Up to 2,000 employees",
      listMonthly: "¤49",
      listYearly: "¤490",
      highlighted: true,
      tag: "Best for growing teams",
    },
  ],
  enterprise: {
    name: "Enterprise",
    for: "Over 2,000 employees or several countries",
    price: "On request",
    note: "Priced on your headcount and countries",
    cta: "Talk to us",
  },
  /**
   * Below Enterprise rather than in the plan grid, and without a figure.
   *
   * Bureau sells by a different unit — per client company, not per company —
   * so a price sitting in the same row as Starter's read as "the cheapest
   * plan" to anyone scanning four cards. Enterprise was already pulled out for
   * the same reason. The terms that constrain the deal are still stated, in
   * `note` and in `smallPrint`; only the number moves into the conversation.
   */
  bureau: {
    name: "Bureau",
    for: "Payroll bureaus and accountants, up to 200 employees per client company",
    note: "Priced per client company, from five clients",
    cta: "Talk to us",
  },
  includesTitle: "Every plan includes:",
  includes: [
    "The payroll dashboard with every salary KPI",
    "Anomaly alerts and AI payroll summaries",
    "Comparison of any two payroll periods, with the Detailed View for every employee",
    "Excel, CSV and PDF exports",
    "Unlimited users",
  ],
  /**
   * The sixth line of the list, held on its own because it is the one item
   * whose wording is local: Australians say fortnightly where this says
   * bi-weekly. A market replaces it through `MARKETS[currency].cadenceIncludes`
   * and the other five lines stay shared. Rendered last, as content.md has it.
   */
  includesCadence: "Monthly, bi-monthly, bi-weekly and weekly payrolls",
  /** Listed only once the Annual Salaries fixes are live (annualSalariesLive). */
  includesAnnual:
    "The Annual Salaries Dashboard: paid to date, full-year forecast, employer cost and budget",
  sizeLine:
    "Clarivo counts the employees in each payroll file you upload. If a file goes over your plan's limit, we invite you to move up a plan; your comparison still runs.",
  /**
   * The small print, minus its first sentence.
   *
   * That sentence named a tax — "Prices exclude VAT." — and VAT is not a thing
   * that exists in Australia, which charges GST. It now comes from
   * `MARKETS[currency].taxLine` and is rendered in front of this string by
   * `sections/pricing.tsx`.
   *
   * One sentence moved rather than the whole object: a second copy of
   * `PRICING` for Australia would put the plan limits and the Bureau rule in
   * two places, and the next edit would land in one of them. Everything below
   * is true in every market and is stated once.
   */
  smallPrint:
    "Monthly billing, cancel anytime; yearly billing gets two months free. The Bureau plan is billed per client company, from five clients upwards; a client company over 200 employees takes the plan that matches its size. Fair use applies to AI summaries.",
} as const;

/**
 * Rendered visibly and as FAQPage structured data, from this one array.
 *
 * `id` exists so a market can replace one answer without matching on the
 * question text: `MARKETS.AUD.faq.replace` keys off it, and a reworded
 * question would otherwise silently drop the Australian answer and publish the
 * shared one. Ids are stable names, not positions, so reordering is safe.
 */
export const FAQ = {
  headline: "Payroll dashboard questions, answered",
  items: [
    {
      id: "what-is-a-payroll-dashboard",
      q: "What is a payroll dashboard?",
      a: "A payroll dashboard shows your payroll's key numbers on one screen: total salary cost, headcount, employer cost and what changed since the last period. Clarivo builds yours from the payroll file you already export, so you never build one in Excel again.",
    },
    {
      id: "versus-excel",
      q: "How is Clarivo different from tracking payroll in Excel?",
      a: "In Excel, someone rebuilds the comparison every period, and the checks depend on who builds it. Clarivo compares every employee and every pay component automatically, keeps your payroll history in one place and flags what looks wrong, in one click.",
    },
    {
      id: "payroll-systems",
      q: "Which payroll systems does Clarivo work with?",
      a: "Any system that exports to Excel or CSV: SAP, ADP, Sage, local payroll software or your own spreadsheets. Direct connections to SAP, ADP and Sage are on our roadmap.",
    },
    {
      id: "anomalies",
      q: "What payroll anomalies does Clarivo detect?",
      a: "Net pay that changed by 20% or more with no change in any pay component, pay components that drop to zero, new or missing components, joiners and leavers, and data issues such as a missing pay period. Each alert says who, what and why.",
    },
    {
      id: "it-help",
      q: "Do I need IT help to set it up?",
      a: "No. Upload a file and Clarivo maps your columns the first time; confirm once and it remembers. There is nothing to install and nothing to connect.",
    },
    {
      id: "replaces-payroll-software",
      q: "Does Clarivo replace my payroll software?",
      a: "No. Your payroll system still calculates and pays salaries. Clarivo checks what it produced and shows you what changed before you approve. It never changes your data.",
    },
    {
      id: "payroll-data",
      q: "What happens to my payroll data?",
      a: "Each company's data is kept separate and encrypted, and it is never used to train AI models. The AI only recognises your columns, writes a plain-language summary and ranks alerts; it never changes a number.",
    },
    {
      id: "pay-frequencies",
      q: "Which pay frequencies and currencies does it handle?",
      a: "Monthly, bi-monthly, bi-weekly and weekly payrolls, in any currency. Clarivo never adds amounts in different currencies together; each currency is reported on its own.",
    },
    {
      id: "cost",
      q: "How much does Clarivo cost?",
      a: "Clarivo is free during the beta, with no credit card. When billing starts, plans run from ¤29 to ¤49 a month by company size. Over 2,000 employees is Enterprise, priced on request.",
    },
  ],
} as const;

export const FINAL_CTA = {
  headline: "Approve your next payroll with confidence",
  subHeadline:
    "Upload two payroll periods and see every salary KPI, and every alert, in minutes.",
  primary: "Get early access",
  secondary: "Sign in",
  trust: "Free during the beta · No credit card · Cancel anytime",
  /**
   * Behind the founderLine switch, which is on.
   *
   * "Founder" here is Radwan, not a founder *price* — this line survived the
   * removal of the beta discount because it is about who built the product.
   */
  founderLine:
    "Built by Radwan Sheb, an SAP payroll lead who has delivered payroll projects across Europe and the Gulf, including a 12-country rollout.",
} as const;

export const FOOTER = {
  brandLine: "Clarivo. Payroll, clearly.",
  product: NAV,
  /**
   * The blog needs an inbound internal link from somewhere, or it is an
   * orphan: the header is in-page anchors and cannot carry it, and a page
   * nothing links to accumulates no internal authority however good it is.
   * The footer is on every page, which is exactly what a hub page wants.
   */
  resources: [{ label: "Writing", href: "/blog" }],
  legal: [
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Data processing agreement", href: "/dpa" },
  ],
  /**
   * No legal entity yet, so the line carries the notice alone. Once Clarivo is
   * registered, add the entity name, registered address and registration
   * number here — most EU jurisdictions require them on a commercial site, and
   * the footer is where a visitor looks for them.
   */
  company: "© 2026 Clarivo",
} as const;

/* -------------------------------------------------------------------------- *
 * Per-market copy
 * -------------------------------------------------------------------------- */

/**
 * The lines a currency symbol cannot fix.
 *
 * `/us` is `/` with `$` in front of the same numerals, and that was the right
 * answer for the United States. It is not the answer for Australia: the
 * numerals differ, the tax is GST, a fortnight is not a "bi-weekly", the pay
 * systems a register comes out of are different ones, and the payroll-error
 * statistic on `/` surveyed US companies and says nothing about an Australian
 * payroll. A page that only swapped the symbol would be a near-duplicate of
 * `/us` carrying an American fact under an Australian flag.
 *
 * So a market may override the handful of lines that are *wrong* in it, and
 * nothing else. Everything a market does not name is read from the one shared
 * constant above, which is what keeps `/`, `/us` and `/au` arguing the same
 * case in the same voice. `EUR` and `USD` are literally the same object below,
 * so those two cannot drift apart at all.
 *
 * `null` means "use the shared line". It is not the same as an empty string,
 * which would publish a blank.
 */
type PlanName = (typeof PRICING.plans)[number]["name"];
type FaqId = (typeof FAQ.items)[number]["id"];

/**
 * One plan's two figures, in the `¤` placeholder form `money()` reads.
 *
 * Two, not four: the founder pair went with the beta discount. Dropping them
 * from the interface rather than leaving them optional is deliberate — an
 * optional `founderMonthly` would let a market reintroduce a second ladder
 * without anything objecting, which is how the page and the checkout came to
 * disagree in the first place.
 */
export interface PlanPrices {
  listMonthly: string;
  listYearly: string;
}

/** A market-only section, rendered after the alerts band. */
export interface MarketNote {
  eyebrow: string;
  headline: string;
  body: string;
  /** What Clarivo does not do, stated before anyone infers it. */
  limit: string;
  points: readonly { title: string; line: string }[];
  source: string;
  sourceHref: string;
}

export interface MarketCopy {
  /** Page title and meta description. Null keeps `SITE`'s. */
  meta: { title: string; description: string } | null;
  /** Opens the pricing small print. Australia charges GST, not VAT. */
  taxLine: string;
  /** Step 1 of "How it works". Null keeps the stored step. */
  uploadStep: string | null;
  /** The pay-frequency line in "Every plan includes". Null keeps the stored one. */
  cadenceIncludes: string | null;
  /** The problem section's figures and their source. Null keeps the stored ones. */
  problem: {
    stats: readonly { value: string; label: string }[];
    source: string;
    sourceHref: string;
  } | null;
  /** The price ladder by plan name. Null reads the ladder on `PRICING.plans`. */
  plans: Record<PlanName, PlanPrices> | null;
  /** Answers replaced by id, and market-only questions inserted after one. */
  faq: {
    replace: Partial<Record<FaqId, string>>;
    extra: readonly { after: FaqId; id: string; q: string; a: string }[];
  };
  note: MarketNote | null;
  /**
   * A line under the security points. It is rendered only when the "Hosted in
   * the EU" point itself is — see `sections/security.tsx`. A note that
   * elaborates on a claim must not outlive the claim's launch switch.
   */
  securityNote: string | null;
}

/**
 * Euro and dollars. One object, shared by both, so `/` and `/us` cannot drift.
 *
 * "Prices exclude VAT" is also what `/us` says today, and the United States
 * charges sales tax rather than VAT. That is a separate copy decision from
 * this one and is left as it was found; changing it is a one-line change here
 * once Radwan decides what a US invoice will actually say.
 */
const SHARED_MARKET: MarketCopy = {
  meta: null,
  taxLine: "Prices exclude VAT.",
  uploadStep: null,
  cadenceIncludes: null,
  problem: null,
  plans: null,
  faq: { replace: {}, extra: [] },
  note: null,
  securityNote: null,
};

export const MARKETS: Record<Currency, MarketCopy> = {
  EUR: SHARED_MARKET,
  USD: SHARED_MARKET,
  AUD: {
    meta: {
      /** 57 characters. */
      title: "Payroll Dashboard with Anomaly Alerts | Clarivo Australia",
      /** 149 characters. */
      description:
        "Payroll dashboard for Australian payroll teams. Upload your file, see every salary KPI and catch anomalies before payday. Free in beta, prices in A$.",
    },
    taxLine: "Prices exclude GST.",
    uploadStep:
      "Export the payroll register from Xero, MYOB, Employment Hero or whatever you run payroll in, as Excel or CSV, and drop it in. Monthly, fortnightly, twice a month or weekly.",
    cadenceIncludes: "Monthly, fortnightly, twice-a-month and weekly payrolls",
    /**
     * Australian figures, from an Australian regulator.
     *
     * The EY survey on `/` and `/us` polled payroll professionals at **US**
     * companies, so its three numbers describe American payrolls and nothing
     * else. Reusing them here under an Australian heading would be the same
     * claim with the country filed off, so they are replaced rather than
     * reworded, and the alternative to finding an Australian source was
     * dropping the statistics from this page entirely.
     *
     * These are what the Fair Work Ombudsman recovered, not an error rate: a
     * recovery is an underpayment someone found, usually long after payday.
     * The labels say exactly that and claim nothing further.
     *
     * Written as a literal rather than the `¤` placeholder, and with a plain
     * `$`. Plain, because `A$` is now reserved for prices: these are figures,
     * and the rule is that a figure standing in a sentence an Australian reads
     * takes the symbol an Australian writes. Literal, because the figure is
     * published in Australian dollars by its source — it is not this page's
     * currency choice, so it must not follow the market the way a price does.
     * These live inside `MARKETS.AUD` and therefore render on `/au` alone,
     * which is what makes a plain `$` unambiguous here.
     */
    problem: {
      stats: [
        { value: "$453m", label: "recovered for underpaid workers in 2025–26" },
        { value: "181,000", label: "workers were back-paid in that one year" },
        { value: "$217m", label: "of it from large employers alone" },
      ],
      source: "Source: Fair Work Ombudsman, annual report 2025–26, published 29 October 2026.",
      sourceHref:
        "https://www.fairwork.gov.au/newsroom/media-releases/2026-media-releases/october-2026/20261029-annual-report-2025-26-media-release",
    },
    /**
     * The Australian ladder: A$49 and A$79 list, ten times the monthly figure
     * for a year — the same shape as the euro and dollar ladders, in
     * Australia's own numerals. List prices per market, not conversions.
     *
     * **These two numerals are awaiting sign-off.** They were my choice, and
     * the Polar account carries no AUD product to take them from — checked
     * twice, on two fresh checkout sessions: one €29 Starter, no currency
     * selector. Until an AUD product exists in Polar, an Australian who
     * reaches checkout is billed in euro, whatever this page says. Changing
     * the ladder is editing the four strings below and nothing else.
     */
    plans: {
      Starter: {
        listMonthly: "¤49",
        listYearly: "¤490",
      },
      Growth: {
        listMonthly: "¤79",
        listYearly: "¤790",
      },
    },
    faq: {
      replace: {
        "payroll-systems":
          "Any system that exports to Excel or CSV: Xero, MYOB, Employment Hero, SAP, ADP or your own spreadsheets. Clarivo reads the file you export and connects to none of them, so nothing has to change in the system that pays your people.",
        "pay-frequencies":
          "Monthly, fortnightly, twice-a-month and weekly payrolls, in any currency. Inside the app the fortnightly cycle is called Bi-weekly. Clarivo never adds amounts in different currencies together; each currency is reported on its own.",
        cost: "Clarivo is free during the beta, with no credit card. When billing starts, plans run from ¤49 to ¤79 a month by company size, excluding GST. Over 2,000 employees is Enterprise, priced on request.",
      },
      extra: [
        {
          after: "payroll-systems",
          id: "superannuation",
          q: "Does Clarivo check superannuation or Payday Super?",
          a: "No. Clarivo does not check Payday Super compliance, and no payroll file can show whether money reached a fund. It reads the register before you approve it. If superannuation is a column in your file, Clarivo compares it with the last period for every employee, shows what moved, and flags a line that appeared for someone new or stopped for someone still on the payroll. The 12% rate, the seven-business-day window and everything you lodge stay with your payroll system and your fund or clearing house.",
        },
      ],
    },
    /**
     * Superannuation, stated as what it is for the reader and what it is not
     * for the product.
     *
     * Payday Super has been in force since 1 July 2026, so this is a thing an
     * Australian payroll manager already does every fortnight rather than a
     * change coming up. The limit paragraph is not a disclaimer bolted on the
     * end: `annual/classify.ts` has no vocabulary for superannuation at all,
     * nothing in the product looks at a payment date, and a payroll register
     * cannot show whether money reached a fund. What is claimed here is the
     * period-over-period comparison, which is generic over whatever columns a
     * file carries and therefore true of a super column today.
     */
    note: {
      eyebrow: "Australian payroll",
      headline: "Super moves with every pay run now",
      body: "Since 1 July 2026, superannuation goes out with the pay run rather than once a quarter, at 12% of qualifying earnings, and it has to reach the employee's fund within seven business days of payday. A super line that was wrong used to have until the end of the quarter to surface. Now it has a week.",
      limit:
        "Clarivo does not check Payday Super compliance, and no payroll file can show whether money reached a fund. What it reads is the register you are about to approve. If superannuation is a column in it, Clarivo compares that column with the last period for every employee, shows what moved, and flags the line that appeared for someone new or stopped for someone still on the payroll.",
      points: [
        {
          title: "Fortnightly, weekly, twice a month or monthly",
          line: "Whatever your pay cycle is, the comparison is the same. The fortnightly cycle is called Bi-weekly inside the app.",
        },
        {
          title: "The file you already export",
          line: "Xero, MYOB, Employment Hero, or anything else that writes Excel or CSV. Clarivo reads the export and connects to none of them, so nothing changes in the system that pays your people.",
        },
        {
          title: "What stays with your payroll system",
          line: "Clarivo applies no Australian payroll law. It does not calculate super, PAYG withholding or leave, and it lodges nothing with the ATO. Your payroll system does all of that, and Clarivo checks what it produced.",
        },
      ],
      source: "Payday Super rules: Australian Taxation Office.",
      sourceHref:
        "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/about-payday-super",
    },
    securityNote:
      "Clarivo runs in Frankfurt, Germany, so payroll data uploaded from Australia leaves the country. Australian Privacy Principle 8 covers sending personal information overseas, which makes this a fact you want before you upload rather than after. The security page names the region and the database.",
  },
};

/**
 * The markets with a page, in publication order: `/`, `/us`, `/au`.
 *
 * Exported so anything that has to speak about every market at once —
 * `/llms.txt` quotes all three price ladders — walks one list rather than
 * writing the currencies out again and missing the next one.
 */
export const MARKET_CURRENCIES: readonly Currency[] = ["EUR", "USD", "AUD"];

/** The copy for one market. */
export function market(currency: Currency): MarketCopy {
  return MARKETS[currency];
}

/**
 * One plan's figures in one market.
 *
 * The plan object itself is the fallback, so `/` and `/us` read the stored
 * ladder directly and a market that lists no prices cannot silently lose them.
 */
export function planPrices(plan: (typeof PRICING.plans)[number], currency: Currency): PlanPrices {
  return MARKETS[currency].plans?.[plan.name] ?? plan;
}

/**
 * The FAQ as one market renders it: shared questions in their stored order,
 * market answers where a market has one, market-only questions in place.
 *
 * Both the visible section and the FAQPage structured data call this, for the
 * reason stated at the top of this file — the two are one list rendered twice
 * and must never disagree. A market question that existed in the markup but
 * not on the page would be exactly that disagreement.
 */
export function marketFaq(
  currency: Currency,
): readonly { id: string; q: string; a: string }[] {
  const { replace, extra } = MARKETS[currency].faq;
  const items: { id: string; q: string; a: string }[] = [];

  for (const item of FAQ.items) {
    items.push({ id: item.id, q: item.q, a: replace[item.id] ?? item.a });
    for (const addition of extra) {
      if (addition.after === item.id) {
        items.push({ id: addition.id, q: addition.q, a: addition.a });
      }
    }
  }

  return items;
}

/**
 * The highest monthly list price in a market, for the `AggregateOffer` in the
 * structured data.
 *
 * Derived rather than written down: the JSON-LD carried a hardcoded `299`
 * from the three-plan ladder, which no plan has cost since that ladder was
 * rewritten, and on `/au` it would have published an Australian price that
 * does not exist. Reading `PRICING.plans` means the markup follows the
 * pricing table by construction.
 */
export function highestMonthlyListPrice(currency: Currency): string {
  const figures = PRICING.plans.map((plan) =>
    Number(planPrices(plan, currency).listMonthly.replace("¤", "").replace(/,/g, "")),
  );
  return String(Math.max(...figures));
}
