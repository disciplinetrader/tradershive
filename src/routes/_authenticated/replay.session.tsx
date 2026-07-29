import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertCircle,
  Bookmark,
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Flag,
  NotebookPen,
  Trophy,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReplayProvider, useReplay } from "@/components/replay/context";
import { ReplayChart } from "@/components/replay/ReplayChart";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { ReplayHUD } from "@/components/replay/ReplayHUD";
import { ReplaySkeleton } from "@/components/replay/ReplaySkeleton";
import { TradePanel } from "@/components/replay/TradePanel";
import { NotesPanel } from "@/components/replay/NotesPanel";
import { BookmarksPanel } from "@/components/replay/BookmarksPanel";
import { ChecklistPanel } from "@/components/replay/ChecklistPanel";
import { PostSessionSummary } from "@/components/replay/PostSessionSummary";
import { CheckpointsPanel } from "@/components/replay/CheckpointsPanel";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { useReplayWorkspacePrefs, RAIL_MIN, RAIL_MAX, RAIL_DEFAULT } from "@/hooks/use-replay-workspace-prefs";
import { useChartKeyboard } from "@/hooks/use-chart-keyboard";
import { DrawingProvider, useDrawings } from "@/features/replay/drawings/store";
import { DrawingToolbar } from "@/features/replay/drawings/DrawingToolbar";
import type { ChartAdapter } from "@/lib/chart/adapter";
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
      <DrawingProvider sessionId={id}>
        <Workspace />
      </DrawingProvider>
    </ReplayProvider>
  );
}

function NoSession() {
  return (
    <GlassCard className="m-6 p-8 text-center space-y-3">
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

const SIDE_TABS: { id: "trade" | "notes"; icon: typeof NotebookPen; label: string }[] = [
  { id: "trade", icon: Trophy, label: "Trade" },
  { id: "notes", icon: NotebookPen, label: "Journal" },
];

function Workspace() {
  const { session, loading, candles, cursorIdx, captureScreenshot, finish, replayAgain, playing } = useReplay();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { prefs, update } = useReplayWorkspacePrefs();
  const sideOpen = prefs.sideOpen;
  const sideTab = prefs.sideTab;
  const railWidth = prefs.railWidth;
  const setSideOpen = (v: boolean) => update("sideOpen", v);
  const setSideTab = (v: "trade" | "notes") => update("sideTab", v);

  const { undo, redo } = useDrawings();
  const adapterRef = useRef<ChartAdapter | null>(null);
  const onAdapterReady = useCallback((a: ChartAdapter | null) => { adapterRef.current = a; }, []);

  // TradingView-style keyboard navigation. Uses adapter's optional methods.
  useChartKeyboard({
    zoomIn: () => adapterRef.current?.zoomBy?.(1.25),
    zoomOut: () => adapterRef.current?.zoomBy?.(1 / 1.25),
    panLeft: () => adapterRef.current?.panBy?.(-2),
    panRight: () => adapterRef.current?.panBy?.(2),
    undo,
    redo,
  });

  // Floating controls — visible when paused, focused, hovered, or menu open.
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [recentActivity, setRecentActivity] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpControls = useCallback(() => {
    setRecentActivity(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRecentActivity(false), 3200);
  }, []);
  useEffect(() => { bumpControls(); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, [bumpControls]);
  const controlsVisible = !playing || pointerInside || focusInside || recentActivity;

  const takeShot = () => {
    const handler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    (window as any).__replayCaptureHandler = handler;
    window.dispatchEvent(new Event("replay-capture"));
  };

  useEffect(() => {
    const handler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    const onEvt = () => { (window as any).__replayCaptureHandler = handler; };
    window.addEventListener("replay-capture", onEvt);
    return () => window.removeEventListener("replay-capture", onEvt);
  }, [captureScreenshot]);

  const finishAndReview = async () => {
    try { await finish(); } catch { /* score computed even if update fails */ }
    setSummaryOpen(true);
  };

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!candles.length || !session) return;
    if (cursorIdx >= candles.length - 1) {
      autoOpenedRef.current = true;
      finishAndReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx, candles.length, session?.id]);

  // ── Right-rail resizing (pointer + keyboard) ─────────────────────────
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: railWidth };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX; // drag left = widen
    update("railWidth", dragRef.current.startW + delta);
  };
  const onResizeEnd = () => { dragRef.current = null; };
  const onResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    if (e.key === "ArrowLeft") { e.preventDefault(); update("railWidth", railWidth + step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); update("railWidth", railWidth - step); }
    else if (e.key === "Home") { e.preventDefault(); update("railWidth", RAIL_MAX); }
    else if (e.key === "End") { e.preventDefault(); update("railWidth", RAIL_MIN); }
  };

  if (loading) return <ReplaySkeleton session={session} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-[calc(100dvh-0px)] flex-col">
        {/* ── Compact unified toolbar ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-card/40 px-2 py-1.5 backdrop-blur sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-[3px] border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
              Replay
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold">{session?.title ?? "Untitled Session"}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {session?.market} · {session?.symbol} · {session?.timeframe} · {session?.mode}
              </div>
            </div>
          </div>
          <div className="mx-1 hidden h-6 w-px bg-border/60 md:block" />
          <div className="min-w-0 flex-1">
            <ReplayHUD />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={takeShot} className="h-7 gap-1 px-2 text-[11px]">
              <Camera className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Snapshot</span>
            </Button>
            <Button size="sm" onClick={finishAndReview} className="h-7 gap-1 px-2 text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Finish &amp; Review
            </Button>
          </div>
        </div>

        {/* ── Main: [drawing toolbar] [chart+timeline] [resizer] [rail] ─ */}
        <div
          className="grid min-h-0 flex-1 grid-cols-1"
          style={{
            gridTemplateColumns: sideOpen
              ? `36px minmax(0, 1fr) 6px ${railWidth}px`
              : `36px minmax(0, 1fr) 44px`,
          }}
        >
          <DrawingToolbar />

          <div className="relative flex min-h-0 flex-col border-r border-border/40">
            <div
              className="relative min-h-0 flex-1"
              onMouseEnter={() => setPointerInside(true)}
              onMouseLeave={() => setPointerInside(false)}
              onMouseMove={bumpControls}
            >
              <div className="absolute inset-0">
                <ReplayChart
                  onCapture={(url) => (window as any).__replayCaptureHandler?.(url)}
                  onAdapterReady={onAdapterReady}
                />
              </div>

              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-2 transition-opacity duration-300 motion-reduce:transition-none",
                  controlsVisible ? "opacity-100" : "opacity-0",
                )}
                onFocusCapture={() => setFocusInside(true)}
                onBlurCapture={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setFocusInside(false);
                }}
              >
                <div className="pointer-events-auto max-w-[min(96%,980px)] w-full shadow-2xl">
                  <div className="rounded-2xl border border-border/60 bg-background/85 backdrop-blur-lg">
                    <ReplayControls />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 bg-card/40 px-2 py-1">
              <ReplayTimeline />
            </div>
          </div>

          {/* Resize handle — only visible when rail is expanded */}
          {sideOpen ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Replay side panel"
              aria-valuemin={RAIL_MIN}
              aria-valuemax={RAIL_MAX}
              aria-valuenow={railWidth}
              tabIndex={0}
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              onPointerCancel={onResizeEnd}
              onDoubleClick={() => update("railWidth", RAIL_DEFAULT)}
              onKeyDown={onResizeKey}
              className="group hidden xl:flex cursor-col-resize items-center justify-center bg-border/40 hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
            >
              <div className="h-8 w-0.5 rounded bg-muted-foreground/40 group-hover:bg-primary/70" />
            </div>
          ) : null}

          {/* Right rail */}
          {sideOpen ? (
            <div className="relative flex min-h-0 flex-col bg-card/30">
              <button
                onClick={() => setSideOpen(false)}
                className="absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Collapse side panel"
                title="Collapse"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <Tabs
                value={sideTab}
                onValueChange={(v) => setSideTab(v as typeof sideTab)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="border-b border-border/40 px-2 pt-1 pr-9">
                  <TabsList className="grid w-full grid-cols-2 h-8">
                    {SIDE_TABS.map((t) => (
                      <TabsTrigger key={t.id} value={t.id} className="text-[11px] gap-1">
                        <t.icon className="h-3 w-3" /> {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  {sideTab === "trade" && <TradePanel />}
                  {sideTab === "notes" && (
                    <div className="space-y-3">
                      <SectionHeader icon={NotebookPen} label="Notes" />
                      <NotesPanel />
                      <SectionHeader icon={Bookmark} label="Bookmarks" />
                      <BookmarksPanel />
                      <SectionHeader icon={Flag} label="Checkpoints" />
                      <CheckpointsPanel />
                      <SectionHeader icon={CheckSquare} label="Checklist" />
                      <ChecklistPanel />
                    </div>
                  )}
                </div>
              </Tabs>
            </div>
          ) : (
            <div className="hidden xl:flex flex-col items-center gap-2 border-l border-border/40 bg-card/20 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSideOpen(true)}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="Expand side panel"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Expand panel</TooltipContent>
              </Tooltip>
              <div className="my-1 h-px w-6 bg-border/60" />
              {SIDE_TABS.map((t) => (
                <Tooltip key={t.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setSideTab(t.id); setSideOpen(true); }}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground",
                        sideTab === t.id && "bg-muted text-foreground",
                      )}
                      aria-label={t.label}
                    >
                      <t.icon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">{t.label}</TooltipContent>
                </Tooltip>
              ))}
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
