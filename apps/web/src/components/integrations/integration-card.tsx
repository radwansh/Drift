"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/date";
import { Plug, Zap, Unplug, Building2, Database, Cloud, Briefcase, Wallet } from "lucide-react";

const providerIcons: Record<string, React.ReactNode> = {
  sap: <Database className="h-8 w-8" />,
  adp: <Building2 className="h-8 w-8" />,
  sage: <Briefcase className="h-8 w-8" />,
  workday: <Cloud className="h-8 w-8" />,
  gusto: <Wallet className="h-8 w-8" />,
};

/**
 * One connector.
 *
 * Three controls were removed rather than wired, because there is nothing
 * behind any of them:
 *
 * - **Sync now** was a two-second `setTimeout` that then stamped
 *   `new Date()` into "Last Sync". It invented the one figure on the card that
 *   a customer would act on. There is no sync procedure in the router and no
 *   sync code anywhere in the repo, so the button is gone instead of hooked to
 *   something.
 * - **Configure** had no `onClick` at all. `integrations.configure` takes an
 *   arbitrary `config` record and no provider states what it needs, so there is
 *   nothing to put in a form yet.
 * - **Schedule** read "Daily at 2:00 AM" from the fixture and would now read
 *   "Manual", which would promise a manual sync that does not exist.
 *
 * What is left is what the database actually knows: whether a provider was
 * recorded, and when.
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
  provider,
  connected,
  connectedAt,
  onConnect,
  onDisconnect,
  busy,
}: IntegrationCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              {providerIcons[provider] ?? <Plug className="h-8 w-8 text-muted-foreground" />}
            </div>
            <div>
              <h3 className="font-semibold">{name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{provider}</p>
            </div>
          </div>
          <Badge variant={connected ? "success" : "secondary"}>
            {connected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">{description}</p>
        {connected && (
          <>
            <Separator className="my-3" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Connected</span>
                <span>{connectedAt ? formatDate(connectedAt) : "Not recorded"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last sync</span>
                {/* Never a date. `integrations.syncStatus` answers
                    `not_synced` unconditionally and nothing in this repo
                    syncs, so there is no sync to date. */}
                <span className="text-muted-foreground">No sync recorded</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        {connected ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-muted-foreground hover:text-destructive"
            onClick={onDisconnect}
            disabled={busy}
          >
            <Unplug className="h-4 w-4 mr-2" />
            Disconnect
          </Button>
        ) : (
          <Button className="w-full" size="sm" onClick={onConnect} disabled={busy}>
            <Zap className="h-4 w-4 mr-2" />
            Connect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
