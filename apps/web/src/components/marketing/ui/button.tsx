import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";
import { DriftStrip } from "./drift-strip";

/**
 * Clarivo design-system Button, ported from
 * docs/landing/design-system/components/ (Button/README.md + bundle.css).
 *
 * The styles are rebuilt as Tailwind utilities on the cv- tokens rather than
 * importing bundle.css, which the hand-off README rules out: that stylesheet
 * reads unprefixed `var(--accent)` and `var(--primary)`, and shadcn/ui already
 * defines those names as HSL channel triplets. Loading both would corrupt
 * each other's colours.
 *
 * `href` renders a real anchor with the same look, which is what the marketing
 * page needs for every call to action.
 */

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cv-primary text-cv-on-primary hover:bg-cv-primary-hover",
  accent: "bg-cv-accent text-cv-on-accent hover:bg-cv-accent-hover",
  secondary: "bg-cv-surface text-cv-ink border-cv-border hover:bg-cv-surface-sunken",
  ghost: "bg-transparent text-cv-ink hover:bg-cv-surface-sunken",
  danger: "bg-cv-danger text-cv-on-danger hover:bg-cv-danger-hover",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px] leading-[18px]",
  md: "h-10 gap-2 px-4 text-sm leading-5",
  lg: "h-12 gap-2 px-5 text-[15px] leading-5",
};

const ICON_ONLY: Record<Size, string> = { sm: "w-8 px-0", md: "w-10 px-0", lg: "w-12 px-0" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** A destination: renders a real link with the same look. */
  href?: string;
  iconLeft?: IconName;
  /** Only `arrow-right`, and only on a forward-moving call to action. */
  iconRight?: IconName;
  iconOnly?: boolean;
  /** Swaps the left icon for a scanning drift strip and sets aria-busy. */
  loading?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  href,
  iconLeft,
  iconRight,
  iconOnly,
  loading,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const classes = cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-cv-md border border-transparent font-cv-sans font-semibold no-underline transition-colors",
    "focus-visible:outline-none focus-visible:shadow-cv-focus-ring",
    "disabled:cursor-not-allowed disabled:border-cv-line disabled:bg-cv-surface-sunken disabled:text-cv-ink-disabled",
    VARIANTS[variant],
    SIZES[size],
    iconOnly && ICON_ONLY[size],
    variant === "ghost" && "disabled:bg-transparent disabled:border-transparent",
    className,
  );

  const content = (
    <>
      {loading ? (
        <DriftStrip count={5} size="xs" animate="scan" />
      ) : (
        iconLeft && <Icon name={iconLeft} />
      )}
      {!iconOnly && <span>{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} />}
    </>
  );

  // An icon-only button needs a name; a string child is the sensible source.
  const iconOnlyLabel =
    iconOnly && !rest["aria-label"] && typeof children === "string" ? children : undefined;

  if (href) {
    const external = href.startsWith("http") || href.startsWith("mailto:");
    const anchorProps = {
      className: classes,
      "aria-label": rest["aria-label"] ?? iconOnlyLabel,
    };
    return external ? (
      <a href={href} {...anchorProps}>
        {content}
      </a>
    ) : (
      <Link href={href} {...anchorProps}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      aria-busy={loading ? true : undefined}
      aria-label={rest["aria-label"] ?? iconOnlyLabel}
      {...rest}
    >
      {content}
    </button>
  );
}
