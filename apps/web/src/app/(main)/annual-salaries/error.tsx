"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Notice } from "@/components/cv";

/**
 * The page-level error, on Ink & Signal (canvas board "Patterns", phase 5).
 *
 * A `Notice tone="danger"` rather than a centred icon in a circle: danger renders
 * `role="alert"`, so the failure is announced instead of only drawn, and the
 * screen keeps the shell around it.
 *
 * The actions sit in the Notice body, not in its `action` slot. That slot is
 * `flex-none` and holds its buttons beside the text, which at 390px leaves the
 * message a column barely twenty characters wide; inside the body they wrap
 * under it and the text keeps the full width.
 *
 * Copy, `reset()` and the console line are unchanged.
 */
export default function AnnualSalariesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Annual Salaries error:", error);
  }, [error]);

  return (
    <Notice tone="danger" title="Could not load annual salaries">
      {/* A plain message. Printing error.message put raw internals — SQL
          fragments, stack-ish text — in front of the user (finding U15); the
          detail still goes to the console above for whoever is debugging. */}
      <p>
        Something went wrong while building this year&apos;s figures. Trying again usually works.
      </p>
      {error.digest && (
        /* A div, not a <p>: Notice zeroes the margin of every <p> it holds. */
        <div className="mt-1 break-words font-cv-mono text-xs leading-4 text-cv-ink-subtle">
          Reference: {error.digest}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<RefreshCw aria-hidden="true" />}
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </Notice>
  );
}
