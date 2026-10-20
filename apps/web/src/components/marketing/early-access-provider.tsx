"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { launch } from "@/config/launch";
import { EarlyAccessModal } from "./early-access-modal";

/**
 * One early-access dialog for the whole page.
 *
 * Every `EarlyAccessButton` used to mount its own, which measured at thirteen
 * `<dialog>` elements on the landing page — the header, the hero, each pricing
 * card and the final CTA, times the variants Clerk's signed-in/signed-out gate
 * renders. They were inert (`display: none`, close buttons out of the tab
 * order), but thirteen copies of the same dialog is thirteen chances for them
 * to disagree. The state lifts here instead and the buttons become triggers.
 *
 * Mounted inside the marketing layout's themed wrapper, not above it: the
 * dialog's colours come from the cv- tokens and its fonts from the layout's
 * font variables, and `showModal()` promotes it to the top layer regardless of
 * where it sits in the tree.
 */
interface EarlyAccessContextValue {
  openEarlyAccess: () => void;
}

const EarlyAccessContext = createContext<EarlyAccessContextValue | null>(null);

export function EarlyAccessProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo<EarlyAccessContextValue>(
    () => ({ openEarlyAccess: () => setOpen(true) }),
    [],
  );

  const close = useCallback(() => setOpen(false), []);

  return (
    <EarlyAccessContext.Provider value={value}>
      {children}
      {launch.waitlistMode && <EarlyAccessModal open={open} onClose={close} />}
    </EarlyAccessContext.Provider>
  );
}

/**
 * Throws rather than no-oping when the provider is missing: a "Get early
 * access" button that silently does nothing is the worst outcome on this page,
 * and it would not show up in a type check.
 */
export function useEarlyAccess(): EarlyAccessContextValue {
  const ctx = useContext(EarlyAccessContext);
  if (!ctx) {
    throw new Error("EarlyAccessButton must be rendered inside an EarlyAccessProvider");
  }
  return ctx;
}
