"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_COLUMN_KEYS,
  EMPLOYEE_COLUMNS,
  type EmployeeColumnKey,
} from "@/components/employee-file/employee-columns";

/**
 * Which list columns the user wants to see (step E4, finding F1).
 *
 * `localStorage`, under a key of this feature's own. Not `saved_views`: nothing
 * in the app reads or writes that table — it is dead schema, and the only
 * references are its definition, its export and migration `0000`. Column
 * preferences already live in `localStorage` for the detailed view
 * (`drift_saved_views`, via `use-saved-views.ts`), so this follows the pattern
 * that is actually in use rather than the one the spec assumed.
 *
 * `null` while loading, then a resolved array. The distinction matters: it lets
 * the table render the defaults on the server and the first client paint, and
 * apply a stored preference only once it exists, instead of flashing an empty
 * table.
 */

const STORAGE_KEY = "drift_employee_columns";

const KNOWN_KEYS: readonly string[] = EMPLOYEE_COLUMNS.map((column) => column.key);

function read(): EmployeeColumnKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Unknown keys are dropped rather than carried: a renamed column would
    // otherwise sit in storage forever, hiding its replacement.
    const keys = parsed.filter(
      (key): key is EmployeeColumnKey => typeof key === "string" && KNOWN_KEYS.includes(key),
    );
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

function write(keys: readonly EmployeeColumnKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Private browsing or a full quota. A column preference is a convenience,
    // so a write failure must not break the list.
  }
}

export function useEmployeeColumns() {
  const [keys, setKeys] = useState<EmployeeColumnKey[] | null>(null);

  useEffect(() => {
    setKeys(read());
  }, []);

  const toggle = useCallback((key: EmployeeColumnKey) => {
    setKeys((current) => {
      const base = current ?? DEFAULT_COLUMN_KEYS;
      const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setKeys(DEFAULT_COLUMN_KEYS);
    write(DEFAULT_COLUMN_KEYS);
  }, []);

  return { keys, toggle, reset };
}
