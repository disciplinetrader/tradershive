import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Film, LayoutGrid, Library, Play, Settings2, Target } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

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
      <SegmentedTabs tabs={TABS} pathname={pathname} />
      <Outlet />
    </div>
  );
}
