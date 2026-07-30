import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, EyeOff, MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function WidgetShell({
  id,
  title,
  description,
  icon: Icon,
  actions,
  children,
  collapsed,
  onToggleCollapsed,
  onHide,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: (id: string) => void;
  onHide?: (id: string) => void;
  className?: string;
}) {
  return (
    <GlassCard className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onToggleCollapsed ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onToggleCollapsed(id)}
              aria-label={collapsed ? "Expand widget" : "Collapse widget"}
            >
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
              />
            </Button>
          ) : null}
          {onHide ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Widget menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onHide(id)}>
                  <EyeOff className="mr-2 h-4 w-4" /> Hide widget
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <div className="p-5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}
