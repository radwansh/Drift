"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * SegmentedControl — a small set of mutually exclusive options, all visible.
 *
 * In the app: the payroll cadence (Monthly, Bi-monthly, Bi-weekly, Weekly), the Employee
 * File's "who to list", chart modes (By period / Cumulative). Use a select when there are
 * more than five options or the labels are long.
 *
 * Buttons with aria-pressed inside a labelled group, so a screen reader hears the group
 * name and which option is on. Controlled with `value` + `onChange`, or uncontrolled with
 * `defaultValue`.
 */

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

export interface SegmentedControlProps {
  options: Array<SegmentedOption | string>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  /** The group's accessible name, e.g. "Payroll cadence". */
  label?: string;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  size = "md",
  label,
  className,
}: SegmentedControlProps) {
  const normalised: SegmentedOption[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const [internal, setInternal] = useState(defaultValue ?? normalised[0]?.value ?? "");
  const current = value ?? internal;

  function select(next: string) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-cv-md border border-cv-line bg-cv-surface-sunken p-[3px] font-cv-sans",
        className,
      )}
    >
      {normalised.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => select(o.value)}
            className={cn(
              "whitespace-nowrap rounded-cv-sm border-0 font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
              size === "sm" ? "h-[26px] px-2.5 text-xs" : "h-8 px-3 text-[13px] leading-[18px]",
              active
                ? "bg-cv-surface text-cv-ink shadow-cv-sm ring-1 ring-inset ring-cv-line"
                : "bg-transparent text-cv-ink-muted hover:text-cv-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
