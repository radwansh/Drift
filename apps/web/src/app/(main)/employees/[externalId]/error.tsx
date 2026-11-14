"use client";

import { useEffect } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button, Notice } from "@/components/cv";

/**
 * The Employee File's page-level error, on Ink & Signal (canvas board
 * "Patterns", phase 5). A `Notice tone="danger"`: danger renders `role="alert"`,
 * so the failure is announced rather than only drawn.
 *
 * Both actions sit in the Notice body rather than its `action` slot, which is
 * `flex-none` — two buttons there take ~250px of a 390px screen and leave the
 * message almost no column at all. In the body they wrap beneath it.
 *
 * "Try again" is secondary and the back link ghost, which keeps the order of
 * emphasis the filled/outline pair had before.
 *
 * Copy, `reset()` and the console line are unchanged.
 */
export default function EmployeeFileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Employee File error:", error);
  }, [error]);

  return (
    <Notice tone="danger" title="Could not load this file">
      <p>
        Something went wrong while assembling this employee&apos;s year. Trying again usually works.
        An id that is not on this company&apos;s register will not load at all.
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
        <Button size="sm" variant="ghost" href="/employees" icon={<ArrowLeft aria-hidden="true" />}>
          Back to the list
        </Button>
      </div>
    </Notice>
  );
}
