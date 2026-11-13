"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { INTEGRATION_PROVIDERS, mergeIntegrations } from "@/components/integrations/providers";
import { trpc } from "@/lib/trpc";
import { TriangleAlert } from "lucide-react";

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
      <div>
        <h2 className="text-2xl font-bold">Integrations</h2>
        <p className="text-muted-foreground mt-1">
          Connect your HR and payroll systems for automatic data synchronization
        </p>
      </div>

      <Alert>
        <AlertDescription>
          No connector transfers data yet. Connecting records the provider against this company so
          the connection can be set up; payroll data still arrives by upload, and nothing has
          synced.
        </AlertDescription>
      </Alert>

      {list.error && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{list.error.message}</AlertDescription>
        </Alert>
      )}

      {writeError && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{writeError.message}</AlertDescription>
        </Alert>
      )}

      {list.isPending ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_PROVIDERS.map((entry) => (
            <Skeleton key={entry.provider} className="h-64" />
          ))}
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
