/**
 * Replay Studio (Phase 8B) — the canonical replay surface.
 *
 * UI → ReplaySessionController → ReplayClock → runObservation →
 * canonical orders / positions / closed trades → chart projection.
 *
 * The page is a thin adapter: it renders selectors and forwards intents.
 */
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { PanelRight } from "lucide-react";
import { z } from "zod";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import { ReplayStudioProvider, useReplayStudio } from "@/components/replay/studio/context";
import { SessionHeader } from "@/components/replay/studio/SessionHeader";
import { PlaybackControls } from "@/components/replay/studio/PlaybackControls";
import { SessionSidebar } from "@/components/replay/studio/SessionSidebar";
import { StudioChart } from "@/components/replay/studio/StudioChart";
import {
  SessionCompleteNotice, SnapshotDiscardedNotice, StudioBlockedView, StudioLoading,
} from "@/components/replay/studio/StudioStates";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/replay/studio")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Replay Studio — TradersHIVE" },
      { name: "description", content: "Deterministic market replay with canonical order execution, autosave and cross-device resume." },
      { property: "og:title", content: "Replay Studio — TradersHIVE" },
      { property: "og:description", content: "Practice historical markets bar by bar with the same execution engine as live trading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

function StudioPage() {
  const { id } = useSearch({ from: "/_authenticated/replay/studio" });
  if (!id) {
    return (
      <div className="m-6 space-y-3 rounded-md border border-border/60 bg-card/40 p-8 text-center">
        <div className="font-medium">No replay selected</div>
        <div className="text-sm text-muted-foreground">Pick a session from your library or create a new one.</div>
        <div className="flex justify-center gap-2">
          <Button asChild variant="secondary"><Link to="/replay/library">Open library</Link></Button>
          <Button asChild><Link to="/replay">New replay</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <ReplayStudioProvider id={id}>
      <TooltipProvider delayDuration={300}>
        <Studio />
      </TooltipProvider>
    </ReplayStudioProvider>
  );
}

function Studio() {
  const { phase } = useReplayStudio();
  const [panelOpen, setPanelOpen] = useState(false);
  if (phase === "loading") return <StudioLoading />;
  if (phase !== "ready") return <StudioBlockedView />;

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden md:h-dvh">
      <SessionHeader />
      <SnapshotDiscardedNotice />
      <SessionCompleteNotice />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <StudioChart />
          <Button
            size="sm"
            className="absolute bottom-3 right-3 z-30 h-11 gap-1.5 rounded-full px-3 text-[11px] shadow-lg md:hidden"
            onClick={() => setPanelOpen(true)}
          >
            <PanelRight className="h-4 w-4" /> Session
          </Button>
        </div>
        <SessionSidebar className="hidden md:flex" />
      </div>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="bottom" className="h-[75dvh] p-0 md:hidden">
          <SessionSidebar className="h-full border-l-0" />
        </SheetContent>
      </Sheet>
      <PlaybackControls />
    </div>
  );
}

