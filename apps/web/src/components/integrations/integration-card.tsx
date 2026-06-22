"use client";

import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/date";
import { Plug, Zap, Settings, RefreshCw, Unplug, Building2, Database, Cloud, Briefcase, Wallet } from "lucide-react";

const providerIcons: Record<string, React.ReactNode> = {
  sap: <Database className="h-8 w-8" />,
  adp: <Building2 className="h-8 w-8" />,
  sage: <Briefcase className="h-8 w-8" />,
  workday: <Cloud className="h-8 w-8" />,
  gusto: <Wallet className="h-8 w-8" />,
};

interface IntegrationCardProps {
  name: string;
  description: string;
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
  syncSchedule: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}

export function IntegrationCard({
  name,
  description,
  provider,
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Sync</span>
                <span>{lastSyncAt ? formatDate(lastSyncAt) : "Never"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schedule</span>
                <span>{syncSchedule ?? "Manual"}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        {connected ? (
          <div className="flex w-full gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={onDisconnect}>
              <Unplug className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button className="w-full" size="sm" onClick={onConnect}>
            <Zap className="h-4 w-4 mr-2" />
            Connect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
