"use client";

import { Sparkles } from "lucide-react";
import { Badge, Button, Icon, Panel, SummarySeverityBadge } from "@/components/cv";

interface AiSummaryBannerProps {
  narrative: {
    summary: string;
    highlights: string[];
    concerns: string[];
    severity: "routine" | "review" | "critical";
  };
  /**
   * Who wrote the text. The Dashboard's narrative is built from the comparison's figures
   * by `buildNarrative` on the page — no model is involved — so it says "Summary" with a
   * "Rule-based" badge. CLAUDE.md: the UI must not label rule-based text with a model
   * name. Pass "ai" only for text that came from Claude.
   */
  source?: "ai" | "rules";
  /** Offered only for AI text; a rule-based summary has nothing to regenerate. */
  onRegenerate?: () => void;
}

/**
 * The written read of a comparison (redesign canvas: Dashboard, left of the flags).
 *
 * A Panel, not a banner: no coloured left border (a stripe on a card is an AI trope the
 * design system rules out). Severity is a badge with its word. The summary is 15/24 at
 * most 68ch; highlights and concerns sit side by side under a hairline.
 */
export function AiSummaryBanner({
  narrative,
  source = "rules",
  onRegenerate,
}: AiSummaryBannerProps) {
  const isAi = source === "ai";
  const hasLists = narrative.highlights.length > 0 || narrative.concerns.length > 0;

  return (
    <Panel
      headingId="summary-h"
      compact
      title={
        <span className="inline-flex items-center gap-2">
          {isAi && <Sparkles className="h-5 w-5 text-cv-accent" aria-hidden="true" />}
          {isAi ? "AI summary" : "Summary"}
          <SummarySeverityBadge severity={narrative.severity} />
          {!isAi && <Badge tone="neutral">Rule-based</Badge>}
        </span>
      }
      actions={
        isAi && onRegenerate ? (
          <Button variant="ghost" size="sm" onClick={onRegenerate}>
            Regenerate
          </Button>
        ) : undefined
      }
    >
      <p className="m-0 max-w-[68ch] text-[15px] leading-6 text-cv-ink">{narrative.summary}</p>

      {hasLists && (
        <div className="mt-4 grid grid-cols-1 gap-5 border-t border-cv-line pt-4 md:grid-cols-2">
          <div>
            <h3 className="m-0 text-[13px] font-semibold leading-[18px] text-cv-ink">Highlights</h3>
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {narrative.highlights.length === 0 ? (
                <li className="flex items-start gap-2 text-sm leading-5 text-cv-ink-subtle">
                  <Icon name="minus" className="mt-0.5 flex-none" />
                  Nothing this period.
                </li>
              ) : (
                narrative.highlights.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-5 text-cv-ink-muted"
                  >
                    <Icon name="check-circle" className="mt-0.5 flex-none text-cv-success-ink" />
                    {item}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <h3 className="m-0 text-[13px] font-semibold leading-[18px] text-cv-ink">
              Worth a second look
            </h3>
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {narrative.concerns.length === 0 ? (
                <li className="flex items-start gap-2 text-sm leading-5 text-cv-ink-subtle">
                  <Icon name="minus" className="mt-0.5 flex-none" />
                  Nothing this period.
                </li>
              ) : (
                narrative.concerns.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-5 text-cv-ink-muted"
                  >
                    <Icon name="alert" className="mt-0.5 flex-none text-cv-warning-ink" />
                    {item}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
