import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Canonical page header — responsive by construction.
 * Mobile: two-column grid so actions never wrap under the title and
 * the title always truncates instead of pushing actions off-screen.
 * ≥ sm : promotes to flex row, actions can wrap.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-fluid-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 line-clamp-2 text-fluid-sm text-muted-foreground sm:line-clamp-none">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
