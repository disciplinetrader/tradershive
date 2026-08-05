import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { LeaderboardHero } from "@/components/social/LeaderboardHero";
import { Button } from "@/components/ui/button";
import { CustomizeProfileDialog } from "@/components/social/CustomizeProfileDialog";
import { CompareDialog } from "@/components/social/CompareDialog";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Settings2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/battle-arena/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — TradersHIVE Arena" }] }),
  component: LeaderboardLayout,
});

const TABS = [
  { to: "/leaderboard", label: "Overview", exact: true },
  { to: "/leaderboard/global", label: "Global" },
  { to: "/leaderboard/friends", label: "Friends" },
  { to: "/leaderboard/country", label: "Country" },
  { to: "/leaderboard/league", label: "League" },
];

function LeaderboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openCustomize, setOpenCustomize] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaderboards"
        description="Real-time rankings from actual trading performance."
        actions={
          <>
            <CompareDialog />
            <Button variant="outline" size="sm" onClick={() => setOpenCustomize(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Customize
            </Button>
          </>
        }
      />

      <LeaderboardHero />

      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-surface/40 p-1">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "shrink-0 rounded-xl px-4 py-1.5 text-sm font-medium transition",
                active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
        <Link to="/users" className="ml-auto shrink-0 rounded-xl px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          Discover users →
        </Link>
      </div>

      <Outlet />

      <CustomizeProfileDialog open={openCustomize} onOpenChange={setOpenCustomize} />
    </div>
  );
}
