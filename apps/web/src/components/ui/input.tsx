import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Input, re-skinned to the design system's field control: 40px, 15px text,
 * the 3:1 `border` edge (darkens on hover), cobalt focus ring, ink-subtle placeholder,
 * crimson edge when aria-invalid. Same API as before.
 *
 * Pair it with a visible <label> (or use TextField from "@/components/cv", which
 * brings the label, hint and error message with it).
 */
type InputType = "text" | "email" | "password" | "number";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  type?: InputType;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-cv-border bg-cv-surface px-3 py-2 text-[15px] leading-6 text-cv-ink transition-[border-color,box-shadow]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-cv-ink",
          "placeholder:text-cv-ink-subtle hover:border-cv-ink-muted",
          "focus-visible:border-cv-accent focus-visible:shadow-cv-focus-ring focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:bg-cv-surface-sunken disabled:text-cv-ink-disabled",
          "aria-[invalid=true]:border-cv-danger",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
