/**
 * The connectors the page offers, and the merge between that catalogue and
 * what `companies.settings.integrations` actually holds.
 *
 * The catalogue is copy: five vendor names and what a connector to each would
 * do. What it is **not** is the state of a connection — that was the bug. The
 * page used to hold this same list with `connected: true` and
 * `lastSyncAt: "2026-06-20T14:30:00Z"` baked into it for SAP and Workday, in
 * `useState`, with no tRPC call anywhere: two connections and two sync times
 * that had never happened, identical for every company in the product.
 *
 * Connection state now comes from `integrations.list` and nothing else, and
 * the merge below is the only place the two meet.
 */

export interface IntegrationProvider {
  provider: string;
  name: string;
  description: string;
}

export const INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = [
  {
    provider: "sap",
    name: "SAP SuccessFactors",
    description: "Connect your SAP SuccessFactors payroll module for automatic data sync",
  },
  {
    provider: "adp",
    name: "ADP Workforce Now",
    description: "Sync employee payroll data from ADP Workforce Now",
  },
  {
    provider: "sage",
    name: "Sage HR & Payroll",
    description: "Integrate with Sage for seamless payroll data import",
  },
  {
    provider: "workday",
    name: "Workday",
    description: "Connect Workday HCM and Payroll for automated comparisons",
  },
  {
    provider: "gusto",
    name: "Gusto",
    description: "Import payroll data directly from your Gusto account",
  },
];

export interface IntegrationView extends IntegrationProvider {
  connected: boolean;
  /**
   * When `integrations.configure` recorded this provider — a real event with a
   * real timestamp, unlike the sync times this page used to show.
   *
   * `null` when the stored row carries no usable `connectedAt`: rows are
   * free-form JSON, so the value is checked rather than trusted, and an
   * unparseable one is left unsaid instead of rendered as "Invalid Date".
   */
  connectedAt: string | null;
}

/** A usable ISO timestamp, or null. The rows are untyped JSON. */
function timestampOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * The catalogue, carrying the connection state the database holds.
 *
 * A stored provider the catalogue does not list is appended rather than
 * dropped: it was written by some build of this app, it is still in the
 * company's settings, and a card is the only way to disconnect it. Hiding it
 * would make a connection that exists invisible — the mirror of the bug this
 * page had.
 */
export function mergeIntegrations(
  stored: readonly Record<string, unknown>[],
): IntegrationView[] {
  const byProvider = new Map<string, Record<string, unknown>>();
  for (const row of stored) {
    const provider = row.provider;
    if (typeof provider === "string" && provider.length > 0) byProvider.set(provider, row);
  }

  const known = INTEGRATION_PROVIDERS.map((entry) => {
    const row = byProvider.get(entry.provider);
    return {
      ...entry,
      connected: row !== undefined,
      connectedAt: row === undefined ? null : timestampOf(row.connectedAt),
    };
  });

  const extra = [...byProvider.entries()]
    .filter(([provider]) => !INTEGRATION_PROVIDERS.some((e) => e.provider === provider))
    .map(([provider, row]) => ({
      provider,
      name: provider,
      description: "Recorded in this company's settings. This build has no card for it.",
      connected: true,
      connectedAt: timestampOf(row.connectedAt),
    }));

  return [...known, ...extra];
}
