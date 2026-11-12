"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartFrameProps {
  /** Sentence describing what the chart shows, read by screen readers. */
  label: string;
  /** Row names for the hidden data table. */
  rows: { name: string; values: string[] }[];
  /** Column headers for the hidden data table. */
  columns: string[];
  /**
   * Header of the row-name column in the hidden table. Defaults to "Period", which is
   * right for every annual chart; the dashboard's distribution and component charts
   * are not per period, so they name their own ("Change in net pay", "Pay component").
   */
  rowHeader?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a chart so it is reachable without sight (step 39, finding U10).
 *
 * None of the charts had a role, a label or a text alternative, so to a screen
 * reader the dashboard's six charts were six empty boxes. Recharts renders an
 * SVG with no semantics of its own, so the frame supplies `role="img"` plus a
 * visually hidden table carrying the same numbers — which also means the figures
 * are selectable and searchable, not only decodable from bar heights.
 */
export function ChartFrame({
  label,
  rows,
  columns,
  rowHeader = "Period",
  className,
  children,
}: ChartFrameProps) {
  return (
    <div className={cn("w-full min-w-0", className)}>
      <div role="img" aria-label={label} className="h-full w-full min-w-0">
        {children}
      </div>
      {/* sr-only goes on a wrapper, not on the table: a table never shrinks below its
          content, so `sr-only` on the <table> itself left a 1,100px-wide absolutely
          positioned box that widened the page (a horizontal scrollbar on every page with a
          chart). The wrapper clips it to 1px as intended. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{rowHeader}</th>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                {r.values.map((v, i) => (
                  <td key={`${r.name}-${columns[i] ?? i}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
