"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Notice } from "@/components/cv";

/**
 * Without this file a thrown FORBIDDEN surfaces as the root error boundary,
 * which replaces the whole shell — sidebar included — for what is one screen
 * failing.
 *
 * On Ink & Signal it is a `Notice tone="danger"` (canvas board "Patterns",
 * phase 5): danger renders `role="alert"`, so the failure is announced rather
 * than only drawn. The action sits in the body, not in the Notice's `action`
 * slot, which is `flex-none` and would squeeze the message at phone widths.
 *
 * Copy, `reset()` and the console line are unchanged.
 */
export default function EmployeesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Employee File list error:", error);
  }, [error]);

  return (
    <Notice tone="danger" title="Could not load the employee list">
      {/* A plain message. Printing error.message put raw internals — SQL
          fragments, stack-ish text — in front of the user on the annual page;
          the detail still goes to the console above for whoever is debugging. */}
      <p>
        Something went wrong while listing this range&apos;s employees. Trying again usually works.
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
