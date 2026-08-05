import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Dumbbell,
  Film,
  History,
  Home,
  Library,
  Play,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

// Natural trading workflow ordering: Home → Trading Workspace → Saved
// Sessions → Trade Review → Performance → Settings. Practice keeps its own
// section but is entered from here now that it left the main sidebar.
const TABS = [
  { to: "/replay", label: "Home", icon: Home, exact: true },
  { to: "/replay/studio", label: "Trading Workspace", icon: Play },
  { to: "/replay/prop-firm", label: "Prop Firm Challenges", icon: Target },
  { to: "/replay/library", label: "Saved Sessions", icon: Library },
  { to: "/replay/trades", label: "Trade Review", icon: Film },
  { to: "/replay/history", label: "History", icon: History },
  { to: "/replay/improvement", label: "Improvement", icon: TrendingUp },
  { to: "/replay/performance", label: "Performance", icon: BarChart3 },
  { to: "/practice", label: "Practice", icon: Dumbbell },
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
  // The studio is a full-bleed terminal: no tab chrome, no max width.
  if (pathname === "/replay/studio") return <Outlet />;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <SegmentedTabs tabs={TABS} pathname={pathname} />
      <Outlet />
    </div>
  );
}

