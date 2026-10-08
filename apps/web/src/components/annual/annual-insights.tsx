"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, Loader2, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AnnualSummary } from "@saas/payroll-core";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface AnnualInsightsProps {
  summary: AnnualSummary;
}

export function AnnualInsights({ summary }: AnnualInsightsProps) {
  const [runId, setRunId] = useState(0);

  const insightsQuery = trpc.annual.getInsights.useQuery(
    {
      year: summary.year,
      periodType: summary.periodType,
      currency: summary.currency,
      forecastMethod: summary.forecastMethod,
      force: runId > 0,
      runId,
    },
    {
      enabled: summary.coverage.uploaded > 0,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  );

  const bullets = insightsQuery.data?.bullets ?? [];
  const isLoading = insightsQuery.isLoading || insightsQuery.isFetching;
  const generatedAt = insightsQuery.data?.generatedAt;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <CardTitle className="text-sm font-semibold">AI insights</CardTitle>
            <CardDescription>Aggregated payroll numbers, regenerated on demand · cache by year + method</CardDescription>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLoading || insightsQuery.data === undefined}
          onClick={() => setRunId((r) => r + 1)}
          aria-label="Regenerate AI insights"
        >
          {insightsQuery.isFetching && runId > 0 ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Regenerate
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        {isLoading && insightsQuery.data === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : bullets.length > 0 ? (
          <>
            <ul className="space-y-2">
              {bullets.map((bullet, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {generatedAt && (
              <p className="mt-3 text-xs text-muted-foreground">
                Generated {new Date(generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {" · "}
                {insightsQuery.data?.model}
              </p>
            )}
          </>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            AI insights are unavailable (no API key configured, or the model returned nothing). Data is never sent
            outside the company without an API key.
          </p>
        )}
      </CardContent>
    </Card>
  );
}