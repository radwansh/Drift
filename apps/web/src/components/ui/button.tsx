import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, re-skinned onto Ink & Signal. Same API as before (variant, size,
 * asChild), so the 80+ existing call sites keep working; each variant now draws the
 * design system's button:
 *
 *   default      -> primary (Ink). The one main action on a screen.
 *   outline      -> secondary (surface, 3:1 border).
 *   secondary    -> secondary as well; shadcn's filled grey has no place in the system.
 *   ghost        -> ghost.
 *   destructive  -> danger (crimson). Destructive confirmations only.
 *   link         -> a cobalt text link.
 *   success, warning -> kept for compatibility (nothing uses them) and drawn as
 *                   primary/secondary: the system has no green or amber buttons, and a
 *                   button is never filled with rust.
 *
 * Heights follow the controls scale: sm 32, default 40, lg 48, icon 40x40.
 * New code can use Button from "@/components/cv" (icons, loading strip, href).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-transparent text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:shadow-cv-focus-ring disabled:pointer-events-none disabled:border-cv-line disabled:bg-cv-surface-sunken disabled:text-cv-ink-disabled",
  {
    variants: {
      variant: {
        default: "bg-cv-primary text-cv-on-primary hover:bg-cv-primary-hover",
        destructive: "bg-cv-danger text-cv-on-danger hover:bg-cv-danger-hover",
        outline: "border-cv-border bg-cv-surface text-cv-ink hover:bg-cv-surface-sunken",
        secondary: "border-cv-border bg-cv-surface text-cv-ink hover:bg-cv-surface-sunken",
        ghost:
          "text-cv-ink hover:bg-cv-surface-sunken disabled:border-transparent disabled:bg-transparent",
        link: "h-auto border-0 px-0 text-cv-accent underline-offset-4 hover:text-cv-accent-hover hover:underline disabled:bg-transparent",
        success: "bg-cv-primary text-cv-on-primary hover:bg-cv-primary-hover",
        warning: "border-cv-border bg-cv-surface text-cv-ink hover:bg-cv-surface-sunken",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px] leading-[18px]",
        lg: "h-12 px-5 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
