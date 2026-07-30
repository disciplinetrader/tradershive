/**
 * REPLAY STUDIO X — Workspace (Phase 1).
 *
 * Chart-first terminal layout:
 *   Top toolbar (38px) → chart (edge-to-edge, ~85–90% of viewport)
 *   → floating transport → timeline → collapsed bottom dock.
 *
 * The permanent right sidebar is gone; all panels now live in the dock.
 * Replay engine, market data and trading logic are untouched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReplayProvider, useReplay } from "@/components/replay/context";
import { ReplayChart } from "@/components/replay/ReplayChart";
import { ReplaySkeleton } from "@/components/replay/ReplaySkeleton";
import { ReplayDataUnavailable, ReplayDataSourceBadge } from "@/components/replay/ReplayDataState";

import { PostSessionSummary } from "@/components/replay/PostSessionSummary";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { ReplayTopBar } from "@/components/replay/x/ReplayTopBar";
import { PracticeBanner } from "@/components/replay/x/PracticeBanner";
import { ReplayTransport } from "@/components/replay/x/ReplayTransport";
import { ReplayHudOverlay } from "@/components/replay/x/ReplayHudOverlay";
import { ReplayBottomDock } from "@/components/replay/x/ReplayBottomDock";
import { ReplayCommandPalette, ReplayShortcutSheet } from "@/components/replay/x/ReplayCommandPalette";
import { useReplayHotkeys } from "@/components/replay/x/useReplayHotkeys";
import { ChartTradingProvider } from "@/components/replay/x/chart-trading-context";
import { ChartOrderLayer } from "@/components/replay/x/ChartOrderLayer";
import { FloatingOrderTicket } from "@/components/replay/x/FloatingOrderTicket";
import { useChartTradingHotkeys } from "@/components/replay/x/useChartTradingHotkeys";
import { useReplayWorkspacePrefs } from "@/hooks/use-replay-workspace-prefs";
import { useChartKeyboard } from "@/hooks/use-chart-keyboard";
import { DrawingProvider, useDrawings } from "@/features/replay/drawings/store";
import { DrawingToolbar } from "@/features/replay/drawings/DrawingToolbar";
import type { ChartAdapter } from "@/lib/chart/adapter";

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
        <ChartTradingProvider>
          <Workspace />
        </ChartTradingProvider>
      </DrawingProvider>
    </ReplayProvider>
  );
}

function NoSession() {
  return (
    <div className="m-6 space-y-3 rounded-[4px] border border-border/60 bg-card/40 p-8 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-primary" />
      <div className="font-medium">No replay selected.</div>
      <div className="text-sm text-muted-foreground">Pick one from your library or start a new session.</div>
      <div className="flex justify-center gap-2">
        <Button asChild variant="secondary"><Link to="/replay/library">Open Library</Link></Button>
        <Button asChild><Link to="/replay">New Replay</Link></Button>
      </div>
    </div>
  );
}

function Workspace() {
  const { session, loading, candles, cursorIdx, captureScreenshot, finish, replayAgain, playing, dataUnavailable } = useReplay();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { prefs, update } = useReplayWorkspacePrefs();
  const { undo, redo } = useDrawings();

  const adapterRef = useRef<ChartAdapter | null>(null);
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const onAdapterReady = useCallback((a: ChartAdapter | null) => { adapterRef.current = a; setAdapter(a); }, []);

  const chartTrading = prefs.tradeMode === "chart";

  useChartKeyboard({
    zoomIn: () => adapterRef.current?.zoomBy?.(1.25),
    zoomOut: () => adapterRef.current?.zoomBy?.(1 / 1.25),
    panLeft: () => adapterRef.current?.panBy?.(-2),
    panRight: () => adapterRef.current?.panBy?.(2),
    undo,
    redo,
  });

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  useReplayHotkeys(toggleHelp, chartTrading);
  useChartTradingHotkeys(chartTrading);

  // ⌘K / Ctrl+K — command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Transport auto-hide while playing; always visible when paused/hovered.
  const [pointerInside, setPointerInside] = useState(false);
  const [recentActivity, setRecentActivity] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpControls = useCallback(() => {
    setRecentActivity(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRecentActivity(false), 3200);
  }, []);
  useEffect(() => {
    bumpControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [bumpControls]);
  const controlsVisible = !playing || pointerInside || recentActivity;

  // Snapshot pipeline (unchanged contract with ReplayChart).
  const takeShot = useCallback(() => {
    (window as any).__replayCaptureHandler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    window.dispatchEvent(new Event("replay-capture"));
  }, [captureScreenshot]);

  useEffect(() => {
    const handler = (dataUrl: string) => { captureScreenshot(dataUrl).catch(() => {}); };
    const onEvt = () => { (window as any).__replayCaptureHandler = handler; };
    window.addEventListener("replay-capture", onEvt);
    return () => window.removeEventListener("replay-capture", onEvt);
  }, [captureScreenshot]);

  const finishAndReview = useCallback(async () => {
    try { await finish(); } catch { /* score computed even if update fails */ }
    setSummaryOpen(true);
  }, [finish]);

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

  if (loading) return <ReplaySkeleton session={session} />;

  // No real market data → actionable error, never fabricated candles.
  if (dataUnavailable) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="rx-root flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden md:h-dvh">
          <ReplayTopBar onSnapshot={takeShot} onFinish={finishAndReview} onCommands={() => setPaletteOpen(true)} tradeMode={prefs.tradeMode} onToggleTradeMode={() => update("tradeMode", chartTrading ? "panel" : "chart")} />
          <ReplayDataUnavailable onRetry={() => window.location.reload()} />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rx-root flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden md:h-dvh">
        <ReplayTopBar onSnapshot={takeShot} onFinish={finishAndReview} onCommands={() => setPaletteOpen(true)} tradeMode={prefs.tradeMode} onToggleTradeMode={() => update("tradeMode", chartTrading ? "panel" : "chart")} />
        <div className="flex items-center gap-2 px-3 py-1"><ReplayDataSourceBadge /></div>
        <PracticeBanner sessionId={session?.id} />


        {/* Chart region — icon rail + edge-to-edge canvas */}
        <div className="flex min-h-0 flex-1">
          <DrawingToolbar />

          <div className="relative min-w-0 flex-1">
            <div
              className="absolute inset-0"
              onMouseEnter={() => setPointerInside(true)}
              onMouseLeave={() => setPointerInside(false)}
              onMouseMove={bumpControls}
            >
              <ReplayChart
                onCapture={(url) => (window as any).__replayCaptureHandler?.(url)}
                onAdapterReady={onAdapterReady}
                showPositionLines={!chartTrading}
              >
                {chartTrading ? <ChartOrderLayer adapter={adapter} /> : null}
              </ReplayChart>

              {chartTrading && prefs.ticketOpen ? (
                <FloatingOrderTicket className="absolute bottom-3 right-[76px] z-30 max-w-[calc(100%-96px)]" />
              ) : null}

              {prefs.hudVisible ? (
                <ReplayHudOverlay className="absolute left-3 top-[108px] z-20" />
              ) : null}

              <ReplayTransport visible={controlsVisible} />
            </div>
          </div>
        </div>

        {/* Timeline — hairline strip, no card */}
        <div className="rx-surface rx-line-t shrink-0 px-2" style={{ minHeight: "var(--rx-timeline-h)" }}>
          <ReplayTimeline />
        </div>

        <ReplayBottomDock
          open={prefs.dockOpen}
          tab={prefs.dockTab}
          height={prefs.dockHeight}
          onOpenChange={(v) => update("dockOpen", v)}
          onTabChange={(t) => update("dockTab", t)}
          onHeightChange={(h) => update("dockHeight", h)}
        />

        <ReplayCommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onSnapshot={takeShot}
          onFinish={finishAndReview}
          onToggleDock={() => update("dockOpen", !prefs.dockOpen)}
          onToggleHud={() => update("hudVisible", !prefs.hudVisible)}
          tradeMode={prefs.tradeMode}
          onToggleTradeMode={() => update("tradeMode", chartTrading ? "panel" : "chart")}
          onToggleTicket={() => update("ticketOpen", !prefs.ticketOpen)}
        />
        <ReplayShortcutSheet open={helpOpen} onOpenChange={setHelpOpen} chartTrading={chartTrading} />

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
