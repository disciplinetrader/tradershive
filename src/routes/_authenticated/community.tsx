import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { Bookmark, Compass, Flame, Home, Users } from "lucide-react";

const TABS = [
  { to: "/community", label: "Home", icon: Home, exact: true },
  { to: "/community/explore", label: "Explore", icon: Compass },
  { to: "/community/following", label: "Following", icon: Users },
  { to: "/community/trending", label: "Trending", icon: Flame },
  { to: "/community/bookmarks", label: "Bookmarks", icon: Bookmark },
];

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — TradersHIVE Arena" },
      { name: "description", content: "Share trade ideas, journals, strategies, and battle results with the trading community." },
    ],
  }),
  component: Layout,
});

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 space-y-4">
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
                <Icon className="h-4 w-4" /> {t.label}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </AppShell>
  );
}
