import {
  ALERTS,
  FAQ,
  FEATURES,
  FINAL_CTA,
  HERO,
  HOW_IT_WORKS,
  PRICING,
  PROBLEM,
  ROLES,
  SECURITY,
  SITE,
  money,
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
 *   claims it either way.
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

/** Mirrors the gating in `sections/pricing.tsx`, including the list order. */
const includes = launch.annualSalariesLive
  ? [...PRICING.includes.slice(0, 3), PRICING.includesAnnual, ...PRICING.includes.slice(3)]
  : PRICING.includes;

const alertChecks = launch.annualSalariesLive
  ? [...ALERTS.cards, ALERTS.dataCheck]
  : ALERTS.cards;

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
    `- [${PRICING.headline}](${url("/#pricing")}): Plans by employee count, Enterprise and Bureau on request, the beta founder discount, and what every plan includes.`,
    `- [${SECURITY.headline}](${url("/#security")}): The data-handling points Clarivo states today.`,
    `- [${FAQ.headline}](${url("/#faq")}): Nine questions with answers, reproduced in full under "Questions and answers" below.`,
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
  PRICING.plans.forEach((plan) =>
    push(
      `- **${plan.name}** — ${plan.for}. List ${money(plan.listMonthly, "EUR")} / ${money(plan.listMonthly, "USD")} per month or ${money(plan.listYearly, "EUR")} / ${money(plan.listYearly, "USD")} per year. Beta founder price ${money(plan.founderMonthly, "EUR")} / ${money(plan.founderMonthly, "USD")} per month or ${money(plan.founderYearly, "EUR")} / ${money(plan.founderYearly, "USD")} per year.`,
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
  push("", PRICING.sizeLine, "", PRICING.smallPrint, "");

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
    "other than English, and no country-specific content: the only thing that differs between the two",
    "pages is the currency the prices are quoted in.",
    "",
    "Prices exclude VAT and are published in two currencies, on two pages: euro at",
    `${SITE.url}/ and US dollars at ${SITE.url}/us/. The two pages are identical apart from the`,
    "currency. The numerals are the same in both — Starter is 59, Growth 99, Business 299 a month —",
    "so these are list prices set per market, not one price converted at an exchange rate. A quote",
    "should name the currency, because \"59 a month\" is ambiguous and the two are not interchangeable.",
    "",
    "Australia and New Zealand have no page of their own yet and no Australian or New Zealand dollar",
    "price exists. A buyer in either country is quoted in euro or US dollars, and should be told which.",
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
    "- Built for: business owners, managers and payroll admins at small and mid-sized companies that still reconcile payroll in a spreadsheet, plus payroll bureaus and accountants. The smallest plan covers up to 100 employees and the largest self-serve plan up to 2,000; above that, or across several countries, is Enterprise. A company of 40 people is in scope.",
    "- Input: an Excel or CSV payroll register exported from any payroll system, including SAP, ADP, Sage, local payroll software or a spreadsheet.",
    `- Markets and language: English only. Two pages, differing in currency alone: ${SITE.url}/ in euro and ${SITE.url}/us/ in US dollars. The first markets of the current campaign are the United States, Australia, New Zealand and Malta; Clarivo is sold online and is not limited to them. Clarivo applies no country's payroll legislation and produces no statutory returns anywhere, in any market.`,
    "- Pay frequencies: monthly, bi-monthly, bi-weekly and weekly.",
    "- Currencies: Clarivo reads payroll in any currency and never adds amounts in different currencies together; each currency is reported on its own. Clarivo's own prices are published in euro and US dollars, as list prices per market rather than conversions.",
    "- Exports: Excel, CSV and PDF.",
    `- Website: ${SITE.url}/ · Contact: ${SITE.email}`,
  );
  if (launch.founderLine) {
    push(`- ${FINAL_CTA.founderLine}`);
  }
  push(
    `- Industry research cited on the home page: "${PROBLEM.stats[0].value} ${PROBLEM.stats[0].label}", "${PROBLEM.stats[1].value} ${PROBLEM.stats[1].label}" and "${PROBLEM.stats[2].value} ${PROBLEM.stats[2].label}". ${PROBLEM.source} ${PROBLEM.sourceHref} — these are EY's figures about the payroll industry, not measurements of Clarivo.`,
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
   * names `/us/` for dollars alongside it. One llms.txt serves both pages
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
