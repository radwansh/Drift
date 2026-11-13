"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checkbox on the design system: radius-sm, the 3:1 `border` edge, filled Ink when
 * checked (paper in dark), cobalt focus ring. Always paired with a visible label.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-cv-border bg-cv-surface transition-colors",
      "focus-visible:outline-none focus-visible:shadow-cv-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-cv-primary data-[state=checked]:bg-cv-primary data-[state=checked]:text-cv-on-primary",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
