import { cn } from "@/lib/utils";

/**
 * Logo — the Clarivo lockup, mark or wordmark.
 *
 * Rendered as an <img> against the SVG files in public/brand/ rather than
 * inlining the paths. The hand-off ships nine logo files already split by
 * variant and tone, so inlining would duplicate artwork that is versioned
 * next to the brand book and would need re-copying whenever it changes.
 *
 * Decorative by default: the wordmark spells "Clarivo", so when the logo sits
 * beside the company name in a header it is announced twice unless hidden.
 * Pass `title` where it is the only naming of the brand.
 */

type Variant = "lockup" | "mark" | "wordmark";
type Tone = "brand" | "reversed" | "mono";

/**
 * Intrinsic aspect ratios, so a height alone gives the browser a width and the
 * header reserves the right space before the SVG loads. Read from each file's
 * viewBox: lockup `0 -755 3987 790`, mark `12 12 96 96`, wordmark
 * `20 -740 3071 750`.
 */
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

export function Logo({ variant = "lockup", tone = "brand", height = 24, title, className }: LogoProps) {
  return (
    // Deliberately a plain <img>: next/image does not optimise SVG without
    // dangerouslyAllowSVG, so it would add a loader and a layout pass for no
    // gain. This trips @next/next/no-img-element as a warning, which three
    // other components in this repo already carry for the same reason.
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
