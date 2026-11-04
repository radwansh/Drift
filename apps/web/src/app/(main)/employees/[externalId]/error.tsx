"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-foreground">Could not load this file</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        Something went wrong while assembling this employee&apos;s year. Trying again usually
        works. An id that is not on this company&apos;s register will not load at all.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to the list
          </Link>
        </Button>
      </div>
    </div>
  );
}
