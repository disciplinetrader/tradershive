import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
