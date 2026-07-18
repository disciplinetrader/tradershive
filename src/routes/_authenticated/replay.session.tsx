import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AlertCircle, Camera, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ReplayProvider, useReplay } from "@/components/replay/context";
import { ReplayChart } from "@/components/replay/ReplayChart";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { TradePanel } from "@/components/replay/TradePanel";
import { NotesPanel } from "@/components/replay/NotesPanel";
import { BookmarksPanel } from "@/components/replay/BookmarksPanel";
import { ChecklistPanel } from "@/components/replay/ChecklistPanel";
import { ScoreCard } from "@/components/replay/ScoreCard";
import { AiReviewPanel } from "@/components/replay/AiReviewPanel";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/replay/session")({
  validateSearch: (s) => searchSchema.parse(s),
  component: SessionPage,
});

function SessionPage() {
  const { id } = useSearch({ from: "/_authenticated/replay/session" });
  if (!id) return <NoSession />;
  return (
    <ReplayProvider id={id}>
      <Workspace />
    </ReplayProvider>
  );
}

function NoSession() {
  return (
    <GlassCard className="p-8 text-center space-y-3">
      <AlertCircle className="mx-auto h-8 w-8 text-primary" />
      <div className="font-medium">No replay selected.</div>
      <div className="text-sm text-muted-foreground">Pick one from your library or start a new session.</div>
      <div className="flex justify-center gap-2">
        <Button asChild variant="secondary"><Link to="/replay/library">Open Library</Link></Button>
        <Button asChild><Link to="/replay">New Replay</Link></Button>
      </div>
    </GlassCard>
  );
}

function Workspace() {
  const { session, loading, captureScreenshot } = useReplay();

  const takeShot = () => {
    // ReplayChart listens for this event and calls onCapture
    const handler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    (window as any).__replayCaptureHandler = handler;
    window.dispatchEvent(new Event("replay-capture"));
  };

  if (loading) return <div className="glass rounded-3xl h-[600px] animate-pulse" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold">{session?.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {session?.market} · {session?.symbol} · {session?.timeframe} · {session?.mode}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={takeShot}><Camera className="mr-2 h-3.5 w-3.5" />Screenshot</Button>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/ai/dashboard"><Sparkles className="mr-2 h-3.5 w-3.5" />Coach</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="h-[520px]">
            <ReplayChart onCapture={(url) => (window as any).__replayCaptureHandler?.(url)} />
          </div>
          <ReplayControls />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NotesPanel />
            <BookmarksPanel />
          </div>
        </div>
        <div className="space-y-3">
          <TradePanel />
          <ChecklistPanel />
          <ScoreCard />
          {session ? <AiReviewPanel sessionId={session.id} /> : null}
        </div>
      </div>
    </div>
  );
}
