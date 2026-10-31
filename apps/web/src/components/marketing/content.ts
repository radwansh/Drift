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
 * two URLs — `/` in euro and `/us/` in dollars — each crawlable, each carrying
 * the full hreflang mesh. They are separate URLs on purpose: serving different
 * content at one URL by visitor IP would mean Googlebot, which crawls mostly
 * from US addresses, only ever indexes one version.
 *
 * `¤` is U+00A4, the generic currency sign. Every price and every sample figure
 * stores the numerals once and `money()` substitutes the symbol, because the
 * dollar ladder Radwan set ($59/$99/$299) uses the same numerals as the euro
 * one. Holding two copies of the same numbers is how a price drifts — which has
 * already happened once in this repo between `content.ts` and
 * `docs/landing/content.md`. One set of numerals cannot drift from itself.
 *
 * It also preserves formatting exactly: signs, thousands separators and the `M`
 * suffix on the sample figures are part of the stored string, so nothing is
 * re-formatted per market and `−¤860` stays `−$860`.
 *
 * Prices are **list prices per market, not conversions.** $59 is not €59 at
 * some rate; it is the dollar price. There is therefore no FX rate policy and
 * no small print about which currency is actually charged.
 */
export type Currency = "EUR" | "USD";

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$" };

/** Substitutes the market's symbol into a stored figure. */
export function money(text: string, currency: Currency): string {
  return text.split("¤").join(CURRENCY_SYMBOL[currency]);
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

export const PRICING = {
  eyebrow: "Pricing",
  headline: "Simple payroll dashboard pricing, 50% off for beta founders",
  subHeadline:
    "Clarivo is free while it's in beta. When billing starts, every company that joined during the beta pays the founder price for 24 months. Every plan includes every feature.",
  toggle: { monthly: "Monthly", yearly: "Yearly (2 months free)" },
  founderBadge: "Beta founder: −50% for 24 months",
  cta: "Get early access",
  plans: [
    {
      name: "Starter",
      for: "Up to 100 employees",
      listMonthly: "¤59",
      founderMonthly: "¤29",
      founderYearly: "¤290",
      listYearly: "¤590",
      highlighted: false,
    },
    {
      name: "Growth",
      for: "Up to 500 employees",
      listMonthly: "¤99",
      founderMonthly: "¤49",
      founderYearly: "¤490",
      listYearly: "¤990",
      highlighted: true,
      tag: "Best for growing teams",
    },
    {
      name: "Business",
      for: "Up to 2,000 employees",
      listMonthly: "¤299",
      founderMonthly: "¤149",
      founderYearly: "¤1,490",
      listYearly: "¤2,990",
      highlighted: false,
    },
  ],
  enterprise: {
    name: "Enterprise",
    for: "Over 2,000 employees or several countries",
    price: "On request",
    note: "Founder discount applies",
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
    "Monthly, bi-monthly, bi-weekly and weekly payrolls",
  ],
  /** Listed only once the Annual Salaries fixes are live (annualSalariesLive). */
  includesAnnual:
    "The Annual Salaries Dashboard: paid to date, full-year forecast, employer cost and budget",
  sizeLine:
    "Clarivo counts the employees in each payroll file you upload. If a file goes over your plan's limit, we invite you to move up a plan; your comparison still runs.",
  smallPrint:
    "Prices exclude VAT. Monthly billing, cancel anytime; yearly billing gets two months free. The founder price applies to companies that sign up during the beta and lasts 24 months from the first invoice. The Bureau plan is billed per client company, from five clients upwards; a client company over 200 employees takes the plan that matches its size. Fair use applies to AI summaries.",
} as const;

/** Rendered visibly and as FAQPage structured data, from this one array. */
export const FAQ = {
  headline: "Payroll dashboard questions, answered",
  items: [
    {
      q: "What is a payroll dashboard?",
      a: "A payroll dashboard shows your payroll's key numbers on one screen: total salary cost, headcount, employer cost and what changed since the last period. Clarivo builds yours from the payroll file you already export, so you never build one in Excel again.",
    },
    {
      q: "How is Clarivo different from tracking payroll in Excel?",
      a: "In Excel, someone rebuilds the comparison every period, and the checks depend on who builds it. Clarivo compares every employee and every pay component automatically, keeps your payroll history in one place and flags what looks wrong, in one click.",
    },
    {
      q: "Which payroll systems does Clarivo work with?",
      a: "Any system that exports to Excel or CSV: SAP, ADP, Sage, local payroll software or your own spreadsheets. Direct connections to SAP, ADP and Sage are on our roadmap.",
    },
    {
      q: "What payroll anomalies does Clarivo detect?",
      a: "Net pay that changed by 20% or more with no change in any pay component, pay components that drop to zero, new or missing components, joiners and leavers, and data issues such as a missing pay period. Each alert says who, what and why.",
    },
    {
      q: "Do I need IT help to set it up?",
      a: "No. Upload a file and Clarivo maps your columns the first time; confirm once and it remembers. There is nothing to install and nothing to connect.",
    },
    {
      q: "Does Clarivo replace my payroll software?",
      a: "No. Your payroll system still calculates and pays salaries. Clarivo checks what it produced and shows you what changed before you approve. It never changes your data.",
    },
    {
      q: "What happens to my payroll data?",
      a: "Each company's data is kept separate and encrypted, and it is never used to train AI models. The AI only recognises your columns, writes a plain-language summary and ranks alerts; it never changes a number.",
    },
    {
      q: "Which pay frequencies and currencies does it handle?",
      a: "Monthly, bi-monthly, bi-weekly and weekly payrolls, in any currency. Clarivo never adds amounts in different currencies together; each currency is reported on its own.",
    },
    {
      q: "How much does Clarivo cost?",
      a: "Clarivo is free during the beta, with no credit card. When billing starts, plans run from ¤59 to ¤299 a month by company size, and beta founders pay half: ¤29 to ¤149 a month for 24 months.",
    },
  ],
} as const;

export const FINAL_CTA = {
  headline: "Approve your next payroll with confidence",
  subHeadline:
    "Upload two payroll periods and see every salary KPI, and every alert, in minutes.",
  primary: "Get early access",
  secondary: "Sign in",
  trust: "Free during the beta · No credit card · Founder price for 24 months",
  /** Behind the founderLine switch, which is on. */
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
