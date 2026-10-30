"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { AnnualWarning } from "@saas/payroll-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnnualWarningsProps {
  warnings: AnnualWarning[];
  /** Opens the categorise dialog, for warnings whose fix is a recategorisation. */
  onCategorise?: () => void;
  /**
   * Step 12a: scrolls to the scenario view. `FORECAST_HOLDS_HEADCOUNT` has no
   * fix — the forecast cannot invent a hiring plan — so the action is to price
   * one, which the scenario card already does.
   */
  onOpenScenario?: () => void;
}

const SEVERITY_STYLES = {
  critical: { icon: AlertCircle, className: "anomaly-critical" },
  warning: { icon: AlertTriangle, className: "anomaly-warning" },
  info: { icon: Info, className: "anomaly-info" },
} as const;

/**
 * The data-quality strip (step 33, finding U2).
 *
 * v1 split the warning string on ":" and rendered the remainder, so the code was
 * lost and a missing June showed as a bare "Jun 2026" with no title explaining
 * what was wrong with it. Each line was its own `role="alert"`, so a screen
 * reader interrupted once per warning — five warnings, five interruptions.
 *
 * Warnings now arrive structured (step 19), so this renders a title, a detail
 * sentence, the affected items and a fix button, inside one polite live region.
 */
export function AnnualWarnings({ warnings, onCategorise, onOpenScenario }: AnnualWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <section aria-label="Data quality" className="flex flex-col gap-2" role="status" aria-live="polite">
      {warnings.map((warning) => {
        const meta = SEVERITY_STYLES[warning.severity];
        const Icon = meta.icon;

        return (
          <div
            key={`${warning.code}:${warning.items.join("|")}`}
            className={cn(
              "flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-start",
              meta.className,
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{warning.title}</p>
              <p className="text-muted-foreground">{warning.detail}</p>
              {warning.items.length > 0 && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {warning.items.join(", ")}
                </p>
              )}
            </div>

            {warning.action.type === "upload_period" && (
              <Button asChild size="sm" variant="outline" className="shrink-0 self-start">
                <Link href="/payroll-periods">Upload a period</Link>
              </Button>
            )}
            {warning.action.type === "open_categoriser" && onCategorise && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 self-start"
                onClick={onCategorise}
              >
                Categorise
              </Button>
            )}
            {warning.action.type === "open_scenario" && onOpenScenario && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 self-start"
                onClick={onOpenScenario}
              >
                Plan hiring
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}
