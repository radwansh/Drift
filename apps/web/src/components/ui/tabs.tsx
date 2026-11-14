"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tabs, re-skinned to the design system's SegmentedControl look: a sunken
 * track, the active option raised on `surface` with shadow-sm and a `line` ring.
 * For page-level sub-navigation (the Settings tabs) use links with aria-current and
 * the underline style shown on the canvas instead.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-0.5 rounded-md border border-cv-line bg-cv-surface-sunken p-[3px] text-cv-ink-muted",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-sm px-3 text-[13px] font-semibold leading-[18px] text-cv-ink-muted transition-colors hover:text-cv-ink",
      "focus-visible:outline-none focus-visible:shadow-cv-focus-ring disabled:pointer-events-none disabled:text-cv-ink-disabled",
      "data-[state=active]:bg-cv-surface data-[state=active]:text-cv-ink data-[state=active]:shadow-cv-sm data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-cv-line",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 rounded-sm focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
