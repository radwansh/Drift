"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/**
 * Which salary components the detailed view shows.
 *
 * This context used to also hold `periods` — the parsed employee records of
 * every upload — and was the application's only record of them: the upload
 * modal never sent anything to the server, so payroll data lived in one tab's
 * memory and vanished on reload. Everything that read it now queries the
 * server (step 3.4 of docs/ANNUAL_PAGE_FIX_PLAN.md), and what remains is a
 * genuine client-side UI preference.
 *
 * It is still per-session: picking columns is not persisted anywhere. If that
 * should survive a reload it belongs in company settings, next to the column
 * mappings it mirrors, rather than back in here.
 */
interface PayrollStoreContextValue {
  componentVisibility: Record<string, boolean>;
  setComponentVisibility: (component: string, visible: boolean) => void;
}

const PayrollStoreContext = createContext<PayrollStoreContextValue | null>(null);

export function PayrollStoreProvider({ children }: { children: ReactNode }) {
  const [componentVisibility, setComponentVisibilityState] = useState<Record<string, boolean>>({});

  const setComponentVisibility = useCallback((component: string, visible: boolean) => {
    setComponentVisibilityState((prev) => ({ ...prev, [component]: visible }));
  }, []);

  return (
    <PayrollStoreContext.Provider value={{ componentVisibility, setComponentVisibility }}>
      {children}
    </PayrollStoreContext.Provider>
  );
}

export function usePayrollStore() {
  const ctx = useContext(PayrollStoreContext);
  if (!ctx) throw new Error("usePayrollStore must be used within PayrollStoreProvider");
  return ctx;
}
