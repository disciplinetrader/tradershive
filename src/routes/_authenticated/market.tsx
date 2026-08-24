import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, CalendarClock, LayoutGrid, Radio, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/market", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/market/symbols", label: "Symbols", icon: Search },
  { to: "/market/alerts", label: "Alerts", icon: Bell },
  { to: "/market/sessions", label: "Sessions", icon: Radio },
  { to: "/market/economic-calendar", label: "Calendar", icon: CalendarClock },
  { to: "/market/providers", label: "Providers", icon: Activity },
  { to: "/market/settings", label: "Settings", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "Market Data — TradersHIVE Arena" },
      { name: "description", content: "Unified market data engine powering charts, replay, statistics, AI coach and paper trading." },
    ],
  }),
  component: MarketLayout,
});

function MarketLayout() {
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
