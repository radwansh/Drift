"use client";

import type { EmployeeFileResult } from "@saas/payroll-core";
import { Badge, Notice, Panel, SeverityBadge } from "@/components/cv";
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
 * The reconciliation strip (step E5, spec 4.3 and 8), on Ink & Signal (canvas
 * board "Employee File: one person").
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
 *     only ever agree with themselves. It is the reason this panel's result
 *     vocabulary has three words and not two.
 *   - **R6** — `period_component_totals` keeps one row per employee per period
 *     while this file sums every row, so where duplicates exist the file and
 *     the annual dashboard **differ on purpose**. The gap is named, with which
 *     figure ties to the register.
 *
 * The **difference column is not a `<Variance>`**. Rust and cobalt mean a
 * period-over-period movement in this product; a reconciliation gap is not a
 * change, so it stays a plain figure in `cv-num` and the verdict carries the
 * colour instead.
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
  const noControlTotal = controlTotals.length > 0 && grossSupplied === 0 && netSupplied === 0;
  const r3Mismatch = file.tieOuts.perSlot.filter((entry) => entry.cause !== null);

  /**
   * The header badge counts **periods**, not checks.
   *
   * A paid slot with no reconciliation breach tied out on all four identities;
   * one with a breach did not. The tone is driven by `breaches.length` rather
   * than by the count, because a breach the engine could not attribute to a
   * slot (a mixed-sign column is computed across the whole range) has no slot
   * index to subtract — counting alone could then read "4 of 4" beside a real
   * breach.
   */
  const paidRows = rows.filter((row) => row.kind === "actual" || row.kind === "duplicate");
  const breachedSlots = new Set(
    breaches.map((flag) => flag.slotIndex).filter((index): index is number => index !== null),
  );
  const tiedOut = paidRows.filter((row) => !breachedSlots.has(row.index)).length;

  return (
    <Panel
      headingId="employee-reconciliation-h"
      title="Reconciliation"
      description="Four identities, checked on every period in range at the currency's smallest unit — not as a percentage, because 2% of a 20M payroll hides 400,000."
      actions={
        paidRows.length > 0 ? (
          <Badge
            tone={breaches.length === 0 ? "success" : "warning"}
            icon={breaches.length === 0 ? "check" : "alert"}
          >
            {tiedOut} of {paidRows.length} periods tie out
          </Badge>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {breaches.length === 0 ? (
          <p className="m-0 text-sm leading-5 text-cv-ink-muted">
            No identity breach in the periods uploaded for this range. That is a statement about the
            periods that are here — see the coverage line above for the ones that are not.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-cv-lg border border-cv-line">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Check</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Components imply</TableHead>
                  <TableHead className="text-right">Register says</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breaches.map((flag, index) => (
                  <TableRow key={`${flag.type}-${flag.slotIndex}-${index}`}>
                    <TableCell className="text-cv-ink">{flag.description}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {flag.slotLabel ?? "In range"}
                    </TableCell>
                    <TableCell className="cv-num">
                      {flag.expected === null ? (
                        <span className="text-cv-ink-subtle">—</span>
                      ) : (
                        formatMoney(flag.expected, currency)
                      )}
                    </TableCell>
                    <TableCell className="cv-num">
                      {flag.actual === null ? (
                        <span className="text-cv-ink-subtle">—</span>
                      ) : (
                        formatMoney(flag.actual, currency)
                      )}
                    </TableCell>
                    <TableCell className="cv-num">
                      {flag.difference === null ? (
                        <span className="text-cv-ink-subtle">—</span>
                      ) : (
                        formatMoney(flag.difference, currency)
                      )}
                    </TableCell>
                    <TableCell>
                      {/* "Off by …" is the verdict with a figure behind it. A
                          breach the engine reports without one — a mixed-sign
                          column, which is about a column rather than an amount
                          — gets its severity instead, never a made-up zero. */}
                      {flag.difference === null ? (
                        <SeverityBadge severity={flag.severity} />
                      ) : (
                        <Badge
                          tone={flag.severity === "critical" ? "danger" : "warning"}
                          icon={flag.severity === "critical" ? "x-circle" : "alert"}
                        >
                          Off by {formatMoney(Math.abs(flag.difference), currency)}
                        </Badge>
                      )}
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
          <div className="rounded-cv-lg border border-cv-line bg-cv-surface-sunken p-4 text-sm leading-5">
            <p className="m-0 font-semibold text-cv-ink">
              Earnings not covered by a mapped component
            </p>
            <p className="m-0 mt-0.5 text-cv-ink-muted">
              Gross minus everything the classifier could place. It is real money in the register,
              so it is shown rather than dropped from &ldquo;total earnings&rdquo;.
            </p>
            <ul className="m-0 mt-2 list-none space-y-0.5 p-0">
              {earnBalSlots.map((row) => (
                <li key={row.index} className="text-cv-ink">
                  {row.fullLabel}:{" "}
                  <span className="cv-num">{formatMoney(row.earnBal ?? 0, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 text-sm leading-5 sm:grid-cols-2">
          <div>
            <p className="m-0 font-semibold text-cv-ink">Against the period total (R3)</p>
            {r3Mismatch.length === 0 ? (
              <p className="m-0 mt-0.5 text-cv-ink-muted">
                Each paid period here has one row for this employee and one upload, so their share
                of the period total needs no explanation.
              </p>
            ) : (
              <ul className="m-0 mt-1 list-none space-y-1 p-0 text-cv-ink-muted">
                {r3Mismatch.map((entry) => (
                  <li key={entry.slotIndex}>
                    <span className="text-cv-ink">{entry.slotLabel}:</span>{" "}
                    <span className="cv-num">{formatMoney(entry.employeeGross, currency)}</span> of{" "}
                    {entry.periodTotalGross === null ? (
                      "an unknown period total"
                    ) : (
                      <span className="cv-num">
                        {formatMoney(entry.periodTotalGross, currency)}
                      </span>
                    )}
                    . {tieOutCauseLabel(entry.cause)}.
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 font-semibold text-cv-ink">Control totals (R5)</p>
              {/* The third answer, with its own word. "Not supplied" is never
                  shown in a tone that reads as agreement. */}
              {noControlTotal && <Badge tone="neutral">Not supplied</Badge>}
            </div>
            <p className="m-0 mt-0.5 text-cv-ink-muted">
              {controlTotals.length === 0
                ? "No paid period in range to check."
                : noControlTotal
                  ? "Not supplied for any period in range. Without one, the register was never checked against anything outside Clarivo — which is not the same as agreeing."
                  : `Gross supplied for ${grossSupplied} of ${controlTotals.length} periods in range, net for ${netSupplied} of ${controlTotals.length}. The rest were never checked against anything outside Clarivo.`}
            </p>
          </div>
        </div>

        {/* R6 is not optional: where duplicates exist this file and the annual
            dashboard disagree by design, and the next person to see it must
            find the decision rather than "fix" one side. */}
        {file.tieOuts.aggregateGapCause === "duplicate_rows" && (
          <Notice
            tone="warning"
            title="This file and the annual dashboard will differ for this employee"
          >
            {AGGREGATE_GAP_NOTICE}
          </Notice>
        )}

        <p className="m-0 text-xs leading-4 text-cv-ink-subtle">
          Anomaly thresholds came from{" "}
          {file.tolerancesSource === "company" ? "this company's settings" : "the product defaults"}
          . A 20% net threshold is a company policy, not a law of payroll.
        </p>
      </div>
    </Panel>
  );
}
