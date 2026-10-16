import { cn } from "@/lib/utils";

/**
 * DriftStrip — the brand's signature device: a baseline of ticks with one
 * drifted into signal rust. Ported from bundle.css (`.cv-drift`).
 *
 * The geometry is driven by four CSS custom properties per size, exactly as
 * the design system has it, because the lift distance has to stay tied to the
 * tick height: the container reserves `tick + lift` so a drifted tick never
 * clips. Expressing that in Tailwind utilities alone would need arbitrary
 * values that drift out of step with each other, so the sizes stay as a style
 * object.
 *
 * Animations respect prefers-reduced-motion through the rule in globals.css.
 */

type Size = "xs" | "sm" | "md" | "lg";

const SIZES: Record<Size, { w: string; gap: string; tick: string; lift: string }> = {
  xs: { w: "2px", gap: "2px", tick: "8px", lift: "4px" },
  sm: { w: "2px", gap: "3px", tick: "10px", lift: "5px" },
  md: { w: "3px", gap: "4px", tick: "16px", lift: "8px" },
  lg: { w: "4px", gap: "6px", tick: "28px", lift: "14px" },
};

export interface DriftStripProps {
  count?: number;
  /** Index of the drifted tick. Defaults to 70% along, as the design system does. */
  drift?: number;
  size?: Size;
  /** 'lift' plays once on entry; 'scan' is the loading state. */
  animate?: false | "lift" | "scan";
  /** Accessible name. Without it the strip is decorative and hidden. */
  label?: string;
  className?: string;
}

export function DriftStrip({
  count = 24,
  drift,
  size = "md",
  animate = false,
  label,
  className,
}: DriftStripProps) {
  const s = SIZES[size];
  const driftIndex = drift ?? Math.round(count * 0.7);

  return (
    <span
      className={cn(
        "cv-drift inline-flex items-end",
        animate === "lift" && "cv-drift--lift",
        animate === "scan" && "cv-drift--scan",
        className,
      )}
      style={{
        gap: s.gap,
        height: `calc(${s.tick} + ${s.lift})`,
        // Read by the keyframes in globals.css.
        ["--cv-lift" as string]: s.lift,
      }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {Array.from({ length: count }, (_, i) => {
        const drifted = i === driftIndex;
        return (
          <span
            key={i}
            className={cn("cv-drift__tick block flex-none rounded-[1px]", drifted && "cv-drift__tick--drift")}
            style={{
              width: s.w,
              height: s.tick,
              ...(drifted ? { transform: `translateY(calc(-1 * ${s.lift}))` } : null),
            }}
          />
        );
      })}
    </span>
  );
}
