"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { EmployeeRecord } from "@saas/payroll-core";

export interface StoredPeriod {
  id: string;
  label: string;
  periodType: string;
  dateFrom: string;
  dateTo: string;
  employees: EmployeeRecord[];
  fileName: string;
}

interface PayrollStoreContextValue {
  periods: StoredPeriod[];
  addPeriod: (period: StoredPeriod) => void;
  removePeriod: (id: string) => void;
  clearPeriods: () => void;
  componentVisibility: Record<string, boolean>;
  setComponentVisibility: (component: string, visible: boolean) => void;
}

const PayrollStoreContext = createContext<PayrollStoreContextValue | null>(null);

export function PayrollStoreProvider({ children }: { children: ReactNode }) {
  const [periods, setPeriods] = useState<StoredPeriod[]>([]);
  const [componentVisibility, setComponentVisibilityState] = useState<Record<string, boolean>>({});

  const addPeriod = useCallback((period: StoredPeriod) => {
    setPeriods((prev) => [...prev, period]);
  }, []);

  const removePeriod = useCallback((id: string) => {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPeriods = useCallback(() => {
    setPeriods([]);
  }, []);

  const setComponentVisibility = useCallback((component: string, visible: boolean) => {
    setComponentVisibilityState((prev) => ({ ...prev, [component]: visible }));
  }, []);

  return (
    <PayrollStoreContext.Provider value={{ periods, addPeriod, removePeriod, clearPeriods, componentVisibility, setComponentVisibility }}>
      {children}
    </PayrollStoreContext.Provider>
  );
}

export function usePayrollStore() {
  const ctx = useContext(PayrollStoreContext);
  if (!ctx) throw new Error("usePayrollStore must be used within PayrollStoreProvider");
  return ctx;
}
