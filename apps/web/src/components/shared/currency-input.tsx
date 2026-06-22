"use client";

import { forwardRef, useState, useCallback, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";
import { CURRENCY_OPTIONS } from "@/lib/currency";

interface CurrencyInputProps extends Omit<InputProps, "type" | "onChange" | "value"> {
  currencyCode?: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, currencyCode = "USD", value, onChange, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const symbol = CURRENCY_OPTIONS.find((c) => c.value === currencyCode)?.symbol ?? "$";

    const displayValue = focused
      ? (value ?? "").toString()
      : value !== null
        ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9.\-]/g, "");
        if (raw === "" || raw === "-") {
          onChange(null);
          return;
        }
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
          onChange(parsed);
        }
      },
      [onChange],
    );

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {symbol}
        </span>
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn("pl-7", className)}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
