"use client";

import type { EmployeeFileResult } from "@saas/payroll-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/components/annual/annual-utils";
import {
  AGGREGATE_GAP_NOTICE,
  tieOutCauseLabel,
} from "@/components/employee-file/employee-file-text";
import type { PeriodRow } from "@/components/employee-file/employee-chart-data";

/**
 * The reconciliation strip (step E5, spec 4.3 and 8).
 *
 * The four identity checks, per slot, with the slot, the expected figure, the
 * register's figure and the difference — on **every** slot in range, not only
 * the latest. `samples/payroll_july_2026.csv` breaches the earnings identity
 * for three employees (300.00, 20.00 and 200.00, 520.00 in all), and Clarivo
 * ingested it, dashboarded it and wrote a narrative about it without a word.
 * This is where that becomes visible per person.
 *
 * Three further tie-outs are **reported rather than reconciled away**:
 *
 *   - **R3** — the employee's slot gross beside `payroll_periods.total_gross`,
 *     with the cause when the two cannot agree.
 *   - **R5** — whether the admin supplied a control total at all. "Not
 *     supplied" is a third answer, never "agreed": Clarivo's own totals can
 *     only ever agree with themselves.
 *   - **R6** — `period_component_totals` keeps one row per employee per period
 *     while this file sums every row, so where duplicates exist the file and
 *     the annual dashboard **differ on purpose**. The gap is named, with which
 *     figure ties to the register.
 */
export function EmployeeReconciliation({
  file,
  rows,
}: {
  file: EmployeeFileResult;
  rows: readonly PeriodRow[];
}) {
  const breaches = file.flags.filter((flag) => flag.source === "reconciliation");
  const earnBalSlots = rows.filter((row) => row.earnBal !== null && row.earnBal !== 0);
  const { currency } = file;
  /**
   * R5 counts the two control totals **separately**.
   *
   * `grossSupplied || netSupplied` meant "Supplied for 4 of 4 periods" could be
   * true when the net total was never supplied for any of them — and the net
   * identity is the one that catches a deduction mapped to the wrong side. A
   * half-supplied check is not a supplied check.
   */
  const controlTotals = file.tieOuts.controlTotals;
  const grossSupplied = controlTotals.filter((entry) => entry.grossSupplied).length;
  const netSupplied = controlTotals.filter((entry) => entry.netSupplied).length;
  const r3Mismatch = file.tieOuts.perSlot.filter((entry) => entry.cause !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Reconciliation</CardTitle>
        <CardDescription>
          Four identities, checked on every period in range at the currency&apos;s smallest
          unit — not as a percentage, because 2% of a 20M payroll hides 400,000.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {breaches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No identity breach in the periods uploaded for this range. That is a statement about
            the periods that are here — see the coverage line above for the ones that are not.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right">Components imply</TableHead>
                  <TableHead className="text-right">Register says</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breaches.map((flag, index) => (
                  <TableRow key={`${flag.type}-${flag.slotIndex}-${index}`}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {flag.slotLabel ?? "In range"}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col gap-0.5">
                        <Badge
                          variant={flag.severity === "critical" ? "destructive" : "outline"}
                          className="w-fit font-normal"
                        >
                          {flag.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{flag.description}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {flag.expected === null ? "—" : formatMoney(flag.expected, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {flag.actual === null ? "—" : formatMoney(flag.actual, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {flag.difference === null ? "—" : formatMoney(flag.difference, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* `earnBal` as its own labelled line whenever non-zero. Folding it
            into "other earnings" would make unmapped money look categorised —
            on samples/2025 it is E0002's 3,604.74 of reimbursements. */}
        {earnBalSlots.length > 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <p className="font-medium">Earnings not covered by a mapped component</p>
            <p className="mt-0.5 text-muted-foreground">
              Gross minus everything the classifier could place. It is real money in the
              register, so it is shown rather than dropped from &ldquo;total
              earnings&rdquo;.
            </p>
            <ul className="mt-2 space-y-0.5">
              {earnBalSlots.map((row) => (
                <li key={row.index} className="tabular-nums">
                  {row.fullLabel}: {formatMoney(row.earnBal ?? 0, currency)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Against the period total (R3)</p>
            {r3Mismatch.length === 0 ? (
              <p className="mt-0.5 text-muted-foreground">
                Each paid period here has one row for this employee and one upload, so their
                share of the period total needs no explanation.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {r3Mismatch.map((entry) => (
                  <li key={entry.slotIndex}>
                    <span className="text-foreground">{entry.slotLabel}:</span>{" "}
                    {formatMoney(entry.employeeGross, currency)} of{" "}
                    {entry.periodTotalGross === null
                      ? "an unknown period total"
                      : formatMoney(entry.periodTotalGross, currency)}
                    . {tieOutCauseLabel(entry.cause)}.
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium">Control totals (R5)</p>
            <p className="mt-0.5 text-muted-foreground">
              {controlTotals.length === 0
                ? "No paid period in range to check."
                : grossSupplied === 0 && netSupplied === 0
                  ? "Not supplied for any period in range. Without one, the register was never checked against anything outside Clarivo — which is not the same as agreeing."
                  : `Gross supplied for ${grossSupplied} of ${controlTotals.length} periods in range, net for ${netSupplied} of ${controlTotals.length}. The rest were never checked against anything outside Clarivo.`}
            </p>
          </div>
        </div>

        {/* R6 is not optional: where duplicates exist this file and the annual
            dashboard disagree by design, and the next person to see it must
            find the decision rather than "fix" one side. */}
        {file.tieOuts.aggregateGapCause === "duplicate_rows" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">
              This file and the annual dashboard will differ for this employee
            </p>
            <p className="mt-0.5 text-muted-foreground">{AGGREGATE_GAP_NOTICE}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Anomaly thresholds came from{" "}
          {file.tolerancesSource === "company"
            ? "this company's settings"
            : "the product defaults"}
          . A 20% net threshold is a company policy, not a law of payroll.
        </p>
      </CardContent>
    </Card>
  );
}
