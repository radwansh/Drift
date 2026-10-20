"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "./ui";
import { launch } from "@/config/launch";
import { EarlyAccessModal } from "./early-access-modal";

/**
 * The "Get early access" call to action — the header, the hero, each pricing
 * card and the final CTA all render this, so the four cannot drift apart.
 *
 * While `launch.waitlistMode` is on it opens the lead form; with the switch off
 * it becomes a plain link to /sign-up and the modal is never mounted. One
 * decision point for the whole page.
 *
 * A small client island on otherwise server-rendered sections, which keeps the
 * public pages statically rendered.
 */
export interface EarlyAccessButtonProps {
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  iconRight?: ButtonProps["iconRight"];
  className?: string;
}

export function EarlyAccessButton({ children, ...buttonProps }: EarlyAccessButtonProps) {
  const [open, setOpen] = useState(false);

  if (!launch.waitlistMode) {
    return (
      <Button href="/sign-up" {...buttonProps}>
        {children}
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} {...buttonProps}>
        {children}
      </Button>
      <EarlyAccessModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
