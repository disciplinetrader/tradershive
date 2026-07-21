import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";
import { Brain, ClipboardList, LineChart, Sparkles, Target, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/ai/coach", label: "Overview", icon: Sparkles, exact: true },
  { to: "/ai/coach/profile", label: "Profile", icon: User },
  { to: "/ai/coach/mistakes", label: "Mistakes", icon: ClipboardList },
  { to: "/ai/coach/homework", label: "Homework", icon: Target },
  { to: "/ai/coach/reports", label: "Reports", icon: Brain },
  { to: "/ai/coach/evolution", label: "Evolution", icon: LineChart },
] as const;

export const Route = createFileRoute("/_authenticated/ai/coach")({
  component: CoachLayout,
});

function CoachLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-card/60 p-1.5">
        {TABS.map((t) => {
          const active = (t as any).exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in oklab, var(--primary) 30%, transparent)]"
                  : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
