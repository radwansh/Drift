import type { LucideIcon } from "lucide-react";
import { Button, EmptyState as CvEmptyState } from "@/components/cv";

/**
 * The old shared EmptyState API ({ icon, title, description, action: { label, onClick } }),
 * kept so existing call sites compile, drawn with the design system's EmptyState.
 *
 * The big icon in a grey circle is gone: the design system's empty state is the calm
 * drift strip. A passed `icon` is shown small, in ink-subtle, instead of the strip.
 * New code uses EmptyState from "@/components/cv" directly.
 */
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <CvEmptyState
      title={title}
      description={description}
      visual={Icon ? <Icon className="h-5 w-5 text-cv-ink-subtle" aria-hidden="true" /> : undefined}
      action={
        action ? (
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : undefined
      }
    />
  );
}
