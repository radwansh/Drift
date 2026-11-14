import { cn } from "@/lib/utils";
import { DriftStrip } from "@/components/cv";

/**
 * Loading is the scanning drift strip (design system, Motion), not a spinner. The names
 * stay so existing imports keep working. prefers-reduced-motion stops the scan.
 */
export function LoadingSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center text-cv-ink", className)}>
      <DriftStrip count={9} size="sm" animate="scan" label={label} />
    </div>
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center" aria-busy="true">
      <div className="flex flex-col items-center gap-4 text-center text-cv-ink">
        <DriftStrip count={24} size="lg" animate="scan" label={label} />
        <p className="m-0 text-sm leading-5 text-cv-ink-subtle">{label}…</p>
      </div>
    </div>
  );
}
