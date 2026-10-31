import type { Metadata } from "next";
import { Article } from "@/components/marketing/article";
import { SITE } from "@/components/marketing/content";
import { postBySlug } from "@/components/marketing/posts";

const post = postBySlug("payroll-variance-report-what-to-check")!;

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
 * Targets `payroll variance report` / `compare payroll periods`.
 *
 * Measured 2026-10-31: the results are vendor help documentation and glossary
 * entries. Half the intent behind the query is navigational — "where is the
 * variance report in my software" — which cannot be won and should not be
 * chased, because the answer genuinely is each vendor's own help page. The
 * other half is "what should I actually check before I approve", and nobody
 * owns it authoritatively.
 *
 * So the post is written against that second intent, and its spine is the
 * distinction none of the ranking pages draw: a variance report says what
 * *changed*, which is not the same question as whether the register *adds up*.
 * The threshold section is the part no competitor has — a percentage-only
 * tolerance lets real money through on a large payroll and flags everything on
 * a small one, which is the mistake Clarivo's own reconciliation gate was
 * rebuilt to fix.
 */
export default function Page() {
  return (
    <Article
      post={post}
      closing={
        <>
          Clarivo runs both halves of this on upload: it checks that the register adds up before it
          compares anything, then diffs every employee and every pay component against the previous
          period and names what drove each movement. A file whose own totals do not reconcile is
          refused rather than imported.
        </>
      }
    >
      <p>
        A payroll variance report compares the run you are about to approve against the last one and
        lists what moved. Every payroll system has one, and using it is the single best habit in
        payroll: almost every expensive error shows up as a number that changed when nothing should
        have changed.
      </p>
      <p>
        It also has a blind spot worth understanding before you rely on it. A variance report
        answers <strong>what changed</strong>. It does not answer{" "}
        <strong>whether this register is internally consistent</strong>. Those are different
        questions, a register can pass one and fail the other, and most review checklists only ever
        ask the first.
      </p>

      <h2>Run the consistency checks first, before you compare anything</h2>
      <p>
        Two sums define a correct register, and both are checkable without reference to any other
        period:
      </p>
      <ol>
        <li>
          <strong>The earnings add up to gross.</strong> Base, allowances, overtime, bonus,
          commission and every other earning line should sum to the gross column, per employee.
        </li>
        <li>
          <strong>Gross minus the deductions equals net.</strong> Income tax, social security, loan
          repayments, unpaid leave and the rest should take gross exactly to the net column, per
          employee.
        </li>
      </ol>
      <p>
        Then two more that need no arithmetic: no employee&rsquo;s net is above their gross, and no
        net is negative.
      </p>
      <p>
        Run these before the comparison, because a register that fails them produces variances that
        have nothing to do with the month. If an earning line is missing from gross this period, the
        variance report will faithfully show you a change in gross, and you will go looking for a
        pay rise that never happened.
      </p>
      <p>
        These checks also catch the error class a variance report structurally cannot. If one
        employee appears twice in the register and is paid twice, most comparisons match on
        employee ID, take the first row and silently ignore the second. The variance reads{" "}
        <strong>zero</strong>. Nothing changed, says the report, while the company paid someone
        twice. Counting the IDs and comparing that count to the number of unique IDs takes a second
        and is the only thing that finds it.
      </p>

      <h2>Then the period-over-period checks, in this order</h2>
      <p>
        Work from the whole register down to the individual, not the other way round. The totals
        tell you whether to be worried at all.
      </p>
      <h3>1. Headcount, against the register rather than against last month</h3>
      <p>
        Who joined, who left, and does that match what you were told. Two errors live here and both
        are expensive: somebody paid after their last working day, and a joiner paid a full period
        for part of one. Neither shows up as an unusual variance, because a leaver&rsquo;s pay going
        to zero and a joiner&rsquo;s arriving from zero both look exactly like what they are
        supposed to look like. You have to check them against the leaver and joiner list, not
        against the numbers.
      </p>
      <h3>2. Gross, net and employer cost at the total level</h3>
      <p>
        Three numbers. If all three moved by roughly the headcount change and nothing else, the run
        is probably quiet. If gross moved and net did not, or the other way round, something
        happened in the deductions and you want to know what before you approve.
      </p>
      <h3>3. Each pay component, not just the totals</h3>
      <p>
        This is the step that catches the most and gets skipped the most, because a net pay that did
        not move is persuasive. It should not be. An overtime payment that stopped and an allowance
        that started, at the same amount, net to nothing. The register reads unchanged and two
        things changed.
      </p>
      <p>
        Compare per component per employee. If your report only does totals, the component view is
        worth building once — there is a{" "}
        <a href="/blog/compare-two-payroll-periods-in-excel">
          spreadsheet method for exactly that
        </a>{" "}
        if you are doing it by hand.
      </p>
      <h3>4. The individuals the first three steps point at</h3>
      <p>
        Only now look at people. Sort by the size of the change in money, not in percentage: a 40%
        movement on a small allowance will outrank a five-figure movement on a senior salary, and
        the five-figure one is what you want to see first.
      </p>

      <h2>Setting the threshold: why a percentage alone is not enough</h2>
      <p>
        Most variance reports ask for a tolerance and most people enter a percentage. Five per cent,
        ten per cent. It is the obvious answer and it fails in both directions.
      </p>
      <p>
        <strong>On a large payroll, a percentage hides real money.</strong> Two per cent of a
        twenty-million annual payroll is four hundred thousand. A threshold set at two per cent will
        report that everything reconciles while four hundred thousand sits unexplained, and it will
        do so in a green tick, which is worse than no check at all because somebody now believes the
        register is clean.
      </p>
      <p>
        <strong>On a small payroll, a percentage flags everything.</strong> At forty employees, one
        person&rsquo;s overtime moves the departmental total by more than ten per cent routinely.
        Threshold reached, nothing wrong, and after three months of that the report is ignored —
        which is how a check dies.
      </p>
      <p>So use two thresholds, for two different jobs.</p>
      <ul>
        <li>
          <strong>For the two consistency sums above, the tolerance is the currency&rsquo;s smallest
          unit.</strong> Not a percentage at all. Earnings summing to gross is an identity: it
          either balances or the register is wrong. The only allowance needed is for rounding —
          one cent, or one fils in a three-decimal currency, or one yen where there is no minor
          unit at all. Anything larger than that is a real amount of money nobody can explain.
        </li>
        <li>
          <strong>For period-over-period movement, a percentage with an absolute floor.</strong> The
          percentage catches proportionate change; the floor catches the large movement that is
          small in proportion. Something like &ldquo;flag anything over ten per cent{" "}
          <em>or</em> over a thousand, whichever is reached first&rdquo;. Set both from your own
          register rather than from a default, and set them where the report flags a handful of rows
          rather than a page of them.
        </li>
      </ul>

      <h2>The variances that look wrong and are right</h2>
      <p>
        Four movements will set off any threshold, and all four are normal. Knowing them saves the
        time you would otherwise spend proving each one.
      </p>
      <ul>
        <li>
          <strong>A one-off in either period.</strong> An annual bonus, a thirteenth-month payment,
          a settlement. The month it is paid, gross jumps; the month after, it falls by the same
          amount and the variance report reports a catastrophe. Check whether the one-off is in the
          previous period, the current one, or neither, before reading anything else.
        </li>
        <li>
          <strong>A pay review.</strong> Many small increases across many people, each individually
          below the threshold, adding to a total movement well above it. The total looks alarming
          and no single row explains it. That pattern — large total, no large individual — is
          usually a review rather than an error.
        </li>
        <li>
          <strong>A calendar effect.</strong> Weekly and bi-weekly payrolls have periods with an
          extra pay date. Hourly pay has months with more working days. Neither is a change in
          anybody&rsquo;s pay.
        </li>
        <li>
          <strong>Retro pay.</strong> A backdated increase pays the arrears in one period, so the
          same employee shows a large rise followed by an apparent fall. The fall is the arrears
          ending, not a pay cut.
        </li>
      </ul>

      <h2>The variances that look right and are wrong</h2>
      <p>These are the reason to do the review at all.</p>
      <ul>
        <li>
          <strong>Zero variance on a duplicated employee.</strong> Covered above, and the only one
          on this list that a comparison can never find by itself.
        </li>
        <li>
          <strong>Net unchanged, components moved.</strong> Two offsetting changes. Only a
          per-component comparison sees it.
        </li>
        <li>
          <strong>A leaver still on the register at full pay.</strong> Looks like no change, because
          it is no change. That is the problem.
        </li>
        <li>
          <strong>An unmapped or renamed column.</strong> If a column was added or renamed in the
          export this period, a comparison keyed on column names treats it as a new line starting
          from zero and the old one stopping. Two large variances, both artefacts. Check the column
          list matches before trusting the figures.
        </li>
        <li>
          <strong>A stale export.</strong> If a correction was made after the file was produced, the
          comparison is arithmetically perfect and about a register that no longer exists. Check the
          export timestamp against the last change in the system. This one survives every other
          check on the list.
        </li>
      </ul>

      <h2>What to write down</h2>
      <p>
        A variance review is only worth the time if the reasons survive it. For each flagged row,
        record the amount, the cause and who confirmed it — one line is enough. Two reasons:
      </p>
      <ul>
        <li>
          Next period&rsquo;s review starts with this period&rsquo;s explanations, and most of them
          recur.
        </li>
        <li>
          When somebody asks in six months why a figure moved, the answer exists. Reconstructing it
          from a payroll system after the fact takes far longer than writing it down took.
        </li>
      </ul>
      <p>
        If your payroll system locks the run once it is approved — many do — then the review is the
        last point at which a correction is cheap. That is worth knowing before you click it, rather
        than after.
      </p>
    </Article>
  );
}
