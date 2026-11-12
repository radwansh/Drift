import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Alert, re-skinned to look exactly like the design system's Notice: a soft
 * ground, no border, no left stripe, radius-md, the icon in the tone's ink, the words
 * in ink. Same API (variant default | destructive | warning | info, plus success).
 *
 * New code uses <Notice> from "@/components/cv", which picks the right icon itself.
 * Here the caller still passes the Lucide icon as the first child, as before.
 */
const alertVariants = cva(
  "relative w-full rounded-md border-0 px-4 py-3 text-sm leading-5 text-cv-ink [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3 [&>svg]:h-5 [&>svg]:w-5 [&>svg~*]:pl-8",
  {
    variants: {
      variant: {
        default: "bg-cv-accent-soft [&>svg]:text-cv-accent",
        info: "bg-cv-accent-soft [&>svg]:text-cv-accent",
        success: "bg-cv-success-soft [&>svg]:text-cv-success-ink",
        warning: "bg-cv-warning-soft [&>svg]:text-cv-warning-ink",
        destructive: "bg-cv-danger-soft [&>svg]:text-cv-danger-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-0.5 font-semibold leading-5 text-cv-ink", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm leading-5 text-cv-ink [&_p]:leading-5", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
