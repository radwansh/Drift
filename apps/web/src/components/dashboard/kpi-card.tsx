"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  subtext?: string;
  iconName?: string;
  trend?: "up" | "down" | "neutral";
  onClick?: () => void;
  loading?: boolean;
}

const trendColors = {
  up: "text-green-600 dark:text-green-400",
  down: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
};

const trendIcons = {
  up: Icons.TrendingUp,
  down: Icons.TrendingDown,
  neutral: Icons.Minus,
};

function isLucideIcon(name: string): name is keyof typeof Icons {
  return name in Icons;
}

export function KpiCard({ title, value, subtext, iconName, trend = "neutral", onClick, loading }: KpiCardProps) {
  const TrendIcon = trend ? trendIcons[trend] : null;

  let IconComponent: React.ReactNode = null;
  if (iconName && isLucideIcon(iconName)) {
    const Icon = Icons[iconName];
    IconComponent = <Icon className="h-5 w-5 text-muted-foreground" />;
  }

  if (loading) {
    return (
      <Card className="cursor-default">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn("transition-shadow hover:shadow-md", onClick && "cursor-pointer")}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className={cn("text-2xl font-bold tracking-tight", trendColors[trend])}>
              {value}
            </p>
            {subtext && (
              <p className="text-xs text-muted-foreground truncate">{subtext}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {IconComponent && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                {IconComponent}
              </div>
            )}
            {TrendIcon && (
              <TrendIcon className={cn("h-4 w-4", trendColors[trend])} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
