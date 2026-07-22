import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Film,
  LayoutGrid,
  Library,
  Play,
  Settings2,
  Target,
} from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

// Reorganized around the four core Replay Studio workflows:
// Practice · Saved Sessions · Trade Review · Performance.
// Workspace and utilities remain reachable but visually secondary.
const TABS = [
  { to: "/replay", label: "Practice", icon: LayoutGrid, exact: true },
  { to: "/replay/session", label: "Workspace", icon: Play },
  { to: "/replay/library", label: "Saved Sessions", icon: Library },
  { to: "/replay/trades", label: "Trade Review", icon: Film },
  { to: "/replay/performance", label: "Performance", icon: BarChart3 },
  { to: "/replay/challenges", label: "Challenges", icon: Target },
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
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <SegmentedTabs tabs={TABS} pathname={pathname} />
      <Outlet />
    </div>
  );
}
