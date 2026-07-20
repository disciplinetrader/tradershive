import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookMarked, FolderKanban, LayoutGrid, Library, Rocket, Settings2, Share2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/strategies", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/strategies/library", label: "Library", icon: Library },
  { to: "/strategies/create", label: "Create", icon: Rocket },
  { to: "/strategies/templates", label: "Templates", icon: Sparkles },
  { to: "/strategies/playbooks", label: "Playbooks", icon: BookMarked },
  { to: "/strategies/backtests", label: "Backtests", icon: Zap },
  { to: "/strategies/shared", label: "Shared", icon: Share2 },
  { to: "/strategies/settings", label: "Settings", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/strategies")({
  head: () => ({
    meta: [
      { title: "Strategies — TradersHIVE Arena" },
      { name: "description", content: "Build, organize and improve your trading strategies and playbooks." },
    ],
  }),
  component: StrategiesLayout,
});

function StrategiesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <nav className="flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-card/60 p-1.5">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition",
                active ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
                  : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
              )}>
              <Icon className="h-4 w-4" />{t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
