import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Film, LayoutGrid, Library, Play, Settings2, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/replay", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/replay/session", label: "Workspace", icon: Play },
  { to: "/replay/trades", label: "Trades", icon: Film },
  { to: "/replay/library", label: "Library", icon: Library },
  { to: "/replay/challenges", label: "Challenges", icon: Target },
  { to: "/replay/settings", label: "Settings", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/replay")({
  head: () => ({
    meta: [
      { title: "Replay — TradersHIVE Arena" },
      { name: "description", content: "Chart, Trade and Session Replay for deliberate practice on historical market data." },
    ],
  }),
  component: ReplayLayout,
});

function ReplayLayout() {
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
                active ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in oklab, var(--primary) 30%, transparent)]"
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
