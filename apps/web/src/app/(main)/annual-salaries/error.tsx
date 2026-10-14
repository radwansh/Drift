"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-foreground">Could not load annual salaries</h2>
      {/* A plain message. Printing error.message put raw internals — SQL
          fragments, stack-ish text — in front of the user (finding U15); the
          detail still goes to the console above for whoever is debugging. */}
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        Something went wrong while building this year&apos;s figures. Trying again usually works.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button className="mt-6" onClick={reset}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}