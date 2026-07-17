import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LineChart, LayoutGrid, Star, Settings2, Maximize2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/charts", label: "Chart", icon: LineChart, exact: true },
  { to: "/charts/layouts", label: "Layouts", icon: LayoutGrid },
  { to: "/charts/watchlists", label: "Watchlists", icon: Star },
  { to: "/charts/fullscreen", label: "Fullscreen", icon: Maximize2 },
  { to: "/charts/settings", label: "Settings", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/charts")({
  head: () => ({
    meta: [
      { title: "Charts — TradersHIVE Arena" },
      { name: "description", content: "Professional trading workspace: multi-chart, indicators, drawings, alerts and paper trading — powered by the Market Data Engine." },
    ],
  }),
  component: ChartsLayout,
});

function ChartsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isWorkspace = pathname === "/charts" || pathname === "/charts/fullscreen";
  return (
    <AppShell>
      <div className={cn("mx-auto flex w-full max-w-none flex-col gap-3 p-2 md:p-3", isWorkspace ? "h-[calc(100vh-72px)]" : "")}>
        <nav className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-card/40 p-1 backdrop-blur-md">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
                    : "text-muted-foreground hover:bg-background/40 hover:text-foreground")}>
                <Icon className="h-4 w-4" />{t.label}
              </Link>
            );
          })}
        </nav>
        <div className={cn("min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/20 backdrop-blur")}> 
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
