"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, AlertCircle, Info, ExternalLink } from "lucide-react";

interface AnomalyFlag {
  employeeId: string;
  employeeName: string;
  type: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

interface AnomalyFlagsPanelProps {
  anomalies?: AnomalyFlag[];
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
    badge: "destructive" as const,
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    badge: "warning" as const,
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
    badge: "info" as const,
    label: "Info",
  },
};

export function AnomalyFlagsPanel({ anomalies }: AnomalyFlagsPanelProps) {
  const grouped = anomalies
    ? [...anomalies].sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      })
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Anomaly Flags</CardTitle>
          {anomalies && (
            <span className="text-xs text-muted-foreground">
              {anomalies.length} flag{anomalies.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!grouped ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-3/4" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mr-2" />
            No anomalies detected
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map((flag, index) => {
              const config = severityConfig[flag.severity];
              const Icon = config.icon;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => console.log(`Navigate to employee: ${flag.employeeId} - ${flag.employeeName}`)}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${config.bg}`}
                >
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{flag.employeeName}</span>
                      <Badge variant={config.badge} className="text-[10px] px-1.5 py-0">
                        {config.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {flag.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
