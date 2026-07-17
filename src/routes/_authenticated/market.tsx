import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, LayoutGrid, Radio, Search, Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/market", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/market/symbols", label: "Symbols", icon: Search },
  { to: "/market/alerts", label: "Alerts", icon: Bell },
  { to: "/market/sessions", label: "Sessions", icon: Radio },
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
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 space-y-4">
        <nav className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-card/40 p-1.5 backdrop-blur-md">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
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
    </AppShell>
  );
}
