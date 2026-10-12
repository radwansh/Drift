"use client";

import { Sparkles, RefreshCw, Loader2, Info, TriangleAlert } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AnnualInsightsProps {
  summary: AnnualSummary;
}

export function AnnualInsights({ summary }: AnnualInsightsProps) {
  const utils = trpc.useUtils();

  const scope = {
    year: summary.year,
    periodType: summary.periodType,
    currency: summary.currency,
    forecastMethod: summary.forecastMethod,
  };

  // Reading the cache is now side-effect free (step 23), so refetching on mount
  // or window focus can no longer spend tokens.
  const insightsQuery = trpc.annual.getInsights.useQuery(scope, {
    enabled: summary.coverage.uploaded > 0,
  });

  const generate = trpc.annual.generateInsights.useMutation({
    onSuccess: () => utils.annual.getInsights.invalidate(scope),
  });

  const data = insightsQuery.data;
  const bullets: string[] = generate.data?.bullets ?? data?.bullets ?? [];
  const source = generate.data?.source ?? data?.source ?? null;
  const model = generate.data?.model ?? data?.model ?? null;
  const generatedAt = generate.data?.generatedAt ?? data?.generatedAt ?? null;
  const isBusy = insightsQuery.isLoading || generate.isPending;
  const canGenerate = data?.canGenerate ?? false;
  const aiEnabled = data?.aiEnabled ?? true;

  const setAiEnabled = trpc.annual.setAiEnabled.useMutation({
    onSuccess: () => utils.annual.getInsights.invalidate(scope),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              Annual insights
              {/* Rule-based text is never labelled with a model name (finding U7). */}
              {source === "ai" && model && <Badge variant="secondary">{model}</Badge>}
              {source === "rules" && <Badge variant="outline">Rule-based</Badge>}
            </CardTitle>
            <CardDescription>
              A short written read of this year&apos;s payroll numbers.
            </CardDescription>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy || !canGenerate}
          onClick={() => generate.mutate(scope)}
          aria-label="Generate annual insights"
        >
          {generate.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {bullets.length > 0 ? "Regenerate" : "Generate"}
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        {generate.error && (
          <p className="mb-3 flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {generate.error.data?.code === "TOO_MANY_REQUESTS"
              ? "Generation is limited to 5 per hour for this company. Try again later."
              : generate.error.data?.code === "FORBIDDEN"
                ? "Generating insights requires the admin or manager role."
                : generate.error.message}
          </p>
        )}

        {isBusy && bullets.length === 0 ? (
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
                Generated{" "}
                {new Date(generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {source === "rules" && " · written from the figures, without a model"}
              </p>
            )}
          </>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {!aiEnabled
              ? "AI is switched off for this company. A summary written from the figures is still available."
              : canGenerate
                ? "No insights yet. Generate writes a short read of this year's figures."
                : "Insights need an Anthropic API key. Without one, a summary is written from the figures instead."}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          {/* A privacy note that is actually true in both states. v1 claimed data
              never left the company even when a key was configured (finding U7). */}
          <p className="min-w-0 text-xs text-muted-foreground">
            {aiEnabled && canGenerate
              ? "Generating sends the aggregated figures on this page — totals by category, department and period — to Anthropic. No employee names or individual records are sent."
              : "Nothing is sent to Anthropic. The summary is written from the figures in your database."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={setAiEnabled.isPending}
            onClick={() => setAiEnabled.mutate({ enabled: !aiEnabled })}
          >
            {setAiEnabled.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {aiEnabled ? "Turn AI off for this company" : "Turn AI on"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
