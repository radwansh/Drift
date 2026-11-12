import { cn } from "@/lib/utils";

/**
 * PageHeader — the top of every app screen, as drawn on the redesign canvas.
 *
 *   eyebrow   the section, in the product's words ("Dashboard", "Employee File")
 *   title     what is on screen, in `title` type ("July 2026 vs June 2026")
 *   lede      one plain sentence of context, ink-muted, max 72ch
 *   actions   the screen's buttons, right-aligned, wrapping under the title on a phone
 *
 * The title is the page's <h1>. Sentence case; no exclamation marks.
 */

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, lede, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="m-0 text-[13px] font-medium leading-[18px] text-cv-ink-subtle">{eyebrow}</p>
        )}
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-cv-ink">
          {title}
        </h1>
        {lede && (
          <p className="m-0 mt-1.5 max-w-[72ch] text-[15px] leading-6 text-cv-ink-muted">{lede}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
