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
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-fluid-2xl font-bold tracking-tight break-words sm:truncate">{title}</h1>
        {description ? (
          <p className="mt-1 line-clamp-2 text-fluid-sm text-muted-foreground sm:line-clamp-none">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:shrink-0 sm:items-center sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
