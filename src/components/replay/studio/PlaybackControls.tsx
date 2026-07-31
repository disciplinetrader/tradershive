/**
 * Phase 8B · transport bar. Every control delegates to the controller, which
 * delegates to the clock. No timers and no execution logic live here.
 */
import { useEffect } from "react";
import { ChevronRight, FastForward, Pause, Play, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_SPEED, MIN_SPEED } from "@/lib/replay/session/clock";
import { useReplayStudio } from "./context";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 10, 25, 50, 100];

export function PlaybackControls() {
  const { view, toggle, step, stepCandle, skipCandles, setSpeed } = useReplayStudio();

  // Keyboard: space = play/pause, → = one bar, shift+→ = 10 bars.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? skipCandles(10) : stepCandle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, stepCandle, skipCandles]);

  if (!view) return null;
  const t = view.transport;
  const playing = t.status === "playing";

  return (
    <div className="flex items-center gap-2 border-t border-border/60 bg-card/60 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant={playing ? "secondary" : "default"} onClick={toggle} disabled={!t.canPlay && !t.canPause}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Play / pause (Space)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" onClick={step} disabled={!t.canStep}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Step one observation</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" onClick={stepCandle} disabled={!t.canStep}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Step one bar (→)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" onClick={() => skipCandles(10)} disabled={!t.canStep}>
            <FastForward className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Skip 10 bars — every observation still runs (⇧→)</TooltipContent>
      </Tooltip>

      <div className="ml-2 flex items-center gap-1">
        {SPEEDS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={t.speed === s ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setSpeed(s)}
          >
            {s}x
          </Button>
        ))}
      </div>

      <div className="ml-3 flex min-w-[220px] flex-1 items-center gap-3">
        <Slider
          value={[Math.round(t.progress * 1000)]}
          min={0}
          max={1000}
          step={1}
          disabled
          aria-label="Session progress"
        />
        <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          bar {Math.min(t.candleIndex + 1, t.barCount).toLocaleString()}/{t.barCount.toLocaleString()} ·{" "}
          {Math.round(t.progress * 100)}%
        </span>
      </div>

      <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
        {new Date(t.marketTime).toISOString().replace("T", " ").slice(0, 16)} UTC
      </span>
      <span className="sr-only">
        Speed range {MIN_SPEED}x to {MAX_SPEED}x
      </span>
    </div>
  );
}
