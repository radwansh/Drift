"use client";

import type { ComparisonOutput } from "@saas/payroll-core";
import { SEVERITY_ORDER, SeverityBadge, Variance } from "@/components/cv";
import { formatComponentName, formatCurrency } from "@/lib/utils";

/**
 * One employee's components, opened from a row of the comparison table (canvas
 * board "Detailed View", the expanded row).
 *
 * Three things about the rebuild.
 *
 * **Change is one column, not two.** It was "Absolute Δ" and "% Δ", each
 * coloured green or red on its own, so a single movement was painted twice in
 * colours that read as good and bad. `<Variance>` carries the amount and the
 * percentage together with one arrow, one sign and one delta colour — rust up,
 * cobalt down, grey for no change — and speaks the direction to a screen
 * reader. Every amount still goes through `formatCurrency`, so the figures are
 * `USD 1,234.56` and the sign comes from the component rather than from string
 * concatenation.
 *
 * **The heading says "Anomaly flags", not "AI Anomaly Flags".** These come from
 * `detectAnomalies` in payroll-core, which is a rule set with the company's own
 * tolerances — no model is involved. Labelling rule-based output with "AI" is
 * the same mislabel CLAUDE.md forbids for the annual insights.
 *
 * **Severity is `SeverityBadge`**, the one mapping the whole app uses: an
 * impossible figure is danger ("Critical"), a movement past a threshold is
 * signal ("Review"), a new or removed component is neutral ("Info"). Critical
 * sorts first.
 */

interface EmployeeDetailRowProps {
  data: ComparisonOutput;
  /** The company currency (step 8b). */
  currency: string;
}

const DASH = "—";

/** "net_change_beyond_tolerance" -> "Net change beyond tolerance". Sentence case. */
function typeLabel(type: string): string {
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Amount({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className="text-cv-ink-subtle">{DASH}</span>;
  return <span className="cv-num">{formatCurrency(value, currency)}</span>;
}

export function EmployeeDetailRow({ data, currency }: EmployeeDetailRowProps) {
  const money = (value: number) => formatCurrency(value, currency);

  const grossTotalPrev = Object.values(data.previousComponents).reduce(
    (s: number, v) => s + (v ?? 0),
    0,
  );
  const grossTotalCurr = Object.values(data.currentComponents).reduce(
    (s: number, v) => s + (v ?? 0),
    0,
  );

  const flags = data.anomalyFlags
    ? [...data.anomalyFlags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="overflow-x-auto rounded-cv-lg border border-cv-line bg-cv-surface">
        <table className="w-full border-collapse text-sm leading-5 text-cv-ink [font-variant-numeric:tabular-nums]">
          <thead className="bg-cv-surface-sunken">
            <tr className="border-b border-cv-line">
              <th className="h-10 px-3 text-left align-middle text-[13px] font-medium leading-[18px] text-cv-ink-muted">
                Component
              </th>
              <th className="h-10 px-3 text-right align-middle text-[13px] font-medium leading-[18px] text-cv-ink-muted">
                Previous
              </th>
              <th className="h-10 px-3 text-right align-middle text-[13px] font-medium leading-[18px] text-cv-ink-muted">
                Current
              </th>
              <th className="h-10 px-3 text-right align-middle text-[13px] font-medium leading-[18px] text-cv-ink-muted">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {data.componentDeltas.map((delta) => (
              <tr key={delta.component} className="border-b border-cv-line last:border-0">
                <td className="h-10 px-3 py-2 align-middle font-medium">
                  {formatComponentName(delta.component)}
                </td>
                <td className="h-10 px-3 py-2 text-right align-middle">
                  <Amount value={delta.previousValue} currency={currency} />
                </td>
                <td className="h-10 px-3 py-2 text-right align-middle">
                  <Amount value={delta.currentValue} currency={currency} />
                </td>
                <td className="h-10 px-3 py-2 text-right align-middle">
                  {delta.absoluteDiff === null ? (
                    <span className="text-cv-ink-subtle">{DASH}</span>
                  ) : (
                    <Variance
                      value={delta.absoluteDiff}
                      percent={delta.percentageDiff}
                      format={money}
                      className="justify-end"
                    />
                  )}
                </td>
              </tr>
            ))}
            {data.componentDeltas.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-sm leading-5 text-cv-ink-subtle"
                >
                  No pay components on either period.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-cv-line bg-cv-surface-sunken font-semibold">
            <tr className="border-b border-cv-line">
              <td className="h-10 px-3 py-2 align-middle">Components total</td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                <Amount value={grossTotalPrev} currency={currency} />
              </td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                <Amount value={grossTotalCurr} currency={currency} />
              </td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                {data.grossDelta === null ? (
                  <span className="font-normal text-cv-ink-subtle">{DASH}</span>
                ) : (
                  <Variance value={data.grossDelta} format={money} className="justify-end" />
                )}
              </td>
            </tr>
            <tr>
              <td className="h-10 px-3 py-2 align-middle">Net salary</td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                <Amount value={data.previousNet ?? null} currency={currency} />
              </td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                <Amount value={data.currentNet ?? null} currency={currency} />
              </td>
              <td className="h-10 px-3 py-2 text-right align-middle">
                {data.netDelta === null ? (
                  <span className="font-normal text-cv-ink-subtle">{DASH}</span>
                ) : (
                  <Variance value={data.netDelta} format={money} className="justify-end" />
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {flags.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="m-0 text-base font-semibold leading-6 text-cv-ink">Anomaly flags</h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {flags.map((flag, index) => (
              <li
                key={`${flag.type}-${index}`}
                className="flex flex-wrap items-start gap-2 rounded-cv-md border border-cv-line bg-cv-surface px-3 py-2"
              >
                <SeverityBadge severity={flag.severity} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-medium leading-5 text-cv-ink">
                    {typeLabel(flag.type)}
                  </p>
                  <p className="m-0 text-sm leading-5 text-cv-ink-muted">{flag.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
