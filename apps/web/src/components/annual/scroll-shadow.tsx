"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollShadowProps {
  children: ReactNode;
  className?: string;
}

/**
 * A horizontally scrollable region that says so (step 36, finding U9).
 *
 * At 390px the tables hid columns behind an unmarked overflow: there was no
 * scrollbar, no shadow and no hint, so the columns past the edge were simply
 * invisible. A gradient on each side appears only when there is more to see, and
 * the region is keyboard focusable so it can be scrolled without a pointer.
 */
export function ScrollShadow({ children, className }: ScrollShadowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        onScroll={update}
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
        className="max-h-[28rem] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </div>
      {edges.left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      )}
    </div>
  );
}
