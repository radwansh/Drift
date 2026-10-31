import type { Metadata } from "next";
import { Article } from "@/components/marketing/article";
import { SITE } from "@/components/marketing/content";
import { postBySlug } from "@/components/marketing/posts";

const post = postBySlug("payroll-kpis-small-business")!;

export const metadata: Metadata = {
  title: `${post.title} | ${SITE.name}`,
  description: post.description,
  alternates: { canonical: `${SITE.url}/blog/${post.slug}` },
  openGraph: {
    type: "article",
    url: `${SITE.url}/blog/${post.slug}`,
    siteName: SITE.name,
    title: post.title,
    description: post.description,
  },
};

/**
 * Targets `payroll KPIs` / `payroll analytics` — the most contested of the three
 * terms by a distance, and written last for that reason.
 *
 * Measured 2026-10-31: Netchex, Lano on several URLs, Oyster, Deel, Zoho,
 * Parakar, OnTheClock, Unrubble, ZoomShift and HROne all rank, all with a
 * seven-to-ten item list, and one of them observes that there is no standard
 * payroll KPI set. So there is no definitive list to take and no gap to fill by
 * listing harder.
 *
 * The angle instead: every one of those lists is written for a payroll
 * department, and half the metrics on them — cycle time, cost per payslip,
 * payroll team productivity — are meaningless at forty employees where one
 * person does payroll in an afternoon. And most of the rest silently need a
 * system the reader does not have. So this post is organised by **what you can
 * compute from the file you already export**, which is the question an owner
 * actually has and which none of the ten answers.
 *
 * Honesty constraint, checked against `launch.ts` before writing the closing:
 * `annualSalariesLive` is **off**, so "Total employer cost", "Cost per employee
 * and headcount" and "Taxes and social security" are not on the site today.
 * Several KPIs this post recommends are therefore ones Clarivo does not yet
 * display, and the closing says so rather than implying otherwise.
 */
export default function Page() {
  return (
    <Article
      post={post}
      closing={
        <>
          Clarivo today shows the period-over-period half of this: what moved since the last run,
          per pay component and per department, and which employees are behind each movement. The
          annual view — employer cost, cost per head, the statutory total — is being finished and is
          not on the site yet. The comparison works from the file you already export.
        </>
      }
    >
      <p>
        Search for payroll KPIs and you will find the same list ten times: payroll accuracy rate,
        cost per payslip, payroll cycle time, time to run payroll, payroll as a percentage of
        revenue. It is a good list. It is also written for somebody who runs a payroll department.
      </p>
      <p>
        If you employ forty people and one person does payroll in an afternoon, measuring their
        cycle time is not a management insight. And most of the remaining metrics quietly assume a
        system you may not have — an HRIS, time and attendance, revenue joined to payroll by period.
      </p>
      <p>
        So this list is organised by a more useful question: <strong>what can you work out from the
        payroll file you already export?</strong> Start there, add the rest when you have the data,
        and skip the ones that only matter at scale.
      </p>

      <h2>The ones you can compute from one payroll export</h2>
      <p>
        Every figure below comes from a single payroll register. No other system, no integration.
        If your export includes employer contributions, you can calculate all of them today.
      </p>

      <h3>Total employer cost</h3>
      <p>
        <code>gross pay + employer contributions</code>
      </p>
      <p>
        Not the salary bill — the actual cost. Employer social security, pension contributions and
        any employer-paid insurance sit on top of gross and never appear in it. Owners consistently
        underestimate this number because the figure they have in mind is the one in the employment
        contract.
      </p>
      <p>
        Track it monthly. It is the number that belongs in a budget, and the one to use when
        deciding whether you can afford a hire.
      </p>

      <h3>Employer on-cost rate</h3>
      <p>
        <code>employer contributions ÷ gross pay</code>, as a percentage
      </p>
      <p>
        The multiplier on every salary decision. If it is 22%, then a 50,000 salary costs 61,000 and
        a 3,000 raise costs 3,660. Knowing the single number means you can price a decision in your
        head instead of asking someone to work it out.
      </p>
      <p>
        It should be stable. If it moves more than a point or two between periods without a rule
        change, something is misclassified — most often an employer-paid insurance sitting in the
        wrong column, which also makes your statutory total wrong.
      </p>

      <h3>Cost per employee, with the caveat that matters</h3>
      <p>
        <code>total employer cost ÷ headcount</code>
      </p>
      <p>
        Useful, and the easiest KPI on this list to mislead yourself with. Two problems:
      </p>
      <ul>
        <li>
          <strong>Part-timers.</strong> A half-timer counted as one head drags the average down and
          the figure stops being comparable to anything. Divide by full-time equivalent — summing
          each person&rsquo;s contracted fraction — rather than by the number of people. If you
          cannot get FTE out of your export, at least know how many part-timers you have before you
          read the number.
        </li>
        <li>
          <strong>It is a mean.</strong> At forty employees, three senior salaries can be a third of
          the payroll, and the mean then describes nobody. Look at the median alongside it. If the
          two are far apart, the average is the less useful of the two.
        </li>
      </ul>

      <h3>Variable pay share</h3>
      <p>
        <code>(bonus + commission + overtime) ÷ gross pay</code>
      </p>
      <p>
        The share of your payroll that can flex in a bad quarter. This is the most strategic number
        on the list and the one almost no KPI article includes. A payroll that is 95% fixed gives you
        almost no room if revenue drops; one that is 70% fixed gives you a lot. It also tells you
        what a hiring freeze would and would not achieve.
      </p>

      <h3>Overtime as a share of base pay</h3>
      <p>
        <code>overtime pay ÷ base pay</code>
      </p>
      <p>
        Separate from the line above, because overtime answers a different question: whether you are
        understaffed or badly scheduled. Persistent overtime in one department is usually cheaper to
        fix with a hire than to keep paying, and the comparison is straightforward once you know the
        on-cost rate.
      </p>
      <p>
        Watch it per department rather than for the company. A company-wide figure of 4% can be one
        team at 30%.
      </p>

      <h3>Headcount, joiners and leavers</h3>
      <p>
        <code>headcount</code>, <code>joiners</code>, <code>leavers</code>, and{" "}
        <code>leavers ÷ average headcount</code> for turnover
      </p>
      <p>
        Three counts and a ratio, all of which your register gives you if it has a stable employee
        identifier. Turnover is worth tracking at any size because replacing someone costs
        considerably more than the gap in the payroll suggests, and because the trend matters more
        than the level.
      </p>

      <h3>Absence days per employee</h3>
      <p>
        <code>total absence days ÷ headcount</code>
      </p>
      <p>
        Only if your register carries absence, which many do. Worth having because a rise usually
        precedes a resignation, and because it is one of the few payroll figures that is about people
        rather than money.
      </p>

      <h2>The ones that need a second source</h2>
      <p>
        These are on every standard list, they are genuinely useful, and each needs something the
        payroll file does not contain. Add them when you have the data, and do not feel behind for
        not having them yet.
      </p>
      <table>
        <thead>
          <tr>
            <th>KPI</th>
            <th>Also needs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Payroll as a share of revenue</td>
            <td>Revenue by the same period as the payroll run</td>
          </tr>
          <tr>
            <td>Revenue per employee</td>
            <td>The same, plus a headcount definition you keep consistent</td>
          </tr>
          <tr>
            <td>Payroll accuracy rate</td>
            <td>A record of corrections, which means logging them when they happen</td>
          </tr>
          <tr>
            <td>Cost of a payroll error</td>
            <td>The same log, with the time spent fixing each one</td>
          </tr>
          <tr>
            <td>Overtime against hours worked</td>
            <td>Time and attendance, not just the paid amount</td>
          </tr>
        </tbody>
      </table>
      <p>
        Payroll as a share of revenue is the one worth building first. It is the only figure here
        that tells you whether your payroll is growing faster than your business, which is the
        question behind most of the others.
      </p>

      <h2>The ones not worth tracking at this size</h2>
      <p>
        Standard on the published lists, and reasonable there, because those lists are written for a
        payroll function with staff and a budget of its own.
      </p>
      <ul>
        <li>
          <strong>Cost per payslip.</strong> Meaningful when payroll is a department with a cost
          base to optimise. At forty employees it is your software subscription divided by forty.
        </li>
        <li>
          <strong>Payroll cycle time.</strong> The interval from period close to submission. Worth
          measuring when it runs to days across several teams; not when it is one afternoon.
        </li>
        <li>
          <strong>Payroll team productivity.</strong> Payslips per administrator. There is one
          administrator.
        </li>
        <li>
          <strong>Self-service adoption.</strong> A metric about a portal rollout, not about
          payroll.
        </li>
      </ul>
      <p>
        Dropping these is not lowering your standards. A KPI nobody acts on costs attention and
        returns nothing, and four well-chosen numbers reviewed every month beat twelve reviewed
        never.
      </p>

      <h2>Two things that will make all of it wrong</h2>
      <h3>One-off payments, if you do not separate them</h3>
      <p>
        The month the annual bonus is paid, every ratio on this page moves: variable pay share
        jumps, cost per employee jumps, the on-cost rate shifts. None of it is a change in your
        payroll. Worse, if you forecast from that month you will carry a bonus forward into every
        remaining period and budget for payments nobody has decided to make.
      </p>
      <p>
        This is the same distortion that makes a{" "}
        <a href="/blog/payroll-variance-report-what-to-check">variance review</a> look alarming in a
        bonus month. So hold the recurring and the one-off apart. A bonus belongs in the period it was paid and
        nowhere else. Any trend you read across periods should be read on the recurring part.
      </p>
      <h3>Comparing against the wrong thing</h3>
      <p>
        Industry benchmarks for payroll ratios are mostly unusable at a small size: they are built
        from larger samples in other countries with different statutory costs, and an on-cost rate
        is set largely by the jurisdiction you employ in. A 22% rate is not better or worse than a
        35% rate; they are different countries.
      </p>
      <p>
        Compare against yourself. Your own figure last period, the same period last year, and
        between your own departments. Those three comparisons answer nearly every question an owner
        has, and all three come from data you already own.
      </p>

      <h2>Where to start, if you track nothing today</h2>
      <p>Four numbers, monthly, from the file you already export:</p>
      <ol>
        <li>
          <strong>Total employer cost</strong> — what your team actually costs.
        </li>
        <li>
          <strong>Employer on-cost rate</strong> — so you can price a hire or a raise yourself.
        </li>
        <li>
          <strong>Variable pay share</strong> — how much of it could flex if it had to.
        </li>
        <li>
          <strong>Headcount with joiners and leavers</strong> — because every figure above is per
          head, and a figure per head is meaningless if the roster moved and you did not notice.
        </li>
      </ol>
      <p>
        Add payroll as a share of revenue when you can join the two. That is five numbers, and five
        numbers you look at every month are worth more than any list of twelve.
      </p>
    </Article>
  );
}
