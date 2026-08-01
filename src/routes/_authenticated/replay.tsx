import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Film,
  Home,
  Library,
  Play,
  Settings2,
} from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

// Natural trading workflow ordering: Home → Trading Workspace → Saved
// Sessions → Trade Review → Performance → Settings. Challenge Mode lives
// elsewhere in the platform and no longer interrupts the core backtesting
// workflow.
const TABS = [
  { to: "/replay", label: "Home", icon: Home, exact: true },
  { to: "/replay/session", label: "Trading Workspace", icon: Play },
  { to: "/replay/library", label: "Saved Sessions", icon: Library },
  { to: "/replay/trades", label: "Trade Review", icon: Film },
  { to: "/replay/performance", label: "Performance", icon: BarChart3 },
  { to: "/replay/settings", label: "Settings", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/replay")({
  head: () => ({
    meta: [
      { title: "Replay Studio — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Professional trading practice environment: replay, review, bookmark and master execution on historical market data.",
      },
    ],
  }),
  component: ReplayLayout,
});

function ReplayLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const immersive = pathname === "/replay/studio";
  if (immersive) {
    // Trading Workspace 2.0: no chrome, no max-width — chart is the hero.
    return <Outlet />;
  }
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <SegmentedTabs tabs={TABS} pathname={pathname} />
      <Outlet />
    </div>
  );
}
