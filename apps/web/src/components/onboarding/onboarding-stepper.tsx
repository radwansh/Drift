"use client";

import { Icon } from "@/components/cv";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from "@/lib/onboarding-options";

/**
 * "Step N of 5" and the five labels.
 *
 * **An ordered list, not a row of divs.** A screen reader reads it as five
 * items with their names, the current one carries `aria-current="step"`, and a
 * completed one is announced by its visually hidden "Completed" word rather
 * than by the tick alone — the design system's rule that a status colour never
 * carries a meaning on its own applies to a shape just as much.
 *
 * The numbered count is spelled out in text as well as drawn, because the row
 * of labels collapses on a phone and the sentence is what is left.
 */
export function OnboardingStepper({ current }: { current: number }) {
  return (
    <nav aria-label="Onboarding progress" className="flex flex-col gap-3">
      <p className="m-0 font-cv-mono text-[13px] leading-[18px] text-cv-ink-subtle">
        Step {current} of {ONBOARDING_STEP_COUNT}
      </p>

      <ol className="m-0 flex list-none flex-wrap gap-x-2 gap-y-2 p-0">
        {ONBOARDING_STEPS.map((step, index) => {
          const number = index + 1;
          const done = number < current;
          const active = number === current;

          return (
            <li
              key={step.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-cv-md px-2 py-1 text-[13px] leading-[18px]",
                active && "bg-cv-accent-soft font-semibold text-cv-accent",
                done && "text-cv-ink-muted",
                !active && !done && "text-cv-ink-subtle",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 flex-none items-center justify-center rounded-full font-cv-mono text-[11px]",
                  active && "bg-cv-accent text-cv-on-accent",
                  done && "bg-cv-success-soft text-cv-success-ink",
                  !active && !done && "bg-cv-surface-sunken text-cv-ink-subtle",
                )}
              >
                {done ? <Icon name="check" size={12} /> : number}
              </span>
              <span className="truncate">{step.label}</span>
              {done && <span className="sr-only">Completed</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
