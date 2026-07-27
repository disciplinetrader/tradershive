import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";

export function SectionCard({
  title,
  description,
  icon,
  action,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-3 px-5 py-4">
        {icon ? <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div> : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left transition hover:text-primary"
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-tight">{title}</div>
            {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {action ? <div className="ml-2 shrink-0">{action}</div> : null}
      </div>
      {open ? <div className="border-t border-border/50 p-5">{children}</div> : null}
    </GlassCard>
  );
}
