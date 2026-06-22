"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, ChevronDown, ChevronUp, RotateCw, AlertTriangle, Info } from "lucide-react";

interface AiSummaryBannerProps {
  narrative: {
    summary: string;
    highlights: string[];
    concerns: string[];
    severity: "routine" | "review" | "critical";
  };
  onRegenerate: () => void;
}

export function AiSummaryBanner({ narrative, onRegenerate }: AiSummaryBannerProps) {
  const [showHighlights, setShowHighlights] = useState(true);
  const [showConcerns, setShowConcerns] = useState(true);

  const severityColors = {
    routine: "border-l-green-500",
    review: "border-l-amber-500",
    critical: "border-l-red-500",
  };

  const severityBadge = {
    routine: { variant: "success" as const, label: "Routine" },
    review: { variant: "warning" as const, label: "Review" },
    critical: { variant: "destructive" as const, label: "Critical" },
  };

  const badge = severityBadge[narrative.severity];
  const borderColor = severityColors[narrative.severity];

  return (
    <Card className={`border-l-4 ${borderColor} p-0`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm">AI Summary</h3>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{narrative.summary}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRegenerate} className="shrink-0">
            <RotateCw className="h-4 w-4 mr-1" />
            Regenerate
          </Button>
        </div>

        {(narrative.highlights.length > 0 || narrative.concerns.length > 0) && (
          <Separator className="my-4" />
        )}

        <div className="space-y-3">
          {narrative.highlights.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHighlights(!showHighlights)}
                className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 hover:underline"
              >
                {showHighlights ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Highlights ({narrative.highlights.length})
              </button>
              {showHighlights && (
                <ul className="mt-2 space-y-1">
                  {narrative.highlights.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Info className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {narrative.concerns.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowConcerns(!showConcerns)}
                className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                {showConcerns ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Concerns ({narrative.concerns.length})
              </button>
              {showConcerns && (
                <ul className="mt-2 space-y-1">
                  {narrative.concerns.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
