/**
 * The blog registry: one entry per post, read by `/blog`, by each post's own
 * metadata, and by `sitemap.ts`.
 *
 * Posts live here rather than in MDX because the repo has no content pipeline
 * and adding one would be a dependency and a build step for three articles.
 * Each post is a route under `app/(marketing)/blog/<slug>/` that writes its own
 * prose in TSX, exactly as `/security` does, and takes its title, description
 * and date from this file so the listing, the metadata and the sitemap cannot
 * disagree about them.
 *
 * `keyword` is the term the post targets, from the keyword map in
 * `docs/landing/content.md`. It is recorded so nobody writes a second post
 * against a term that already has one — the fastest way to have two of your own
 * pages competing for one query.
 *
 * **Posts are not per-market.** `/` and `/us` differ only in currency, and a
 * post about Excel formulas has no currency in it. Writing `/us/blog/...` would
 * duplicate the content that is supposed to earn the links, which is the one
 * thing that must not be split. Any figure inside a post that needs a currency
 * should use the `¤` placeholder and name both.
 */
export interface Post {
  slug: string;
  title: string;
  /** Meta description, and the summary on the listing page. */
  description: string;
  /** The keyword group from content.md's map that this post targets. */
  keyword: string;
  /** ISO date. Drives the sitemap's lastmod and the article's dateline. */
  published: string;
  /** Minutes, rounded. Stated because the posts are long and it sets expectations. */
  readingMinutes: number;
}

export const POSTS: readonly Post[] = [
  {
    slug: "payroll-variance-report-what-to-check",
    title: "Payroll variance report: what to check before you approve payroll",
    description:
      "A variance report tells you what changed. It does not tell you whether the register adds up — and those are different checks. The order to run them in, how to set a threshold that catches real money, and the variances that look wrong but are right.",
    keyword: "payroll variance report, compare payroll periods",
    published: "2026-10-31",
    readingMinutes: 12,
  },
  {
    slug: "compare-two-payroll-periods-in-excel",
    title: "How to compare two payroll periods in Excel, and a faster way",
    description:
      "A step-by-step method for diffing two payroll exports in Excel — matching employees, comparing every pay component, and finding the rows that moved. With the four mistakes that make the comparison wrong.",
    keyword: "payroll Excel, payroll spreadsheet",
    published: "2026-10-31",
    readingMinutes: 11,
  },
];

export function postBySlug(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/**
 * Written but not yet published, kept here so the plan is visible in the repo
 * rather than in a chat log.
 *
 * The order is the one the search results imply, which is **not** the order
 * `docs/landing/content.md` lists them in. Measured 2026-10-31:
 *
 * - `payroll Excel` — the first page above. The results for "how to compare two
 *   payroll periods in Excel" are entirely vendor help documentation (Nethris,
 *   Employment Hero, Asanify, SAP, Odoo, Tricentis) and government PDFs. Nobody
 *   has written the actual spreadsheet method: the searcher wants formulas and
 *   is given software menus. The clearest gap of the three, and the reason this
 *   post went first.
 * - `payroll variance report` — vendor help pages and glossary entries. Half the
 *   intent is navigational ("where is the variance report in my software"),
 *   which cannot be won and should not be chased; the other half is "what should
 *   I check before I approve", which nobody owns authoritatively.
 * - `payroll KPIs` — the most contested of the three by a distance: Netchex,
 *   Lano on several URLs, Oyster, Deel, Zoho, Parakar, OnTheClock, Unrubble,
 *   ZoomShift, HROne. Well-funded vendors with real domain authority, and one of
 *   them notes there is no standard KPI set, so there is no definitive list to
 *   take. Worth writing last, once the domain has some authority, and worth
 *   narrowing: "payroll KPIs for a 40-person company" is winnable where
 *   "payroll KPIs" is not.
 */
export const PLANNED: readonly { title: string; keyword: string; note: string }[] = [
  {
    title: "Payroll KPIs every business owner should track",
    keyword: "payroll KPIs, payroll analytics",
    note: "Most contested term of the three. Narrow it to the small and mid-sized owner and to KPIs derivable from one payroll file, which is what Clarivo actually computes — cost per employee, employer on-cost rate, overtime share of base, absence days. Avoid the generic ten-item list every competitor already ranks for.",
  },
];
