import { createFileRoute, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { AiAvatar } from "@/components/ai/AiAvatar";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { BookMarked, BrainCog, Gauge, GraduationCap, History, MessageSquare, PlaySquare, Settings2, Sparkles } from "lucide-react";

const TABS = [
  { to: "/ai/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/ai/coach", label: "Replay Coach", icon: GraduationCap },
  { to: "/ai/trade-review", label: "Trade Review", icon: PlaySquare },
  { to: "/ai/performance", label: "Performance", icon: Sparkles },
  { to: "/ai/psychology", label: "Psychology", icon: BrainCog },
  { to: "/ai/playbooks", label: "Playbooks", icon: BookMarked },
  { to: "/ai/chat", label: "Coach Chat", icon: MessageSquare },
  { to: "/ai/history", label: "History", icon: History },
  { to: "/ai/settings", label: "Settings", icon: Settings2 },
] as const;

export const Route = createFileRoute("/_authenticated/ai")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/ai") throw redirect({ to: "/ai/dashboard" });
  },
  component: AiLayout,
});

function AiLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AiAvatar size={56} active />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">AI Trading Coach</p>
            <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
              Your personal <span className="text-gradient">edge engine</span>
            </h1>
          </div>
        </div>
      </header>

      <SegmentedTabs
        tabs={TABS.map((t) => ({ to: t.to, label: t.label, icon: t.icon }))}
        pathname={pathname}
        className="mb-6"
      />

      <Outlet />
    </div>
  );
}
