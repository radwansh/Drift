import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

/**
 * Notice — an inline message on a soft ground, ported from the design system's bundle.
 *
 * - info (cobalt): context the reader should know ("Rule-based summary: AI is off").
 * - success: something finished ("Upload complete. 20 employees saved.").
 * - warning: worth a look before going on ("This file and the annual dashboard will
 *   differ for this employee").
 * - danger: something failed or is impossible ("Could not run the comparison").
 *
 * Always an icon plus words; never colour alone. `danger` is role="alert" so it is
 * announced; the others are role="status". Radius md, no border, no left stripe.
 * Replaces components/ui/alert in app code.
 */

export type NoticeTone = "info" | "success" | "warning" | "danger";

const TONE: Record<NoticeTone, { ground: string; icon: string; name: IconName }> = {
  info: { ground: "bg-cv-accent-soft", icon: "text-cv-accent", name: "info" },
  success: { ground: "bg-cv-success-soft", icon: "text-cv-success-ink", name: "check-circle" },
  warning: { ground: "bg-cv-warning-soft", icon: "text-cv-warning-ink", name: "alert" },
  danger: { ground: "bg-cv-danger-soft", icon: "text-cv-danger-ink", name: "x-circle" },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** A button or link at the end, e.g. <Button size="sm" variant="secondary">Retry</Button>. */
  action?: React.ReactNode;
  className?: string;
}

export function Notice({ tone = "info", title, children, action, className }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-cv-md px-4 py-3 font-cv-sans text-sm leading-5 text-cv-ink",
        t.ground,
        className,
      )}
    >
      <Icon name={t.name} size={20} className={cn("mt-0 flex-none", t.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children && (
          <div className={cn(title && "mt-0.5", "text-cv-ink [&_p]:m-0")}>{children}</div>
        )}
      </div>
      {action && <div className="flex flex-none items-center gap-2 self-center">{action}</div>}
    </div>
  );
}
