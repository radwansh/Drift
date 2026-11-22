"use client";

import { useId, useMemo, useState } from "react";
import { TextField } from "@/components/cv";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/onboarding-options";

/**
 * The country picker: a filter field above `components/ui/select`.
 *
 * **Why two controls rather than one combobox.** The list is every assigned
 * ISO 3166-1 alpha-2 code, which is far more than Radix Select's own typeahead
 * is comfortable with, and Radix Select cannot hold a text input inside its
 * content — it claims keystrokes for that typeahead. A hand-rolled combobox
 * would mean rebuilding the listbox keyboard contract that the re-skinned
 * Select already gets right. So the filter is a plain labelled field that
 * narrows the options, and the listbox stays the listbox: two controls each
 * doing what it already does accessibly, instead of one that half works.
 *
 * The filter matches the name *or* the code, so "GB" and "United" both find
 * the United Kingdom. It never hides the current selection: a filter that
 * excluded the chosen country would show an empty trigger and turn the next
 * Continue into a silent change — the trap `(main)/settings/page.tsx` describes
 * for a currency the select cannot offer.
 */
export function CountryField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const autoId = useId();
  const filterId = `country-filter-${autoId}`;
  const selectId = `country-${autoId}`;

  const needle = query.trim().toLowerCase();
  const options = useMemo(() => {
    if (needle.length === 0) return COUNTRIES;
    const matches = COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle,
    );
    // The selection always stays offerable, even when the filter excludes it.
    if (value && !matches.some((c) => c.code === value)) {
      const selected = COUNTRIES.find((c) => c.code === value);
      if (selected) return [selected, ...matches];
    }
    return matches;
  }, [needle, value]);

  return (
    <div className="flex flex-col gap-3">
      <TextField
        id={filterId}
        label="Search countries"
        type="search"
        autoComplete="off"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing a country or code"
        hint="Narrows the list below. Searching does not change your answer."
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={selectId}
          className="text-[13px] font-medium leading-[18px] tracking-[0.005em] text-cv-ink"
        >
          Country
        </label>
        <Select
          value={value ?? undefined}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger id={selectId} aria-label="Country">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {options.map((country) => (
              <SelectItem key={country.code} value={country.code}>
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="m-0 text-[13px] leading-[18px] text-cv-ink-subtle">
          {options.length === 0
            ? "No country matches that search."
            : "Where the company runs its payroll. It sets the suggestions for the next steps."}
        </p>
      </div>
    </div>
  );
}
