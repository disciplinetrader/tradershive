import type { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Visual tone for the icon halo. */
  tone?: "default" | "success" | "warning" | "danger";
  /** Compact reduces vertical padding for use inside dense cards. */
  compact?: boolean;
  className?: string;
}

const toneMap: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

function renderAction(action: EmptyStateAction | undefined, primary: boolean) {
  if (!action) return null;
  const className = primary
    ? "gradient-primary text-primary-foreground"
    : undefined;
  if (action.href) {
    return (
      <Button asChild variant={primary ? "default" : "outline"} className={className}>
        <a href={action.href}>{action.label}</a>
      </Button>
    );
  }
  return (
    <Button
      onClick={action.onClick}
      variant={primary ? "default" : "outline"}
      className={className}
    >
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "default",
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-surface/40 text-center",
        compact ? "px-6 py-10" : "px-8 py-16",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "mb-4 grid h-14 w-14 place-items-center rounded-2xl",
            toneMap[tone],
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {renderAction(action, true)}
          {renderAction(secondaryAction, false)}
        </div>
      ) : null}
    </div>
  );
}
