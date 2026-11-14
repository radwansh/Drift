"use client";

import { Stat, type VarianceProps } from "@/components/cv";

/**
 * One Dashboard KPI (redesign canvas: Dashboard, "Key figures").
 *
 * The design system's Stat: label, hero figure in `kpi` type, then how it moved and a
 * caption. No icon tile and no coloured figure: colour means change, so it lives in the
 * Variance chip under the number, never on the number itself.
 */
export interface KpiCardProps {
  label: string;
  /** Pre-formatted, through formatCurrency for money. */
  value?: string;
  variance?: VarianceProps;
  caption?: React.ReactNode;
  /** The figure is an absence ("None"): set it in ink-subtle. */
  muted?: boolean;
  loading?: boolean;
}

export function KpiCard({ label, value, variance, caption, muted, loading }: KpiCardProps) {
  return (
    <Stat
      label={label}
      value={value}
      variance={variance}
      caption={caption}
      muted={muted}
      loading={loading}
    />
  );
}
