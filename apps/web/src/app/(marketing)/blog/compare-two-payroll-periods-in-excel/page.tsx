import type { Metadata } from "next";
import { Article } from "@/components/marketing/article";
import { SITE } from "@/components/marketing/content";
import { postBySlug } from "@/components/marketing/posts";

const post = postBySlug("compare-two-payroll-periods-in-excel")!;

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
 * Targets `payroll Excel` / `payroll spreadsheet` from the keyword map in
 * `docs/landing/content.md`.
 *
 * Why this post first, measured on 2026-10-31: the results for "how to compare
 * two payroll periods in Excel" are entirely vendor help documentation —
 * Nethris, Employment Hero, Asanify, SAP, Odoo, Tricentis — plus government
 * PDFs. Every one of them answers "click here in our software". Nobody has
 * written the spreadsheet method the searcher is actually asking for. So this
 * post gives the formulas, and earns the right to mention Clarivo at the end
 * by being useful to somebody who never buys it.
 *
 * The formulas are written for a reader who has two exports and Excel, and are
 * deliberately the plain ones: `XLOOKUP` with a `VLOOKUP` fallback, because a
 * payroll admin on an older Excel is exactly the reader who still does this by
 * hand.
 */
export default function Page() {
  return (
    <Article
      post={post}
      closing={
        <>
          Everything above is a comparison Clarivo does on upload: it matches employees by ID,
          diffs every pay component, flags what moved and refuses a file whose own totals do not
          add up. It never writes to your payroll — the file you export stays the file you
          exported.
        </>
      }
    >
      <p>
        Two payroll exports, two months, a few hundred rows each. The question is simple: what
        changed, and is any of it a mistake. Excel can answer it, and the method below is the one
        that survives contact with a real register — the awkward parts are matching employees who
        are not in both files, and comparing every pay component rather than just the net.
      </p>
      <p>
        It takes about twenty minutes the first time. At the end there is a note on the four
        mistakes that make the whole comparison wrong, which matter more than the formulas.
      </p>

      <h2>Before you start: get both files into the same shape</h2>
      <p>
        Export both periods from your payroll system as Excel or CSV. You need, at minimum, an
        employee identifier, gross pay and net pay. If the export also gives you the pay components
        — base, allowances, overtime, bonus, each deduction — take them, because that is where the
        explanation of any change lives.
      </p>
      <p>Then, in one workbook:</p>
      <ol>
        <li>
          Put the earlier period on a sheet called <code>Previous</code> and the later one on{" "}
          <code>Current</code>, with the header row on row 1 in both.
        </li>
        <li>
          Check the two sheets have the same columns in the same order. Payroll exports change
          between runs more often than you would expect — a new allowance appears, a column is
          renamed. If they differ, line them up now rather than discovering it in the numbers.
        </li>
        <li>
          Make sure the employee identifier is text, not a number. An ID like{" "}
          <code>007</code> becomes <code>7</code> the moment Excel decides it is numeric, and then
          it matches nothing. Select the column, then Data → Text to Columns → Finish, with the
          column format set to Text.
        </li>
      </ol>
      <p>
        One more thing worth doing before any formula: check each file against itself. Does the sum
        of the pay components equal the gross column? Does gross minus the deductions equal the net
        column? If not, the file is already inconsistent and comparing it to another file will
        produce differences that are nothing to do with the month.
      </p>

      <h2>Step 1: build one list of every employee in either period</h2>
      <p>
        This is the step most people skip, and it is why their comparison misses the two most
        expensive errors — someone who left and was paid anyway, and someone who joined and was
        not.
      </p>
      <p>
        Copy the employee ID column from <code>Previous</code> into a new sheet called{" "}
        <code>Compare</code>, in column A under a header. Then paste the ID column from{" "}
        <code>Current</code> directly beneath it. Select column A, then Data → Remove Duplicates.
      </p>
      <p>
        You now have every person who was paid in either month, exactly once. The row count is
        itself informative: if it is larger than either period, the roster moved.
      </p>

      <h2>Step 2: pull both periods&rsquo; figures against that list</h2>
      <p>
        With the IDs in column A from row 2 down, put the previous and current net pay side by
        side. If your Excel has <code>XLOOKUP</code>:
      </p>
      <pre>
        <code>{`B2:  =XLOOKUP($A2, Previous!$A:$A, Previous!$D:$D, "not in period")
C2:  =XLOOKUP($A2, Current!$A:$A,  Current!$D:$D,  "not in period")`}</code>
      </pre>
      <p>
        Replace <code>$D:$D</code> with whichever column holds net pay on each sheet. On an older
        Excel without <code>XLOOKUP</code>, the equivalent is:
      </p>
      <pre>
        <code>{`B2:  =IFERROR(VLOOKUP($A2, Previous!$A:$Z, 4, FALSE), "not in period")`}</code>
      </pre>
      <p>
        where <code>4</code> is the position of the net pay column counting from the ID column. The
        literal text <code>&quot;not in period&quot;</code> matters: it is doing real work. If you
        return <code>0</code> instead, a joiner looks like somebody whose pay fell to zero, and a
        leaver looks the same. Those are different events and you want to see which is which.
      </p>

      <h2>Step 3: the difference, and the percentage</h2>
      <p>
        Put the change in column D and the percentage in column E. Both have to cope with the text
        in B and C:
      </p>
      <pre>
        <code>{`D2:  =IF(OR(NOT(ISNUMBER($B2)), NOT(ISNUMBER($C2))), "", $C2-$B2)
E2:  =IF(OR(NOT(ISNUMBER($B2)), NOT(ISNUMBER($C2)), $B2=0), "", ($C2-$B2)/$B2)`}</code>
      </pre>
      <p>
        Format column E as a percentage. The <code>$B2=0</code> guard stops the division error on
        anybody whose previous net was zero — unpaid leave for a whole period, usually.
      </p>
      <p>
        Now sort column D largest to smallest and read the top and the bottom. Those are the rows
        worth a human looking at. Sorting by the percentage instead will put a 3.00 change on a
        small figure above a 4,000 change on a large one, which is rarely what you want first.
      </p>

      <h2>Step 4: do the same per pay component, because net hides things</h2>
      <p>
        A net pay that did not move is not evidence that nothing happened. An overtime payment that
        stopped and an allowance that started, at the same amount, net to nothing. The register
        looks unchanged and two things changed.
      </p>
      <p>
        So repeat columns B to D for each component you exported. Rather than copying the formula
        by hand per column, put the component column letters across row 1 and use a two-dimensional
        lookup. If the headers on <code>Current</code> match the headers you have typed:
      </p>
      <pre>
        <code>{`=XLOOKUP($A2, Current!$A:$A, INDEX(Current!$A:$Z, 0, MATCH(F$1, Current!$1:$1, 0)), "")`}</code>
      </pre>
      <p>
        That reads: find this employee, and give me the column whose header matches the one at the
        top of this column. Fill it right across every component, then build the matching block for{" "}
        <code>Previous</code> and subtract one from the other.
      </p>
      <p>
        You now have a grid of every employee against every component, showing what moved. This is
        the comparison a payroll check actually needs.
      </p>

      <h2>Step 5: flag the rows that need a reason</h2>
      <p>
        Add a column that says why a row is worth attention, so the list sorts itself rather than
        asking you to re-read it:
      </p>
      <pre>
        <code>{`=IFS(
  NOT(ISNUMBER($B2)), "New this period",
  NOT(ISNUMBER($C2)), "Not paid this period",
  $C2<0,              "Negative net",
  ABS($E2)>=0.2,      "Net moved 20% or more",
  TRUE,               ""
)`}</code>
      </pre>
      <p>
        Twenty per cent is a starting point, not a rule — set it where your own payroll normally
        sits. A register with commission on it moves far more than one without, and a threshold
        that flags half the rows is the same as no threshold at all.
      </p>

      <h2>The four mistakes that make this comparison wrong</h2>
      <p>
        These matter more than the formulas, because each one produces a comparison that looks
        finished and is not.
      </p>
      <h3>Matching on name instead of employee ID</h3>
      <p>
        Names change — marriage, a corrected spelling, a middle initial that appears in one export
        and not the other. Two people genuinely share a name more often than people expect. Match
        on the identifier your payroll system assigns, always, and if the export does not include
        one, fix the export rather than working around it.
      </p>
      <h3>Treating a missing employee as a zero</h3>
      <p>
        Covered above, and worth repeating because it is the default behaviour of every lookup
        formula written without a fallback. A joiner and a leaver are the two changes most likely to
        cost real money — someone paid after their last day, someone paid a full period for a
        fortnight&rsquo;s work — and both are invisible if the formula quietly returns zero.
      </p>
      <h3>Comparing the wrong file version</h3>
      <p>
        If a correction was made after the export, you are comparing a register that no longer
        exists. Check the export timestamp against the last change in the payroll system before you
        start. This survives every other check on the list, because the arithmetic is all perfectly
        correct — just about the wrong file.
      </p>
      <h3>Duplicated employee rows</h3>
      <p>
        If one person appears twice in an export, a lookup returns the first row and silently
        ignores the second. Someone paid twice then reads as unchanged. Before comparing, count the
        IDs on each sheet: <code>=ROWS(A2:A500)</code> against{" "}
        <code>=SUMPRODUCT(1/COUNTIF(A2:A500,A2:A500))</code>. If the two numbers differ, there are
        duplicates to resolve first.
      </p>

      <h2>When the spreadsheet stops being the right tool</h2>
      <p>
        The method above works. It is also rebuilt from scratch every period, and that is the
        actual problem rather than the formulas: the comparison is only as reliable as the half
        hour somebody had to spend on it this month. The failure mode is not a wrong formula, it is
        a month where nobody had the half hour.
      </p>
      <p>
        If your register has a stable set of columns and you run this every period, the work is
        worth automating — either with a saved workbook and a macro, or with something that reads
        the export directly and keeps the column mapping between runs.
      </p>
    </Article>
  );
}
