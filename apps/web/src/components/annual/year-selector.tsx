"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const YEAR_COOKIE = "drift_annual_year";

export function YearSelector({
  initialYear,
  availableYears,
}: {
  initialYear: number;
  availableYears: number[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialYear));

  useEffect(() => {
    setValue(String(initialYear));
  }, [initialYear]);

  function handleChange(next: string) {
    setValue(next);
    document.cookie = `${YEAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.replace(`/annual-salaries?year=${next}`);
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