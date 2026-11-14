"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/**
 * TextField — label, input, and one line of help or error, ported from the design
 * system's bundle (TextField) to Tailwind on the cv- tokens.
 *
 * - The label is always visible (no placeholder-as-label).
 * - 40px control (`control-md`), 15px text, `border` (3:1) edge, cobalt focus ring.
 * - `error` replaces `hint`, turns the edge crimson and is announced through
 *   aria-describedby; the input gets aria-invalid.
 * - `mono` sets the value in Geist Mono with tabular figures — for amounts, IDs and
 *   pay codes. `prefix`/`suffix` hold units such as a currency code.
 */

export interface TextFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "prefix"
> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  /** Classes for the outer wrapper (width, grid placement). */
  className?: string;
  inputClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    prefix,
    suffix,
    mono,
    className,
    inputClassName,
    id,
    type = "text",
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `cv-field-${autoId}`;
  const msgId = `${inputId}-msg`;
  const describedBy = error || hint ? msgId : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 font-cv-sans", className)}>
      <label
        htmlFor={inputId}
        className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-cv-md border bg-cv-surface px-3 transition-[border-color,box-shadow]",
          "focus-within:border-cv-accent focus-within:shadow-cv-focus-ring",
          error ? "border-cv-danger" : "border-cv-border hover:border-cv-ink-muted",
          rest.disabled && "cursor-not-allowed bg-cv-surface-sunken",
        )}
      >
        {prefix && (
          <span
            aria-hidden="true"
            className="flex-none font-cv-mono text-[13px] text-cv-ink-subtle"
          >
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] leading-6 text-cv-ink outline-none",
            "placeholder:text-cv-ink-subtle disabled:cursor-not-allowed disabled:text-cv-ink-disabled",
            mono && "font-cv-mono text-sm tabular-nums",
            inputClassName,
          )}
          {...rest}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="flex-none font-cv-mono text-[13px] text-cv-ink-subtle"
          >
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <p
          id={msgId}
          className="m-0 flex items-center gap-1.5 text-[13px] leading-[18px] text-cv-danger-ink"
        >
          <Icon name="x-circle" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
