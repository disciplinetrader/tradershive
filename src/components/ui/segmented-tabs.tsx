import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented, single-row tab bar that scrolls horizontally on mobile
 * instead of wrapping. Modeled on the "Instrumental density" direction:
 * compact chips, active pill uses --primary, snap-x scrolling, no wrap.
 */
export type SegmentedTab = {
  to: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  exact?: boolean;
};

export function SegmentedTabs({
  tabs,
  pathname,
  className,
  size = "md",
}: {
  tabs: SegmentedTab[];
  pathname: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const sizeCls =
    size === "sm"
      ? "px-2.5 py-1 text-[11px]"
      : "px-3 py-1.5 text-xs sm:text-[13px]";
  return (
    <div className={cn("no-scrollbar -mx-1 overflow-x-auto px-1", className)}>
      <div className="inline-flex snap-x snap-mandatory items-center gap-1 rounded-md border border-border/60 bg-card/60 p-1">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.to
            : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition",
                sizeCls,
                active
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
                  : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
