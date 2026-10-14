"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const YEAR_COOKIE = "drift_annual_year";

/**
 * Year picker for the annual dashboard (finding 4d).
 *
 * The parent owns the URL. This used to also call
 * `router.replace('/annual-salaries?year=N')` itself, which discarded the
 * `cadence`, `currency` and `method` params and raced the parent's own
 * `router.replace` — two navigations per change, with the hardcoded one
 * clobbering the one that preserved the rest of the query string.
 *
 * `onYearChange` is required so a new caller cannot quietly end up with a
 * selector that changes nothing.
 */
export function YearSelector({
  initialYear,
  availableYears,
  onYearChange,
}: {
  initialYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
}) {
  const [value, setValue] = useState(String(initialYear));

  useEffect(() => {
    setValue(String(initialYear));
  }, [initialYear]);

  function handleChange(next: string) {
    setValue(next);
    document.cookie = `${YEAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    onYearChange(Number(next));
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger aria-label="Select year" className="w-32">
        <SelectValue placeholder="Select year" />
      </SelectTrigger>
      <SelectContent>
        {availableYears.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}