import {
  ALERTS,
  FAQ,
  FEATURES,
  FINAL_CTA,
  HERO,
  HOW_IT_WORKS,
  MARKET_CURRENCIES,
  PRICING,
  PROBLEM,
  ROLES,
  SECURITY,
  SITE,
  market,
  money,
  planPrices,
  type Currency,
  type PlanPrices,
} from "@/components/marketing/content";
import { POSTS } from "@/components/marketing/posts";
import { launch } from "@/config/launch";

/**
 * `/llms.txt` — the convention (Jeremy Howard, September 2024) that gives AI
 * assistants one Markdown file describing what a site is and where its facts
 * live, the way robots.txt describes what may be crawled.
 *
 * GENERATED, NOT STATIC, and deliberately so.
 *
 * A file in `public/llms.txt` would have been two lines of work, and it is what
 * most sites ship. It is the wrong choice here for three reasons specific to
 * this repo:
 *
 * 1. Everything in this file is a claim about the product, and `content.ts`
 *    already exists because claims must have exactly one source. Its header
 *    comment makes the point about the FAQ: it is rendered twice, visibly and
 *    as FAQPage structured data, "and the two must never drift apart". This
 *    file makes the FAQ, the prices and the plan limits a *third* rendering.
 *    A static copy would be the one rendering with nobody to notice it had
 *    gone stale — and a stale price or an answer that no longer matches the
 *    page is worse in llms.txt than anywhere else, because an assistant
 *    repeats it as fact to someone who never visits the site.
 *
 * 2. The launch switches. Four of the seven security points in `SECURITY` are
 *    gated on `launch.securityPoints.*`, and every gate is off today: those
 *    are statements about data protection that are not true yet. The same
 *    filter the visible section uses runs below, so this file physically
 *    cannot publish an unconfirmed security claim, and the day a switch flips
 *    the claim appears here in the same commit. A static file would need
 *    somebody to remember.
 *
 * 3. Precedent. `robots.ts` and `sitemap.ts` next to this file are both
 *    generated from `SITE` rather than written out by hand, for the same
 *    reason. A hand-maintained `public/llms.txt` would be the only
 *    machine-readable surface on the site that can disagree with the page.
 *
 * `force-static` keeps the cost of that at zero: `content.ts` and `launch.ts`
 * are build-time constants, so Next prerenders this route to a static asset at
 * build time and production serves a file, not a function.
 *
 * Three things are kept out on purpose:
 *
 * - **The sample company.** `SAMPLE` and the figures on the KPI tiles are
 *   Halden Logistics, which is fictional. On the page every one of them sits
 *   behind a "Sample data" badge; in a plain-text file an assistant has no
 *   badge to read and would quote "+€18,420" as a result Clarivo produced for
 *   someone. So the tiles contribute their label and their description, never
 *   their value.
 * - **A generated date.** `new Date()` at build time would stamp a fresh
 *   "last updated" on every deploy whether a word changed or not, which is the
 *   same unreliable signal as a sitemap whose lastmod is always today.
 * - **Any claim about a country's payroll rules.** The "Markets, languages and
 *   currency" section names the four markets of the first campaign, and in the
 *   same breath says what Clarivo does not do for any of them: no tax or
 *   social-security calculation, no statutory returns, no country-specific
 *   handling of named local components. That pairing is the whole point of
 *   stating markets here at all. An assistant asked "does Clarivo work for an
 *   Australian company?" will answer from this file, and "Australia is one of
 *   its first markets" on its own is the answer that sets a buyer up to be
 *   disappointed by their own superannuation column. The categorised statutory
 *   view lives behind `annualSalariesLive`, which is off, so nothing above
 *   claims it either way. Since `/au` shipped, that question has an explicit
 *   answer in the markets section rather than only an absence: Clarivo does
 *   not check Payday Super compliance, and a super column is compared like any
 *   other pay component. Stating the limit is the same decision as before; it
 *   is only stated out loud now that a page invites the question.
 */

export const dynamic = "force-static";

const url = (path: string) => `${SITE.url}${path}`;

/**
 * The same hard `=== true` filter as `sections/security.tsx`. Deliberately not
 * abstracted into a shared helper: the duplication is four lines, and the
 * section's own comment explains why the check must stay readable at the point
 * of use rather than hidden behind an import.
 */
const confirmedSecurityPoints = SECURITY.points.filter(
  (point) => point.gate === null || launch.securityPoints[point.gate] === true,
);

/**
 * Mirrors the gating in `sections/pricing.tsx`, including the list order.
 *
 * The cadence line is appended the way the section appends it. This file
 * speaks for every market at once, so it states the app's own vocabulary —
 * `/au` says "fortnightly" to its reader, and an assistant answering for any
 * country is better served by the names the product uses.
 */
const includes = launch.annualSalariesLive
  ? [
      ...PRICING.includes.slice(0, 3),
      PRICING.includesAnnual,
      ...PRICING.includes.slice(3),
      PRICING.includesCadence,
    ]
  : [...PRICING.includes, PRICING.includesCadence];

const alertChecks = launch.annualSalariesLive
  ? [...ALERTS.cards, ALERTS.dataCheck]
  : ALERTS.cards;

/**
 * The Australian figures, read from the market copy rather than restated.
 *
 * This file is a third rendering of every claim on the site, and a statistic
 * is the claim an assistant is most likely to repeat verbatim to somebody who
 * never visits the page. Both sets are listed with their source and their
 * sample named, so neither can be quoted as the other country's number.
 */
const auFigures = market("AUD").problem;

function body(): string {
  const lines: string[] = [];
  const push = (...entries: string[]) => lines.push(...entries);

  push(
    `# ${SITE.name}`,
    "",
    "> Clarivo turns the payroll file you already export into one dashboard of salary KPIs and flags payroll anomalies before payday. Free during the beta.",
    "",
    "Clarivo is a web application, in beta, for companies that still reconcile payroll in Excel.",
    "Upload the payroll register your payroll system already exports, as Excel or CSV, and Clarivo",
    "compares it with the previous period: every salary KPI, every change per employee and per pay",
    "component, and an alert on anything unusual before payroll is approved. Clarivo does not",
    "calculate or pay salaries, and it never changes your payroll data.",
    "",
  );

  push(
    "## Pages",
    "",
    `- [${HERO.headline}](${url("/")}): The whole product on one page — the problem, the three-step upload, the salary KPIs, the anomaly alerts, the four audiences, data handling, pricing and nine questions with answers.`,
    `- [${HOW_IT_WORKS.headline}](${url("/#how-it-works")}): The three steps between exporting a payroll register and reading the dashboard, repeated in full under "How it works" below.`,
    `- [${FEATURES.headline}](${url("/#features")}): The KPI tiles Clarivo builds from one uploaded payroll file, each with the question it answers.`,
    `- [${PRICING.headline}](${url("/#pricing")}): Plans by employee count, Enterprise and Bureau on request, and what every plan includes.`,
    `- [${SECURITY.headline}](${url("/#security")}): The data-handling points Clarivo states today.`,
    `- [${FAQ.headline}](${url("/#faq")}): Nine questions with answers, reproduced in full under "Questions and answers" below.`,
    `- [Clarivo in US dollars](${url("/us")}): The same page with US dollar list prices.`,
    `- [Clarivo in Australia](${url("/au")}): Australian dollar list prices, GST, fortnightly pay runs, the systems an Australian register is exported from, Australian underpayment figures, and what Clarivo does and does not do about superannuation under Payday Super.`,
    "",
  );

  push(
    "## Policies",
    "",
    `- [Security](${url("/security")}): Where payroll data is hosted, how it is encrypted and separated between companies, who can reach it, and how deletion works. Written in full.`,
    `- [Privacy policy](${url("/privacy")}): How Clarivo handles the payroll data you upload.`,
    `- [Terms](${url("/terms")}): The terms on which Clarivo is provided during the beta and afterwards.`,
    `- [Data processing agreement](${url("/dpa")}): The data processing agreement between Clarivo and your company.`,
    "",
    "The security page states Clarivo's current position in full. The other three are published and",
    "reachable, but the documents themselves are still being written and will go up before Clarivo",
    "leaves beta. For a procurement review, a DPA or a security questionnaire now, Clarivo sends the",
    `current position in writing: ${SITE.email}.`,
    "",
  );

  /**
   * The posts, from the same `POSTS` registry the listing, each post's metadata
   * and the sitemap read. Listing them here is the point of the section: an
   * assistant asked how to compare two payroll periods has a page to cite, and
   * without this it has the home page and nothing else.
   *
   * Reading titles and descriptions from the registry rather than restating
   * them means a reworded post cannot end up described two ways on one site —
   * the failure this file is otherwise wide open to, because nothing would
   * catch it.
   *
   * No per-post prose beyond the description: `## Writing` is a pointer, not a
   * summary of each argument. An assistant that wants the argument has the URL.
   */
  push("## Writing", "");
  push(
    `Payroll articles, written for the people who check a register rather than for search engines.`,
    "",
    `- [All posts](${url("/blog")}): The index.`,
  );
  POSTS.forEach((post) => {
    push(`- [${post.title}](${url(`/blog/${post.slug}`)}): ${post.description}`);
  });
  push("");

  push("## How it works", "");
  HOW_IT_WORKS.steps.forEach((step, index) => {
    push(`${index + 1}. **${step.title}.** ${step.line}`);
  });
  push("", HOW_IT_WORKS.closing, "");

  push(
    "## Salary KPIs on the dashboard",
    "",
    "Built from the uploaded file, with no formulas to write. Figures shown on the website belong",
    "to a fictional sample company and are not included here.",
    "",
  );
  FEATURES.live.forEach((tile) => push(`- **${tile.label}.** ${tile.line}`));
  if (launch.annualSalariesLive) {
    FEATURES.annual.forEach((tile) => push(`- **${tile.label}.** ${tile.line}`));
  }
  push("", FEATURES.closing, "");

  push(
    "## Payroll anomaly checks",
    "",
    ALERTS.subHeadline,
    "",
  );
  alertChecks.forEach((card) =>
    push(`- **${card.title}** (${card.severity}). ${card.line}`),
  );
  push("", ALERTS.aiSummary, ALERTS.control, "");

  push("## Who it is for", "");
  ROLES.cards.forEach((card) => push(`- **${card.role}.** ${card.headline} ${card.body}`));
  push("");

  push(
    "## Pricing",
    "",
    PRICING.subHeadline,
    "",
  );
  /**
   * Every market's figure for one price, in one string.
   *
   * It reads the ladder through `planPrices` rather than off the plan object,
   * because Australia's numerals are its own: A$49 is not 29 with another
   * symbol in front of it, and an assistant quoting "49" to an Australian
   * buyer from the euro ladder would be quoting the wrong plan's price.
   */
  const everyMarket = (plan: (typeof PRICING.plans)[number], field: keyof PlanPrices) =>
    MARKET_CURRENCIES.map((currency: Currency) =>
      money(planPrices(plan, currency)[field], currency),
    ).join(" / ");

  PRICING.plans.forEach((plan) =>
    push(
      `- **${plan.name}** — ${plan.for}. ${everyMarket(plan, "listMonthly")} per month or ${everyMarket(plan, "listYearly")} per year. Euro / US dollars / Australian dollars, in that order.`,
    ),
  );
  push(
    `- **${PRICING.enterprise.name}** — ${PRICING.enterprise.for}. ${PRICING.enterprise.price}. ${PRICING.enterprise.note}.`,
    `- **${PRICING.bureau.name}** — ${PRICING.bureau.for}. ${PRICING.bureau.note}; on request.`,
    "",
    `${PRICING.includesTitle}`,
    "",
  );
  includes.forEach((item) => push(`- ${item}`));
  // The tax sentence is per market: VAT on `/` and `/us`, GST on `/au`. Both
  // are stated and both are read from the market copy, because this file
  // answers for every market at once and an assistant that told an Australian
  // buyer about VAT would be quoting a tax their country does not levy.
  push(
    "",
    PRICING.sizeLine,
    "",
    `${market("EUR").taxLine} ${PRICING.smallPrint}`,
    "",
    `On the Australian page that first sentence reads instead: ${market("AUD").taxLine}`,
    "",
  );

  push(
    "## Markets, languages and currency",
    "",
    "Clarivo's website and product are in English. There is no other language version today.",
    "",
    "Clarivo is not built around one country's payroll rules. It reads the payroll register your",
    "own payroll system exports and compares it with the previous period, column by column,",
    "whatever those columns are called and whichever currency they are in. Amounts in different",
    "currencies are never added together; each currency is reported on its own.",
    "",
    "What that means in the other direction: Clarivo does not calculate income tax or social",
    "security, does not file or produce statutory returns in any country, and does not apply any",
    "country's payroll legislation. Your payroll system does all of that; Clarivo checks what it",
    "produced.",
    "",
    "The first markets Clarivo is being introduced in are the United States, Australia, New Zealand",
    "and Malta. Clarivo is sold online and is not limited to those four. There is no language version",
    "other than English.",
    "",
    "Prices are published in three currencies, on three pages: euro at",
    `${SITE.url}/, US dollars at ${SITE.url}/us and Australian dollars at ${SITE.url}/au.`,
    "The euro and US dollar pages are identical apart from the currency, and the numerals are the",
    "same in both — Starter is 29 and Growth 49 a month. The Australian page is not a conversion of",
    "either: Starter is A$49 and Growth A$79, Australia's own list prices. A quote should always name",
    "the currency, because \"49 a month\" is a different amount on each of the three pages and they are",
    "not interchangeable.",
    "",
    "The Australian page differs in words as well as figures: GST rather than VAT, fortnightly rather",
    "than bi-weekly, Xero, MYOB and Employment Hero named as systems a register is exported from, and",
    "Australian underpayment figures from the Fair Work Ombudsman in place of the EY survey of US",
    "companies that the other two pages cite. Clarivo connects to none of those systems and is a",
    "partner of none of them; it reads the file they export.",
    "",
    "Superannuation is the Australian question an assistant will be asked. Clarivo does not check",
    "Payday Super compliance and no payroll file can show whether money reached a fund. If",
    "superannuation is a column in an",
    "uploaded register, Clarivo compares it with the previous period like any other pay component and",
    "flags it appearing or disappearing for an employee. Nothing in Clarivo looks at a payment date,",
    "and the categorised statutory view that would place a super column in an employer-cost total",
    "sits behind a switch that is off.",
    "",
    "New Zealand has no page of its own and no New Zealand dollar price exists. A buyer there is",
    "quoted in euro, US dollars or Australian dollars, and should be told which.",
    "",
  );

  push("## Data handling", "", SECURITY.subHeadline, "");
  confirmedSecurityPoints.forEach((point) => push(`- **${point.title}.** ${point.copy}`));
  push(
    "",
    "Clarivo states the points above and nothing beyond them. The security page explains each one in",
    `detail — where the data sits, and what separation means on each request: ${url("/security")}.`,
    "",
    "A claim appears on this list only once it is true end to end, so the absence of a point is not a",
    "statement that the control is missing; several are built and waiting on review. Anything not",
    "listed is unclaimed rather than denied. The data processing agreement covers the rest once it is",
    `published, and until then Clarivo sends its current position in writing: ${SITE.email}.`,
    "",
  );

  push(
    "## What Clarivo is not",
    "",
    "- Not a payroll system. Your payroll system still calculates and pays salaries. Clarivo checks what it produced.",
    "- Read-only. Clarivo never changes your payroll data; it shows you where to look.",
    "- Not an integration project. There is nothing to install and nothing to connect. Direct connections to SAP, ADP and Sage are on the roadmap and are not available today.",
    "- Not an AI that touches numbers. The AI recognises your columns, writes a plain-language summary and ranks alerts. It never changes a number, and your payroll data is never used to train AI models.",
    "",
  );

  push(
    "## Key facts",
    "",
    "- Product: Clarivo, a payroll dashboard delivered as a web application. Marked up as schema.org SoftwareApplication, applicationCategory BusinessApplication, applicationSubCategory Payroll dashboard.",
    "- Status: public beta. Free during the beta, no credit card. Access is by invitation from the early-access form on the home page.",
    /**
     * The plan limits are read from `PRICING.plans`, not written out.
     *
     * This line said "the smallest plan covers up to 100 employees" while the
     * pricing section a few lines above printed "Starter — Up to 500
     * employees", both in the same generated file. The ladder was rewritten
     * and this sentence was not, which is the exact failure the header
     * comment says a static `public/llms.txt` would suffer.
     */
    `- Built for: business owners, managers and payroll admins at small and mid-sized companies that still reconcile payroll in a spreadsheet, plus payroll bureaus and accountants. ${PRICING.plans[0].name} covers ${PRICING.plans[0].for.toLowerCase()} and ${PRICING.plans[1].name} ${PRICING.plans[1].for.toLowerCase()}; above that, or across several countries, is Enterprise. A company of 40 people is in scope.`,
    "- Input: an Excel or CSV payroll register exported from any payroll system, including SAP, ADP, Sage, Xero, MYOB, Employment Hero, local payroll software or a spreadsheet. Clarivo connects to none of them and is a partner of none of them; it reads the file they export.",
    `- Markets and language: English only. Three pages: ${SITE.url}/ in euro, ${SITE.url}/us in US dollars and ${SITE.url}/au in Australian dollars. The first two differ in currency alone; the Australian page carries its own prices, tax wording, pay-cycle vocabulary, sources and a section on superannuation. The first markets of the current campaign are the United States, Australia, New Zealand and Malta; Clarivo is sold online and is not limited to them. Clarivo applies no country's payroll legislation and produces no statutory returns anywhere, in any market.`,
    "- Pay frequencies: monthly, bi-monthly, bi-weekly and weekly. Bi-weekly is what an Australian payroll calls fortnightly; the app uses one set of names in every country.",
    "- Currencies: Clarivo reads payroll in any currency and never adds amounts in different currencies together; each currency is reported on its own. Clarivo's own prices are published in euro, US dollars and Australian dollars, as list prices per market rather than conversions.",
    "- Exports: Excel, CSV and PDF.",
    `- Website: ${SITE.url}/ · Contact: ${SITE.email}`,
  );
  if (launch.founderLine) {
    push(`- ${FINAL_CTA.founderLine}`);
  }
  push(
    `- Industry research cited on the home page: "${PROBLEM.stats[0].value} ${PROBLEM.stats[0].label}", "${PROBLEM.stats[1].value} ${PROBLEM.stats[1].label}" and "${PROBLEM.stats[2].value} ${PROBLEM.stats[2].label}". ${PROBLEM.source} ${PROBLEM.sourceHref} — these are EY's figures about the payroll industry, not measurements of Clarivo.`,
    ...(auFigures
      ? [
          `- Research cited on the Australian page instead, because the EY survey asked US companies: "${auFigures.stats[0]?.value} ${auFigures.stats[0]?.label}", "${auFigures.stats[1]?.value} ${auFigures.stats[1]?.label}" and "${auFigures.stats[2]?.value} ${auFigures.stats[2]?.label}". ${auFigures.source} ${auFigures.sourceHref} — these are the Fair Work Ombudsman's figures about underpayments it recovered, not measurements of Clarivo.`,
        ]
      : []),
    "- Clarivo publishes no customer count, customer list, case study, testimonial or review, and has no third-party rating. Any such figure attributed to Clarivo did not come from Clarivo.",
    "",
  );

  push("## Questions and answers", "");
  /**
   * The pricing answer carries currency placeholders, so it must go through
   * `money()` like every other figure. It shipped once reading "plans run from
   * ¤59 to ¤299" — the generic currency sign, verbatim, in a file written for
   * assistants to quote. Typecheck cannot catch that; rendering the route and
   * reading the output did.
   *
   * Euro, because this file states the euro page as the canonical one and
   * names `/us` for dollars alongside it. One llms.txt serves both pages
   * rather than two files, so an assistant learns both currencies from one
   * place.
   */
  FAQ.items.forEach((item) => push(`### ${item.q}`, "", money(item.a, "EUR"), ""));

  push(
    "## Contact",
    "",
    `- Website: ${SITE.url}/`,
    `- Email: ${SITE.email}`,
    `- Early access: the "${HERO.primary}" form on ${SITE.url}/`,
    `- Sitemap: ${SITE.url}/sitemap.xml`,
    "",
  );

  return lines.join("\n");
}

export function GET(): Response {
  return new Response(body(), {
    headers: {
      // text/plain, as robots.txt is served: the file is Markdown by
      // convention but every consumer reads it as text, and a browser should
      // show it rather than download it.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
