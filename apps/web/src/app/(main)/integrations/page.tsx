"use client";

import { useState } from "react";
import { PageHeader } from "@/components/cv";
import { IntegrationCard } from "@/components/integrations/integration-card";

/**
 * Integrations — board "Integrations", screen 7 of the Ink & Signal rebuild.
 *
 * `PageHeader` and a two-column grid of `Panel`s, one per system. Nothing about
 * what this screen does has changed, which is worth stating plainly: **it does
 * nothing.** The five systems below are a hard-coded fixture, the three handlers
 * move local `useState` and no more, and `handleSync` waits two seconds and
 * stamps the clock. There is a real `integrations` tRPC router
 * (`server/routers/integrations.ts`, reading and writing `companies.settings`)
 * and this page has never called it. So "Last sync" is a literal from the array
 * below, or the moment Connect was clicked — never a sync, because no sync
 * exists. The rebuild keeps it that way; wiring the router up is a feature.
 */

interface Integration {
  id: string;
  name: string;
  description: string;
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
  syncSchedule: string | null;
}

const initialIntegrations: Integration[] = [
  {
    id: "sap",
    name: "SAP SuccessFactors",
    description: "Connect your SAP SuccessFactors payroll module for automatic data sync",
    provider: "sap",
    connected: true,
    lastSyncAt: "2026-06-20T14:30:00Z",
    syncSchedule: "Daily at 2:00 AM",
  },
  {
    id: "adp",
    name: "ADP Workforce Now",
    description: "Sync employee payroll data from ADP Workforce Now",
    provider: "adp",
    connected: false,
    lastSyncAt: null,
    syncSchedule: null,
  },
  {
    id: "sage",
    name: "Sage HR & Payroll",
    description: "Integrate with Sage for seamless payroll data import",
    provider: "sage",
    connected: false,
    lastSyncAt: null,
    syncSchedule: null,
  },
  {
    id: "workday",
    name: "Workday",
    description: "Connect Workday HCM and Payroll for automated comparisons",
    provider: "workday",
    connected: true,
    lastSyncAt: "2026-06-19T08:00:00Z",
    syncSchedule: "Daily at 3:00 AM",
  },
  {
    id: "gusto",
    name: "Gusto",
    description: "Import payroll data directly from your Gusto account",
    provider: "gusto",
    connected: false,
    lastSyncAt: null,
    syncSchedule: null,
  },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);

  const handleConnect = (provider: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.provider === provider
          ? {
              ...i,
              connected: true,
              lastSyncAt: new Date().toISOString(),
              syncSchedule: "Daily at 2:00 AM",
            }
          : i,
      ),
    );
  };

  const handleDisconnect = (provider: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.provider === provider
          ? { ...i, connected: false, lastSyncAt: null, syncSchedule: null }
          : i,
      ),
    );
  };

  const handleSync = async (provider: string) => {
    await new Promise((r) => setTimeout(r, 2000));
    setIntegrations((prev) =>
      prev.map((i) =>
        i.provider === provider ? { ...i, lastSyncAt: new Date().toISOString() } : i,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Integrations"
        title="Systems you can connect"
        lede="Connect your HR and payroll systems for automatic data synchronization."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            name={integration.name}
            description={integration.description}
            connected={integration.connected}
            lastSyncAt={integration.lastSyncAt}
            syncSchedule={integration.syncSchedule}
            onConnect={() => handleConnect(integration.provider)}
            onDisconnect={() => handleDisconnect(integration.provider)}
            onSync={() => handleSync(integration.provider)}
          />
        ))}
      </div>
    </div>
  );
}
