import { useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertCircle,
  Bookmark,
  Camera,
  CheckCircle2,
  CheckSquare,
  Flag,
  Focus,
  Maximize2,
  Minimize2,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReplayProvider, useReplay } from "@/components/replay/context";
import { ReplayChart } from "@/components/replay/ReplayChart";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { ReplayHUD } from "@/components/replay/ReplayHUD";
import { TradePanel } from "@/components/replay/TradePanel";
import { NotesPanel } from "@/components/replay/NotesPanel";
import { BookmarksPanel } from "@/components/replay/BookmarksPanel";
import { ChecklistPanel } from "@/components/replay/ChecklistPanel";
import { ScoreCard } from "@/components/replay/ScoreCard";
import { AiReviewPanel } from "@/components/replay/AiReviewPanel";
import { PostSessionSummary } from "@/components/replay/PostSessionSummary";
import { CheckpointsPanel } from "@/components/replay/CheckpointsPanel";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { cn } from "@/lib/utils";

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
  const { session, loading, captureScreenshot, finish, replayAgain, playing } = useReplay();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [sideTab, setSideTab] = useState<"trade" | "notes" | "review">("trade");

  const takeShot = () => {
    const handler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    (window as any).__replayCaptureHandler = handler;
    window.dispatchEvent(new Event("replay-capture"));
  };

  const finishAndReview = async () => {
    try { await finish(); } catch { /* score computed even if update fails */ }
    setSummaryOpen(true);
  };

  if (loading) return <div className="glass rounded-3xl h-[600px] animate-pulse" />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        {/* ── Header: session identity + mode badge + primary actions ─────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-border/60 bg-card/40 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                playing
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-primary/40 bg-primary/10 text-primary",
              )}
              aria-label="Replay mode"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full bg-current", playing && "animate-pulse")} />
              Replay Mode
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{session?.title ?? "Untitled Session"}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {session?.market} · {session?.symbol} · {session?.timeframe} · {session?.mode}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={focusMode ? "default" : "ghost"}
                  onClick={() => setFocusMode((v) => !v)}
                  className="h-8"
                >
                  {focusMode ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Focus className="mr-1.5 h-3.5 w-3.5" />}
                  {focusMode ? "Exit Focus" : "Focus"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hide side panels for a distraction-free chart</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="ghost" onClick={takeShot} className="h-8">
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              Snapshot
            </Button>
            <Button size="sm" variant="secondary" asChild className="h-8">
              <Link to="/ai/dashboard"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Coach</Link>
            </Button>
            <Button size="sm" onClick={finishAndReview} className="h-8">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Finish & Review
            </Button>
          </div>
        </div>

        <ReplayHUD />

        {/* ── Main grid: chart + controls | side workspace ───────────────────── */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            focusMode ? "" : "xl:grid-cols-[minmax(0,1fr)_360px]",
          )}
        >
          <div className="space-y-3">
            <div className={cn(focusMode ? "h-[720px]" : "h-[560px]")}>
              <ReplayChart onCapture={(url) => (window as any).__replayCaptureHandler?.(url)} />
            </div>
            <ReplayControls />
            <ReplayTimeline />
          </div>

          {!focusMode && (
            <div className="space-y-3">
              <Tabs value={sideTab} onValueChange={(v) => setSideTab(v as typeof sideTab)}>
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="trade" className="text-[11px] gap-1">
                    <Maximize2 className="h-3 w-3" /> Trade
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="text-[11px] gap-1">
                    <NotebookPen className="h-3 w-3" /> Journal
                  </TabsTrigger>
                  <TabsTrigger value="review" className="text-[11px] gap-1">
                    <Trophy className="h-3 w-3" /> Review
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="trade" className="mt-3 space-y-3">
                  <TradePanel />
                </TabsContent>

                <TabsContent value="notes" className="mt-3 space-y-3">
                  <SectionHeader icon={NotebookPen} label="Notes" />
                  <NotesPanel />
                  <SectionHeader icon={Bookmark} label="Bookmarks" />
                  <BookmarksPanel />
                  <SectionHeader icon={Flag} label="Checkpoints" />
                  <CheckpointsPanel />
                  <SectionHeader icon={CheckSquare} label="Checklist" />
                  <ChecklistPanel />
                </TabsContent>

                <TabsContent value="review" className="mt-3 space-y-3">
                  <SectionHeader icon={ShieldCheck} label="Score" />
                  <ScoreCard />
                  {session ? <AiReviewPanel sessionId={session.id} /> : null}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {session ? (
          <PostSessionSummary
            sessionId={session.id}
            open={summaryOpen}
            onOpenChange={setSummaryOpen}
            onReplayAgain={() => { replayAgain().catch(() => {}); setSummaryOpen(false); }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}
