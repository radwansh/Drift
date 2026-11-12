import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton blocks for content that is loading, on the sunken surface. An action that is
 * running shows the scanning drift strip instead (Button `loading` in "@/components/cv").
 * The pulse stops under prefers-reduced-motion.
 */
type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-cv-surface-sunken motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
