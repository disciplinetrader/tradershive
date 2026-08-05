import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/battle-arena")({
  head: () => ({
    meta: [
      { title: "Battle Arena — TradersHIVE" },
      { name: "description", content: "Competitive paper trading matches with real-time market data, live standings and HIVE Rating rewards." },
    ],
  }),
  component: BattleArenaLayout,
});

function BattleArenaLayout() {
  const { pathname } = useRouterState({ select: (s) => s.location });

  const tabs = [
    { label: "Overview", to: "/battle-arena" },
    { label: "Tournaments", to: "/championship" },
    { label: "Leaderboards", to: "/leaderboard" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 space-y-6">
      <nav className="flex items-center gap-1 border-b border-border/40 pb-px">
        {tabs.map((tab) => {
          const isActive = pathname === tab.to || (tab.to === "/battle-arena" && pathname === "/battle-arena/");
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "relative px-4 py-2.5 text-sm font-bold transition-all hover:text-primary",
                isActive 
                  ? "text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary" 
                  : "text-muted-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
