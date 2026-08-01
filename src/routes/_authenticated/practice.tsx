import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { Dumbbell, Home, Target, TrendingUp } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

const TABS = [
  { to: "/practice", label: "Launcher", icon: Home, exact: true },
  { to: "/practice/drills", label: "Drills", icon: Dumbbell },
  { to: "/practice/challenges", label: "Challenges", icon: Target },
  { to: "/practice/skills", label: "Skills", icon: TrendingUp },
];

export const Route = createFileRoute("/_authenticated/practice")({
  head: () => ({
    meta: [
      { title: "Practice — TradersHIVE" },
      {
        name: "description",
        content:
          "Structured trading practice: guided drills, surprise sessions and rule-based challenges on the canonical replay engine.",
      },
    ],
  }),
  component: PracticeLayout,
});

function PracticeLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <SegmentedTabs tabs={TABS} pathname={pathname} />
      <Outlet />
    </div>
  );
}
