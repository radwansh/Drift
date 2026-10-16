"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * SegmentedControl — two to five mutually exclusive views. Ported from
 * bundle.css (`.cv-seg`).
 *
 * The only stateful component the landing page uses: it drives the monthly /
 * yearly billing toggle. Everything else on the page is static, and the mobile
 * menu and FAQ use native <details>, so this is the one client boundary in the
 * section components.
 *
 * Buttons carry `aria-pressed` rather than being a radio group, matching the
 * reference implementation — the control switches a view rather than entering
 * a value in a form.
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
  // Controlled when `value` is supplied, uncontrolled otherwise.
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
