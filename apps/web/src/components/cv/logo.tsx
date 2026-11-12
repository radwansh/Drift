import { cn } from "@/lib/utils";

/**
 * Logo — the Clarivo lockup, mark (the Drift C) or wordmark, from public/brand/.
 *
 * Rules from the brand book, which this component cannot enforce for you:
 * - One signal per mark: rust lives in the C's drifted segment (lockup, mark) or the
 *   square tittle (wordmark alone). Never two rust elements, never another colour.
 * - tone "brand" (Ink) on bg, surface and light photography; "reversed" (white) on the
 *   Ink side menu, surface-inverse and dark photography; "mono" on cobalt or rust grounds.
 * - Minimum: lockup 96px wide, mark 24px (use the favicon cut below that).
 * - Clear space: a quarter of the symbol's height on every side.
 * - Never rotate, stretch, outline, shadow or re-letter it, or set "Clarivo" in another
 *   typeface as a logo. In running text the name is "Clarivo"; the logo is lowercase.
 *
 * A plain <img> on purpose: next/image does not optimise SVG without
 * dangerouslyAllowSVG, so it would add a loader and a layout pass for no gain.
 * Decorative by default; pass `title` where it is the only naming of the brand.
 */

type Variant = "lockup" | "mark" | "wordmark";
type Tone = "brand" | "reversed" | "mono";

/** Intrinsic aspect ratios from each file's viewBox, so a height alone reserves space. */
const RATIO: Record<Variant, number> = {
  lockup: 3987 / 790,
  mark: 1,
  wordmark: 3071 / 750,
};

function file(variant: Variant, tone: Tone): string {
  const suffix = tone === "brand" ? "" : `-${tone}`;
  return `/brand/clarivo-${variant}${suffix}.svg`;
}

export interface LogoProps {
  variant?: Variant;
  tone?: Tone;
  height?: number;
  /** Accessible name. Omit to leave the logo decorative. */
  title?: string;
  className?: string;
}

export function Logo({
  variant = "lockup",
  tone = "brand",
  height = 24,
  title,
  className,
}: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={file(variant, tone)}
      alt={title ?? ""}
      width={Math.round(height * RATIO[variant])}
      height={height}
      style={{ height, width: "auto" }}
      className={cn("inline-block flex-none align-middle", className)}
      {...(title ? {} : { "aria-hidden": true })}
    />
  );
}
