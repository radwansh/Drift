/**
 * Chart colours and Recharts defaults, from the design system's data-visualization
 * rules. Plain `.ts` so tests can import it.
 *
 * Pass these as explicit `fill` / `stroke` props (CLAUDE.md: Recharts does not apply
 * classes to legend marks). They are `var(--cv-*)` strings, so a chart follows the
 * light/dark theme with no re-render — the same mechanism the app's charts already use
 * with `hsl(var(--primary))`.
 *
 * The rules, in short:
 * - Two periods side by side: previous in CHART.previous (grey), current in CHART.current (ink).
 * - Variance diverges from a zero baseline: increases CHART.up (rust), decreases
 *   CHART.down (cobalt), a neutral grey midpoint. Never a third hue in between.
 * - Categories (salary components, departments) take CHART.series[0..5] IN ORDER, never
 *   cycled; a seventh and beyond fold into "Other" (use foldIntoOther).
 * - Gridlines are CHART.grid hairlines; the baseline is CHART.axis. One y-axis per chart.
 * - Values, labels and legends stay in text tokens, never in series colours.
 * - Every chart sits in components/annual/chart-frame.tsx (role="img", label, hidden
 *   data table) and has a tooltip.
 */

export const CHART = {
  previous: "var(--cv-chart-previous)",
  current: "var(--cv-chart-current)",
  up: "var(--cv-delta-up)",
  down: "var(--cv-delta-down)",
  flat: "var(--cv-delta-flat)",
  grid: "var(--cv-chart-grid)",
  axis: "var(--cv-chart-axis)",
  text: "var(--cv-ink-subtle)",
  textStrong: "var(--cv-ink)",
  /** Hatched or dashed marks for "estimated", "forecast", "missing" periods. */
  muted: "var(--cv-ink-disabled)",
  series: [
    "var(--cv-chart-1)",
    "var(--cv-chart-2)",
    "var(--cv-chart-3)",
    "var(--cv-chart-4)",
    "var(--cv-chart-5)",
    "var(--cv-chart-6)",
  ] as const,
} as const;

/** The maximum number of category series before the rest fold into "Other". */
export const MAX_SERIES = CHART.series.length;

/** Colour for the n-th category (0-based). Index MAX_SERIES and beyond is "Other". */
export function seriesColor(index: number): string {
  return index >= 0 && index < MAX_SERIES ? CHART.series[index]! : CHART.flat;
}

/** Colour for a signed change: rust up, cobalt down, grey for no change. */
export function deltaColor(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0 || !Number.isFinite(value))
    return CHART.flat;
  return value > 0 ? CHART.up : CHART.down;
}

/**
 * Keeps the first `MAX_SERIES - 1` categories by size and folds the rest into one
 * "Other" entry, so a chart never needs a seventh colour.
 */
export function foldIntoOther<T extends { label: string; value: number }>(
  items: readonly T[],
  otherLabel = "Other",
): Array<{ label: string; value: number }> {
  if (items.length <= MAX_SERIES) return items.map(({ label, value }) => ({ label, value }));
  const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const head = sorted.slice(0, MAX_SERIES - 1).map(({ label, value }) => ({ label, value }));
  const rest = sorted.slice(MAX_SERIES - 1).reduce((sum, item) => sum + item.value, 0);
  return [...head, { label: otherLabel, value: rest }];
}

/** Shared Recharts props. Spread them: <CartesianGrid {...gridProps} />. */
export const gridProps = { stroke: CHART.grid, strokeDasharray: "0", vertical: false } as const;

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.text, fontSize: 12, fontFamily: "var(--cv-font-mono)" },
  tickLine: false,
  axisLine: { stroke: CHART.axis },
} as const;

export const categoryAxisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.text, fontSize: 12, fontFamily: "var(--cv-font-sans)" },
  tickLine: false,
  axisLine: false,
} as const;

export const tooltipProps = {
  cursor: { fill: "var(--cv-surface-sunken)" },
  contentStyle: {
    background: "var(--cv-surface-raised)",
    border: "1px solid var(--cv-line)",
    borderRadius: 6,
    boxShadow: "var(--cv-shadow-md)",
    color: "var(--cv-ink)",
    fontFamily: "var(--cv-font-sans)",
    fontSize: 13,
    padding: "8px 12px",
  },
  labelStyle: { color: "var(--cv-ink)", fontWeight: 600, marginBottom: 4 },
  itemStyle: {
    color: "var(--cv-ink-muted)",
    fontFamily: "var(--cv-font-mono)",
    fontSize: 12,
    padding: 0,
  },
} as const;

export const legendProps = {
  iconType: "square" as const,
  iconSize: 10,
  wrapperStyle: { fontSize: 12, color: "var(--cv-ink-muted)", fontFamily: "var(--cv-font-sans)" },
};

/** Bar ends use radius-xs (2px). Horizontal bars round the far end only. */
export const BAR_RADIUS_VERTICAL: [number, number, number, number] = [2, 2, 0, 0];
export const BAR_RADIUS_HORIZONTAL: [number, number, number, number] = [0, 2, 2, 0];
