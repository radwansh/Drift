"use client";

import { DriftStrip, Notice, PageHeader } from "@/components/cv";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { mergeIntegrations } from "@/components/integrations/providers";
import { trpc } from "@/lib/trpc";

/**
 * The connector list, read from and written to `companies.settings`.
 *
 * `(main)/integrations/page.tsx` held a five-element `useState` array with no
 * tRPC call in it at all: SAP and Workday came up Connected with sync times in
 * June 2026, "Sync now" was a `setTimeout` that stamped `new Date()`, and
 * every handler only called `setIntegrations`, so a reload undid whatever the
 * customer had just done.
 *
 * It now reads `integrations.list` and writes through `integrations.configure`
 * and `integrations.disconnect`, which really do persist. What it deliberately
 * does **not** do:
 *
 * - **It does not call `integrations.syncStatus`.** That procedure is a stub:
 *   it returns `status: "not_synced", lastSyncAt: null` unconditionally,
 *   ignoring both of its inputs, and it requires a `periodId` UUID this page
 *   does not have and would have to fetch a payroll period to invent. Calling
 *   it would spend one request per provider to learn a constant. The card
 *   states that nothing has synced without asking.
 * - **It does not pretend a connection moves data.** `configure` writes
 *   `{ provider, connectedAt }` into a JSON column; there is no sync job
 *   anywhere in this repo. The notice above the grid says so, because a green
 *   "Connected" badge on its own would imply payroll data is arriving.
 */
export function IntegrationsList() {
  const utils = trpc.useUtils();
  const list = trpc.integrations.list.useQuery();

  const invalidate = () => {
    void utils.integrations.list.invalidate();
  };
  const connect = trpc.integrations.configure.useMutation({ onSuccess: invalidate });
  const disconnect = trpc.integrations.disconnect.useMutation({ onSuccess: invalidate });

  const busy = connect.isPending || disconnect.isPending;
  const writeError = connect.error ?? disconnect.error;
  const integrations = mergeIntegrations(list.data ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Systems you can connect"
        lede="Record the HR and payroll systems this company uses."
      />

      {/* `info`, not `success`: the point of this line is that connecting does
          not move data. A tone that reads as good news would undo it. */}
      <Notice tone="info" title="No connector transfers data yet">
        Connecting records the provider against this company so the connection can be set up.
        Payroll data still arrives by upload, and nothing has synced.
      </Notice>

      {list.error && (
        <Notice tone="danger" title="Could not load your connectors">
          {list.error.message}
        </Notice>
      )}

      {writeError && (
        <Notice tone="danger" title="That change did not save">
          {writeError.message}
        </Notice>
      )}

      {list.isPending ? (
        // The design system's loading state is the scanning baseline, not a
        // grid of grey rectangles pretending to be five cards that may not
        // arrive. `aria-busy` carries it to a screen reader.
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-cv-lg border border-cv-line bg-cv-surface py-16"
          aria-busy="true"
        >
          <DriftStrip size="lg" count={24} animate="scan" label="Loading your connectors" />
          <p className="m-0 text-sm text-cv-ink-subtle">Loading your connectors</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.provider}
              name={integration.name}
              description={integration.description}
              provider={integration.provider}
              connected={integration.connected}
              connectedAt={integration.connectedAt}
              busy={busy}
              onConnect={() => connect.mutate({ provider: integration.provider, config: {} })}
              onDisconnect={() => disconnect.mutate({ provider: integration.provider })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
