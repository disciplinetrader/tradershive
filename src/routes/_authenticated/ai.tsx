import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";
import { AiAvatar } from "@/components/ai/AiAvatar";
import { cn } from "@/lib/utils";
import { BookMarked, BrainCog, Gauge, History, MessageSquare, PlaySquare, Settings2, Sparkles } from "lucide-react";

const TABS = [
  { to: "/ai/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/ai/trade-review", label: "Trade Review", icon: PlaySquare },
  { to: "/ai/performance", label: "Performance", icon: Sparkles },
  { to: "/ai/psychology", label: "Psychology", icon: BrainCog },
  { to: "/ai/playbooks", label: "Playbooks", icon: BookMarked },
  { to: "/ai/chat", label: "Coach Chat", icon: MessageSquare },
  { to: "/ai/history", label: "History", icon: History },
  { to: "/ai/settings", label: "Settings", icon: Settings2 },
] as const;

export const Route = createFileRoute("/_authenticated/ai")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/ai") throw redirect({ to: "/ai/dashboard" });
  },
  component: AiLayout,
});

function AiLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AiAvatar size={56} active />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">AI Trading Coach</p>
            <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
              Your personal <span className="text-gradient">edge engine</span>
            </h1>
          </div>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-card/60 p-1.5">
        {TABS.map((t) => {
          const active = pathname === t.to;
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
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
