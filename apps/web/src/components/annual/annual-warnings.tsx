"use client";

import type { AnnualWarning } from "@saas/payroll-core";
import { Button, Notice, type NoticeTone } from "@/components/cv";

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

/** Severity maps to a Notice tone; nothing on this strip is ever colour alone. */
const SEVERITY_TONE: Record<AnnualWarning["severity"], NoticeTone> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

/**
 * The data-quality strip (step 33, finding U2), on Ink & Signal.
 *
 * v1 split the warning string on ":" and rendered the remainder, so the code was
 * lost and a missing June showed as a bare "Jun 2026" with no title explaining
 * what was wrong with it. Each line was its own `role="alert"`, so a screen
 * reader interrupted once per warning — five warnings, five interruptions.
 *
 * Warnings arrive structured (step 19), so this renders a title, a detail
 * sentence, the affected items and a fix button, inside one polite live region.
 * `Notice` keeps that: the tones the engine actually produces today are `info`
 * and `warning`, both of which render `role="status"` inside the polite region
 * rather than interrupting.
 */
export function AnnualWarnings({ warnings, onCategorise, onOpenScenario }: AnnualWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <section
      aria-label="Data quality"
      className="flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {warnings.map((warning) => {
        const action =
          warning.action.type === "upload_period" ? (
            <Button size="sm" variant="secondary" href="/payroll-periods">
              Upload a period
            </Button>
          ) : warning.action.type === "open_categoriser" && onCategorise ? (
            <Button size="sm" variant="secondary" onClick={onCategorise}>
              Categorise
            </Button>
          ) : warning.action.type === "open_scenario" && onOpenScenario ? (
            <Button size="sm" variant="secondary" onClick={onOpenScenario}>
              Plan hiring
            </Button>
          ) : undefined;

        return (
          <Notice
            key={`${warning.code}:${warning.items.join("|")}`}
            tone={SEVERITY_TONE[warning.severity]}
            title={warning.title}
            action={action}
          >
            <p className="text-cv-ink-muted">{warning.detail}</p>
            {warning.items.length > 0 && (
              /* A div, not a <p>: Notice zeroes the margin of every <p> it
                 holds, so a margin here would never apply. */
              <div className="mt-1 break-words text-xs leading-4 text-cv-ink-subtle">
                {warning.items.join(", ")}
              </div>
            )}
          </Notice>
        );
      })}
    </section>
  );
}
