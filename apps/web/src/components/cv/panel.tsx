import { cn } from "@/lib/utils";

/**
 * Panel — the design system's card with a heading, the unit every app screen is built
 * from (the canvas's `.cx-card`).
 *
 * - Outlined in `line`, radius-lg, `surface`, no shadow. Padded space-6.
 * - `title` is an <h2> in `heading` type (20/28, 600); `description` sits under it in
 *   ink-subtle; `actions` align right and wrap.
 * - `flush` drops the padding for a table or list that runs edge to edge; put a
 *   <PanelBar> (filters, counts) above it and a <PanelFoot> (pagination) below.
 * - `data-slot="card"` keeps the board-pack print rule (no breaks inside a card).
 */

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Smaller heading (16/24) for panels in a sidebar column or a dense grid. */
  compact?: boolean;
  flush?: boolean;
  /** Id for the heading, used for aria-labelledby. */
  headingId?: string;
}

export function Panel({
  title,
  description,
  actions,
  compact,
  flush,
  headingId,
  className,
  children,
  ...rest
}: PanelProps) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section
      data-slot="card"
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cn(
        "min-w-0 rounded-cv-lg border border-cv-line bg-cv-surface text-cv-ink",
        flush ? "p-0" : "p-6",
        className,
      )}
      {...rest}
    >
      {hasHead && (
        <div
          className={cn("flex flex-wrap items-start justify-between gap-4", flush && "px-6 pt-6")}
        >
          <div className="min-w-0">
            {title && (
              <h2
                id={headingId}
                className={cn(
                  "m-0 font-semibold text-cv-ink",
                  compact ? "text-base leading-6" : "text-xl leading-7 tracking-[-0.01em]",
                )}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="m-0 mt-0.5 text-sm leading-5 text-cv-ink-subtle">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children && (
        <div className={cn(hasHead && !flush && "mt-5", hasHead && flush && "mt-5")}>
          {children}
        </div>
      )}
    </section>
  );
}

/** A bar of filters or counts across the top of a flush panel. */
export function PanelBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-cv-line px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pagination or a summary line along the bottom of a flush panel. */
export function PanelFoot({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-cv-line px-4 py-3 text-[13px] leading-[18px] text-cv-ink-subtle",
        className,
      )}
    >
      {children}
    </div>
  );
}
