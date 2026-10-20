"use client";

import { Button, type ButtonProps } from "./ui";
import { launch } from "@/config/launch";
import { useEarlyAccess } from "./early-access-provider";

/**
 * The "Get early access" call to action — the header, the hero, each pricing
 * card and the final CTA all render this, so the four cannot drift apart.
 *
 * While `launch.waitlistMode` is on it opens the shared dialog owned by
 * `EarlyAccessProvider`; with the switch off it becomes a plain link to
 * /sign-up. One decision point for the whole page.
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
