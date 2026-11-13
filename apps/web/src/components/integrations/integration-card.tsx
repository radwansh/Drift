"use client";

import { Badge, Button, Panel } from "@/components/cv";
import { formatDate } from "@/lib/date";
import { Plug } from "lucide-react";

/**
 * One connector, as board "Integrations" draws it: a `Panel` whose heading is
 * the system's name, with a one-line description, its status, the facts the
 * database actually holds, and the action that status allows.
 *
 * Three things the design system does not do, carried over from the rebuild:
 *
 * - **No third-party mark.** Every system used to get a 48px tile holding a
 *   stand-in Lucide glyph — a database for SAP, a cloud for Workday, a wallet
 *   for Gusto. A glyph picked per vendor reads as that vendor's logo while
 *   being nothing of the sort, and the spec rules third-party logos out. The
 *   name is the heading; that is the whole identification.
 * - **No slug under the name.** `{provider}` printed with `capitalize` gave
 *   "Sap" and "Adp" — an internal id dressed up as a label, beneath a heading
 *   that already says the name properly.
 * - **Status is a word with its icon**, never a bare coloured dot. Colour alone
 *   is not a status anyone can read.
 *
 * Three controls are absent because there is nothing behind any of them. The
 * redesign still drew all three, since it restyled this card while the screen
 * was a fixture; wiring the router up is what established that they had no
 * backing:
 *
 * - **Sync now** was a two-second `setTimeout` that then stamped `new Date()`
 *   into "Last sync", inventing the one figure on the card a customer would act
 *   on. There is no sync procedure in the router and no sync code anywhere in
 *   the repo.
 * - **Configure** never had an `onClick`. `integrations.configure` takes an
 *   arbitrary `config` record and no provider states what it needs, so there is
 *   nothing to put in a form yet.
 * - **Schedule** read "Daily at 2:00 AM" from the fixture. Its honest reading
 *   would be "Not scheduled" on every card, which is a row that says nothing.
 *
 * What is left is what the database knows: whether a provider was recorded, and
 * when.
 */
interface IntegrationCardProps {
  name: string;
  description: string;
  provider: string;
  connected: boolean;
  connectedAt: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  /** A write is in flight — either this card's or another's. */
  busy?: boolean;
}

export function IntegrationCard({
  name,
  description,
  connected,
  connectedAt,
  onConnect,
  onDisconnect,
  busy,
}: IntegrationCardProps) {
  return (
    <Panel
      title={name}
      description={description}
      actions={
        connected ? (
          <Badge tone="success" icon="check">
            Connected
          </Badge>
        ) : (
          <Badge tone="neutral">Not connected</Badge>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {/* Shown once connected, because neither fact has a reading before
            then: an unconnected system has no connection date, and "no sync"
            is not news about a system nobody has set up. */}
        {connected && (
          <dl className="m-0 grid grid-cols-2 gap-4 rounded-cv-md bg-cv-surface-sunken p-3">
            <Fact label="Connected">
              {connectedAt ? formatDate(connectedAt) : "Not recorded"}
            </Fact>
            {/* Never a date. `integrations.syncStatus` answers `not_synced`
                unconditionally and nothing in this repo syncs, so there is no
                sync to date. */}
            <Fact label="Last sync">No sync recorded</Fact>
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<Plug aria-hidden="true" />}
              onClick={onConnect}
              disabled={busy}
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium leading-[18px] text-cv-ink-subtle">{label}</dt>
      <dd className="m-0 mt-0.5 font-cv-mono text-[13px] leading-5 text-cv-ink">{children}</dd>
    </div>
  );
}
