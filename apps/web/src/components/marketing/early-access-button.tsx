"use client";

import { Button, type ButtonProps } from "./ui";
import { launch } from "@/config/launch";
import { useEarlyAccess } from "./early-access-provider";

/**
 * The page's primary call to action — the hero, both pricing cards, the final
 * CTA and the blog article's closing aside all render this, so they cannot
 * drift apart in where they lead.
 *
 * `launch.waitlistMode` is **off**, so this is a plain link to /sign-up today.
 * With the switch on it opens the early-access dialog owned by
 * `EarlyAccessProvider` instead. One decision point for the whole page.
 *
 * The label is not decided here: callers pass it, from `content.ts`
 * (`TRIAL_CTA`). The header is the one primary button that does not come
 * through this component — it is a shorter label and it never opened the
 * dialog's lead form, so it is a direct `<Button href="/sign-up">`.
 */
export interface EarlyAccessButtonProps {
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  iconRight?: ButtonProps["iconRight"];
  className?: string;
}

export function EarlyAccessButton({ children, ...buttonProps }: EarlyAccessButtonProps) {
  // Called before the branch, and `launch.waitlistMode` is a build-time
  // constant, so hook order is stable across renders either way.
  const { openEarlyAccess } = useEarlyAccess();

  if (!launch.waitlistMode) {
    return (
      <Button href="/sign-up" {...buttonProps}>
        {children}
      </Button>
    );
  }

  return (
    <Button onClick={openEarlyAccess} {...buttonProps}>
      {children}
    </Button>
  );
}
