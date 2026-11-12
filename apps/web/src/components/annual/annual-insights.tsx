"use client";

import { Sparkles, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AnnualSummary } from "@saas/payroll-core";
import { Badge, Button, Icon, Notice, Panel } from "@/components/cv";
import { Skeleton } from "@/components/ui/skeleton";

interface AnnualInsightsProps {
  summary: AnnualSummary;
}

/**
 * The written read of the year, on Ink & Signal.
 *
 * `generateAnnualInsights` returns `{ bullets, source }`, and **rule-based text
 * is never labelled with a model name** (finding U7, CLAUDE.md): a model badge
 * appears only when `source === "ai"`, and a "Rule-based" badge otherwise. The
 * two are different claims about where the sentences came from.
 */
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
    <Panel
      compact
      headingId="annual-insights-h"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-cv-accent" aria-hidden="true" />
          Annual insights
          {source === "ai" && model && <Badge tone="neutral">{model}</Badge>}
          {source === "rules" && <Badge tone="neutral">Rule-based</Badge>}
        </span>
      }
      description="A short written read of this year's payroll numbers."
      actions={
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<RefreshCw aria-hidden="true" />}
          loading={generate.isPending}
          disabled={isBusy || !canGenerate}
          onClick={() => generate.mutate(scope)}
          aria-label="Generate annual insights"
        >
          {bullets.length > 0 ? "Regenerate" : "Generate"}
        </Button>
      }
    >
      {generate.error && (
        <Notice tone="danger" className="mb-3">
          {generate.error.data?.code === "TOO_MANY_REQUESTS"
            ? "Generation is limited to 5 per hour for this company. Try again later."
            : generate.error.data?.code === "FORBIDDEN"
              ? "Generating insights requires the admin or manager role."
              : generate.error.message}
        </Notice>
      )}

      {isBusy && bullets.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : bullets.length > 0 ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-cv-ink">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-cv-ink" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          {generatedAt && (
            <p className="m-0 mt-3 text-xs leading-4 text-cv-ink-subtle">
              Generated{" "}
              {new Date(generatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {source === "rules" && " · written from the figures, without a model"}
            </p>
          )}
        </>
      ) : (
        <p className="m-0 flex items-start gap-2 text-sm leading-5 text-cv-ink-muted">
          <Icon name="info" size={20} className="mt-0 flex-none text-cv-ink-subtle" />
          {!aiEnabled
            ? "AI is switched off for this company. A summary written from the figures is still available."
            : canGenerate
              ? "No insights yet. Generate writes a short read of this year's figures."
              : "Insights need an Anthropic API key. Without one, a summary is written from the figures instead."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cv-line pt-3">
        {/* A privacy note that is actually true in both states. v1 claimed data
            never left the company even when a key was configured (finding U7). */}
        <p className="m-0 min-w-0 flex-1 text-xs leading-4 text-cv-ink-subtle">
          {aiEnabled && canGenerate
            ? "Generating sends the aggregated figures on this page — totals by category, department and period — to Anthropic. No employee names or individual records are sent."
            : "Nothing is sent to Anthropic. The summary is written from the figures in your database."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={setAiEnabled.isPending}
          disabled={setAiEnabled.isPending}
          onClick={() => setAiEnabled.mutate({ enabled: !aiEnabled })}
        >
          {aiEnabled ? "Turn AI off for this company" : "Turn AI on"}
        </Button>
      </div>
    </Panel>
  );
}
