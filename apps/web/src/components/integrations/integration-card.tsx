"use client";

import { useState } from "react";
import { Plug, RefreshCw, Settings } from "lucide-react";
import { Badge, Button, Panel } from "@/components/cv";
import { formatDate } from "@/lib/date";

/**
 * One integration, as board "Integrations" draws it: a `Panel` whose heading is
 * the system's name, with a one-line description, its status, the two sync facts
 * and the actions that status allows.
 *
 * Three things the old card did that the design system does not:
 *
 * - **No third-party mark.** Every system had a 48px tile holding a stand-in
 *   Lucide glyph (a database for SAP, a cloud for Workday, a wallet for Gusto).
 *   A glyph picked per vendor reads as that vendor's logo while being nothing of
 *   the sort, and the spec rules third-party logos out. The name is the heading;
 *   that is the whole identification.
 * - **No slug under the name.** `{provider}` printed with `capitalize` gave
 *   "Sap" and "Adp" — an internal id dressed up as a label, under a heading that
 *   already says the name properly.
 * - **Status is a word with its icon**, never a bare coloured dot: `Badge`
 *   success + check for Connected, neutral for Not connected. Colour alone is
 *   not a status anyone can read.
 *
 * Disconnect was an icon-only ghost button carrying nothing but an unplug glyph
 * and no `aria-label`, so screen readers announced "button" for the one control
 * here that undoes a connection. It now says Disconnect.
 */

interface IntegrationCardProps {
  name: string;
  description: string;
  connected: boolean;
  lastSyncAt: string | null;
  syncSchedule: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}

/** A label over its value; the value in mono, as the board sets the sync facts. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium leading-[18px] text-cv-ink-subtle">{label}</dt>
      <dd className="m-0 mt-0.5 font-cv-mono text-[13px] leading-5 text-cv-ink">{children}</dd>
    </div>
  );
}

export function IntegrationCard({
  name,
  description,
  connected,
  lastSyncAt,
  syncSchedule,
  onConnect,
  onDisconnect,
  onSync,
}: IntegrationCardProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await onSync();
    setSyncing(false);
  };

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
        {/*
          Both facts show on every card. They used to appear only once connected,
          which left the "Manual" fallback unreachable — and it would have been
          wrong where it finally showed, since nothing syncs by hand either until
          the system is connected. "Not scheduled" is the honest reading there;
          a connected system with no schedule still says "Manual".
        */}
        <dl className="m-0 grid grid-cols-2 gap-4 rounded-cv-md bg-cv-surface-sunken p-3">
          <Fact label="Last sync">{lastSyncAt ? formatDate(lastSyncAt) : "Never"}</Fact>
          <Fact label="Schedule">{syncSchedule ?? (connected ? "Manual" : "Not scheduled")}</Fact>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw aria-hidden="true" />}
                loading={syncing}
                disabled={syncing}
                onClick={() => void handleSync()}
              >
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button variant="secondary" size="sm" icon={<Settings aria-hidden="true" />}>
                Configure
              </Button>
              <Button variant="ghost" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" icon={<Plug aria-hidden="true" />} onClick={onConnect}>
              Connect
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
