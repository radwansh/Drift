import { cn } from "@/lib/utils";

/**
 * DriftStrip — the signature device: a baseline of ticks with one drifted tick in rust.
 * Everything lines up except the change that matters.
 *
 * Uses:
 * - an empty or "nothing above your thresholds" state, still (animate={false});
 * - the result of a finished comparison, lifting into place once (animate="lift");
 * - loading, scanning (animate="scan") — Button's `loading` prop uses this at size xs.
 *
 * The keyframes live in globals.css because they read --cv-lift, which is set here per
 * size so the lift always matches the tick height. prefers-reduced-motion stops both.
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
  /** Index of the drifted tick. Defaults to 70% along. */
  drift?: number;
  size?: Size;
  animate?: false | "lift" | "scan";
  /** Accessible name. Omit to leave the strip decorative. */
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
  // While scanning there is no drifted tick: nothing has been found yet.
  const driftIndex = animate === "scan" ? -1 : (drift ?? Math.round((count - 1) * 0.7));

  return (
    <span
      className={cn(
        // Ticks paint in currentColor at 45% (globals.css), which on ink reads as the
        // delta-flat grey; the drifted tick is always rust.
        "cv-drift inline-flex items-end",
        animate === "lift" && "cv-drift--lift",
        animate === "scan" && "cv-drift--scan",
        className,
      )}
      style={{
        gap: s.gap,
        height: `calc(${s.tick} + ${s.lift})`,
        ["--cv-lift" as string]: s.lift,
      }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {Array.from({ length: count }, (_, i) => {
        const drifted = i === driftIndex;
        return (
          <span
            key={i}
            className={cn(
              "cv-drift__tick block flex-none rounded-[1px]",
              drifted && "cv-drift__tick--drift",
            )}
            style={{
              width: s.w,
              height: s.tick,
              ...(drifted && animate !== "lift"
                ? { transform: `translateY(calc(-1 * ${s.lift}))` }
                : null),
              ...(animate === "scan" ? { animationDelay: `${i * 90}ms` } : null),
            }}
          />
        );
      })}
    </span>
  );
}
