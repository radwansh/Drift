"use client";

import { Badge, Stat } from "@/components/cv";
import { SCOPE_LABELS, type Scope } from "@/components/annual/annual-utils";

interface AnnualKpiCardProps {
  title: string;
  display: string;
  /** The full, unabbreviated value. Rendered as text, not only a hover title. */
  fullValue?: string;
  /**
   * Which period the headline covers. Required rather than optional: a figure
   * without a scope is what made "Total Employer Cost" read as an actual when it
   * was a full-year forecast (finding U5).
   */
  scope: Scope;
  subtext?: string;
  badge?: string;
}

/**
 * One annual KPI, on the design system's `Stat` (canvas board "Annual
 * salaries").
 *
 * The scope badge sits in `aside`, the label row, where it reads as a
 * qualification of the label rather than a status of the figure — "Salaries
 * forecast · Full-year forecast". It is the whole point of this card: a
 * full-year projection next to a year-to-date actual, with nothing to tell
 * them apart, is finding U5.
 *
 * No icon tile and no coloured figure: colour means change, and none of these
 * six is a change.
 */
export function AnnualKpiCard({
  title,
  display,
  fullValue,
  scope,
  subtext,
  badge,
}: AnnualKpiCardProps) {
  return (
    <Stat
      label={title}
      value={display}
      muted={display === "—"}
      aside={<Badge tone="neutral">{SCOPE_LABELS[scope]}</Badge>}
      caption={
        fullValue || subtext || badge ? (
          <span className="flex min-w-0 flex-col gap-1">
            {/* The full value is text, because a touch screen cannot open a
                hover title (finding U5). */}
            {fullValue && fullValue !== display && (
              <span className="break-words font-cv-mono tabular-nums">{fullValue}</span>
            )}
            {subtext && <span className="break-words">{subtext}</span>}
            {badge && (
              <span>
                <Badge tone="neutral">{badge}</Badge>
              </span>
            )}
          </span>
        ) : undefined
      }
    />
  );
}

export function AnnualKpiCardSkeleton() {
  return (
    <Stat
      label={
        <span
          aria-hidden="true"
          className="block h-[18px] w-24 animate-pulse rounded-cv-sm bg-cv-surface-sunken"
        />
      }
      loading
    />
  );
}
