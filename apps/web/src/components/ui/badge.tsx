import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Badge, re-skinned onto the design system's badge tones. Same API; each
 * variant lands on a tone:
 *
 *   default, secondary -> neutral      outline -> hairline neutral
 *   success -> success                  warning -> warning
 *   destructive -> danger               info -> accent (cobalt)
 *   signal (new) -> rust, for a flagged change above threshold
 *
 * Do NOT use success/destructive to show the direction of a change (a rise in pay is
 * not "success"); use <Variance> from "@/components/cv". New code can use the cv Badge,
 * which also draws the square signal mark and an icon.
 */
const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent px-2 text-xs font-semibold leading-4 tracking-[0.01em] transition-colors focus:outline-none focus-visible:shadow-cv-focus-ring",
  {
    variants: {
      variant: {
        default: "bg-cv-surface-sunken text-cv-ink-muted",
        secondary: "bg-cv-surface-sunken text-cv-ink-muted",
        destructive: "bg-cv-danger-soft text-cv-danger-ink",
        outline: "border-cv-line bg-transparent text-cv-ink-muted",
        success: "bg-cv-success-soft text-cv-success-ink",
        warning: "bg-cv-warning-soft text-cv-warning-ink",
        info: "bg-cv-accent-soft text-cv-accent",
        signal: "bg-cv-signal-soft text-cv-signal-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
